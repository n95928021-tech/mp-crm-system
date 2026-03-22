const axios = require('axios');
const prisma = require('../config/database');
const logger = require('../utils/logger');

const getConversationTypeFromRequest = (req) => {
  return req.conversationType || req.query.conversationType || 'CHAT';
};

const compareChatsForList = (a, b) => {
  const aTime = a.lastMessageAt ? new Date(a.lastMessageAt).getTime() : 0;
  const bTime = b.lastMessageAt ? new Date(b.lastMessageAt).getTime() : 0;
  if (bTime !== aTime) return bTime - aTime;

  const aKey = a.customerExternalId || '';
  const bKey = b.customerExternalId || '';

  if (/^\d+$/.test(aKey) && /^\d+$/.test(bKey)) {
    const aSort = BigInt(aKey);
    const bSort = BigInt(bKey);
    if (aSort > bSort) return -1;
    if (aSort < bSort) return 1;
  }

  return 0;
};

const ensureChatAccess = async (chatId, user, conversationType = 'CHAT') => {
  const chat = await prisma.chat.findUnique({
    where: { id: chatId },
    include: {
      cabinet: { include: { marketplace: true } },
      assignedManager: {
        select: { id: true, firstName: true, lastName: true },
      },
    },
  });

  if (!chat) {
    return { error: { status: 404, body: { success: false, error: 'Чат не найден' } } };
  }

  if (chat.conversationType !== conversationType) {
    return { error: { status: 404, body: { success: false, error: 'Диалог не найден' } } };
  }

  if (user.role === 'ADMIN') {
    return { chat };
  }

  const access = await prisma.userCabinet.findUnique({
    where: {
      userId_cabinetId: {
        userId: user.id,
        cabinetId: chat.cabinetId,
      },
    },
  });

  if (!access) {
    return { error: { status: 403, body: { success: false, error: 'Нет доступа к данному чату' } } };
  }

  return { chat };
};

// GET /chats — список чатов с фильтрацией
exports.getChats = async (req, res, next) => {
  try {
    const conversationType = getConversationTypeFromRequest(req);
    const { marketplaceId, cabinetId, status, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = { conversationType };
    if (conversationType === 'CHAT') {
      where.externalChatId = { not: null };
    }

    // Фильтр по кабинету
    if (cabinetId) {
      where.cabinetId = cabinetId;
    } else if (marketplaceId) {
      where.cabinet = { marketplaceId };
    }

    // Фильтр по статусу
    if (status) where.status = status;

    // Для менеджера — только доступные кабинеты
    if (req.user.role !== 'ADMIN') {
      const userCabinets = await prisma.userCabinet.findMany({
        where: { userId: req.user.id },
        select: { cabinetId: true },
      });
      const cabinetIds = userCabinets.map((uc) => uc.cabinetId);
      where.cabinetId = where.cabinetId
        ? { in: [where.cabinetId].filter((id) => cabinetIds.includes(id)) }
        : { in: cabinetIds };
    }

    const [allChats, total] = await Promise.all([
      prisma.chat.findMany({
        where,
        include: {
          cabinet: {
            include: { marketplace: true },
          },
          assignedManager: {
            select: { id: true, firstName: true, lastName: true },
          },
        },
        orderBy: { lastMessageAt: 'desc' },
      }),
      prisma.chat.count({ where }),
    ]);

    // Добавляем timer color к каждому чату
    const now = Date.now();
    const enrichedChats = allChats.map((chat) => {
      const elapsed = chat.lastMessageAt
        ? (now - new Date(chat.lastMessageAt).getTime()) / 1000
        : 999;
      let timerColor = 'red';
      if (elapsed < 120) timerColor = 'green';
      else if (elapsed < 300) timerColor = 'yellow';

      return { ...chat, timerColor, elapsedSeconds: Math.round(elapsed) };
    }).sort(compareChatsForList).slice(skip, skip + parseInt(limit));

    res.json({
      success: true,
      data: enrichedChats,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /chats/:chatId — один чат с сообщениями
exports.getChatById = async (req, res, next) => {
  try {
    const conversationType = getConversationTypeFromRequest(req);
    const accessResult = await ensureChatAccess(req.params.chatId, req.user, conversationType);
    if (accessResult.error) {
      return res.status(accessResult.error.status).json(accessResult.error.body);
    }

    const chat = await prisma.chat.findUnique({
      where: { id: req.params.chatId },
      include: {
        cabinet: { include: { marketplace: true } },
        assignedManager: {
          select: { id: true, firstName: true, lastName: true },
        },
        messages: {
          orderBy: { createdAt: 'asc' },
          include: {
            sender: {
              select: { id: true, firstName: true, lastName: true },
            },
          },
        },
      },
    });

    if (
      chat &&
      chat.messages.length === 0 &&
      chat.lastMessageText &&
      chat.externalChatId?.startsWith('ozon-')
    ) {
      chat.messages = [{
        id: `preview-${chat.id}`,
        chatId: chat.id,
        senderType: 'CUSTOMER',
        senderId: null,
        text: chat.lastMessageText,
        messageType: 'TEXT',
        mediaUrl: null,
        thumbnailUrl: null,
        mediaMimeType: null,
        externalMsgId: null,
        isRead: true,
        createdAt: chat.lastMessageAt || chat.updatedAt || chat.createdAt,
        sender: null,
      }];
    }

    res.json({ success: true, data: chat });
  } catch (error) {
    next(error);
  }
};

// POST /chats/:chatId/messages — отправить сообщение
exports.sendMessage = async (req, res, next) => {
  try {
    const conversationType = getConversationTypeFromRequest(req);
    const { chatId } = req.params;
    const { text } = req.body;

    const accessResult = await ensureChatAccess(chatId, req.user, conversationType);
    if (accessResult.error) {
      return res.status(accessResult.error.status).json(accessResult.error.body);
    }
    const { chat } = accessResult;

    // ── Отправляем на маркетплейс (если есть externalChatId и ключи) ──
    let marketplaceSent = false;
    if (chat.externalChatId && chat.cabinet) {
      try {
        const { getSyncService } = require('../services/marketplaceSync');
        const svc = getSyncService(chat.cabinet.marketplace.slug);
        if (svc) {
          marketplaceSent = await svc.sendMessage(chat.cabinet, chat.externalChatId, text, { chat });
          if (!marketplaceSent) {
            logger.warn(`Не удалось отправить на ${chat.cabinet.marketplace.slug}: чат ${chatId}`);
          }
        }
      } catch (mpErr) {
        logger.error(`Ошибка отправки на маркетплейс: ${mpErr.message}`);
      }
    }

    // ── Сохраняем в БД ──
    const message = await prisma.chatMessage.create({
      data: {
        chatId,
        senderType: 'MANAGER',
        senderId: req.user.id,
        text,
        messageType: 'TEXT',
      },
      include: {
        sender: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    await prisma.chat.update({
      where: { id: chatId },
      data: {
        lastMessageAt: new Date(),
        lastMessageText: text,
        unreadCount: 0,
      },
    });

    // ── WebSocket ──
    const io = req.app.get('io');
    if (io) io.to(`chat:${chatId}`).emit('new_message', { chatId, message });

    logger.info(`Сообщение отправлено в чат ${chatId} (маркетплейс: ${marketplaceSent})`, { userId: req.user.id });

    res.status(201).json({ success: true, data: message, marketplaceSent });
  } catch (error) {
    next(error);
  }
};

// PATCH /chats/:chatId/read — пометить как прочитанное
exports.markAsRead = async (req, res, next) => {
  try {
    const conversationType = getConversationTypeFromRequest(req);
    const { chatId } = req.params;
    const accessResult = await ensureChatAccess(chatId, req.user, conversationType);
    if (accessResult.error) {
      return res.status(accessResult.error.status).json(accessResult.error.body);
    }

    await prisma.chatMessage.updateMany({
      where: { chatId, isRead: false, senderType: 'CUSTOMER' },
      data: { isRead: true },
    });

    await prisma.chat.update({
      where: { id: chatId },
      data: { unreadCount: 0 },
    });

    res.json({ success: true, message: 'Чат помечен как прочитанный' });
  } catch (error) {
    next(error);
  }
};

// PATCH /chats/:chatId/assign — назначить менеджера
exports.assignManager = async (req, res, next) => {
  try {
    const conversationType = getConversationTypeFromRequest(req);
    const { chatId } = req.params;
    const { managerId } = req.body;
    const accessResult = await ensureChatAccess(chatId, req.user, conversationType);
    if (accessResult.error) {
      return res.status(accessResult.error.status).json(accessResult.error.body);
    }

    const chat = await prisma.chat.update({
      where: { id: chatId },
      data: { assignedManagerId: managerId },
      include: {
        assignedManager: {
          select: { id: true, firstName: true, lastName: true },
        },
      },
    });

    res.json({ success: true, data: chat });
  } catch (error) {
    next(error);
  }
};

// PATCH /chats/:chatId/status — изменить статус чата
exports.updateStatus = async (req, res, next) => {
  try {
    const conversationType = getConversationTypeFromRequest(req);
    const { chatId } = req.params;
    const { status } = req.body;
    const accessResult = await ensureChatAccess(chatId, req.user, conversationType);
    if (accessResult.error) {
      return res.status(accessResult.error.status).json(accessResult.error.body);
    }

    const chat = await prisma.chat.update({
      where: { id: chatId },
      data: { status },
    });

    res.json({ success: true, data: chat });
  } catch (error) {
    next(error);
  }
};

// GET /chats/:chatId/messages/:messageId/media — проксирование вложения
exports.getMessageMedia = async (req, res, next) => {
  try {
    const conversationType = getConversationTypeFromRequest(req);
    const { chatId, messageId } = req.params;
    const accessResult = await ensureChatAccess(chatId, req.user, conversationType);
    if (accessResult.error) {
      return res.status(accessResult.error.status).json(accessResult.error.body);
    }

    const message = await prisma.chatMessage.findFirst({
      where: {
        id: messageId,
        chatId,
      },
      include: {
        chat: {
          include: {
            cabinet: {
              include: {
                marketplace: true,
              },
            },
          },
        },
      },
    });

    if (!message) {
      return res.status(404).json({ success: false, error: 'Сообщение не найдено' });
    }

    const mediaUrl = message.mediaUrl || null;
    if (!mediaUrl) {
      return res.status(404).json({ success: false, error: 'У сообщения нет вложения' });
    }

    const marketplaceSlug = message.chat?.cabinet?.marketplace?.slug;
    if (marketplaceSlug !== 'ozon' && marketplaceSlug !== 'wb') {
      return res.redirect(mediaUrl);
    }

    const cabinet = message.chat?.cabinet;
    let headers = { Accept: '*/*' };
    if (marketplaceSlug === 'ozon') {
      if (!cabinet?.apiClientId || !cabinet?.apiKey) {
        return res.status(400).json({ success: false, error: 'Для кабинета не настроены API-ключи' });
      }
      headers = {
        ...headers,
        'Client-Id': cabinet.apiClientId,
        'Api-Key': cabinet.apiKey,
      };
    } else if (marketplaceSlug === 'wb') {
      if (!cabinet?.apiToken) {
        return res.status(400).json({ success: false, error: 'Для кабинета WB не настроен API-токен' });
      }
      headers = {
        ...headers,
        Authorization: cabinet.apiToken,
      };
    }

    const upstream = await axios.get(mediaUrl, {
      responseType: 'stream',
      timeout: 20000,
      headers,
      validateStatus: () => true,
    });

    if (upstream.status >= 400) {
      let details = '';
      try {
        if (upstream.data && typeof upstream.data.read === 'function') {
          const chunks = [];
          for await (const chunk of upstream.data) {
            chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
            if (Buffer.concat(chunks).length > 2048) break;
          }
          details = Buffer.concat(chunks).toString('utf8');
        }
      } catch (_error) {
        details = '';
      }

      logger.warn(`Не удалось загрузить ${marketplaceSlug} media ${mediaUrl}: ${upstream.status} ${details}`);
      return res.status(upstream.status).json({
        success: false,
        error: `Не удалось загрузить вложение из ${marketplaceSlug === 'wb' ? 'Wildberries' : 'Ozon'}`,
      });
    }

    const contentType = upstream.headers['content-type'] || message.mediaMimeType || 'application/octet-stream';
    const contentLength = upstream.headers['content-length'];
    const contentDisposition = upstream.headers['content-disposition'];

    res.setHeader('Content-Type', contentType);
    if (contentLength) res.setHeader('Content-Length', contentLength);
    if (contentDisposition) res.setHeader('Content-Disposition', contentDisposition);
    res.setHeader('Cache-Control', 'private, max-age=300');

    upstream.data.pipe(res);
  } catch (error) {
    next(error);
  }
};

exports.useQuestions = (req, res, next) => {
  req.conversationType = 'QUESTION';
  next();
};

exports.useChats = (req, res, next) => {
  req.conversationType = 'CHAT';
  next();
};
