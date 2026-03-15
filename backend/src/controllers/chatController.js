const prisma = require('../config/database');
const logger = require('../utils/logger');

// GET /chats — список чатов с фильтрацией
exports.getChats = async (req, res, next) => {
  try {
    const { marketplaceId, cabinetId, status, page = 1, limit = 50 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where = {};

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

    const [chats, total] = await Promise.all([
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
        skip,
        take: parseInt(limit),
      }),
      prisma.chat.count({ where }),
    ]);

    // Добавляем timer color к каждому чату
    const now = Date.now();
    const enrichedChats = chats.map((chat) => {
      const elapsed = chat.lastMessageAt
        ? (now - new Date(chat.lastMessageAt).getTime()) / 1000
        : 999;
      let timerColor = 'red';
      if (elapsed < 120) timerColor = 'green';
      else if (elapsed < 300) timerColor = 'yellow';

      return { ...chat, timerColor, elapsedSeconds: Math.round(elapsed) };
    });

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

    if (!chat) {
      return res.status(404).json({ success: false, error: 'Чат не найден' });
    }

    res.json({ success: true, data: chat });
  } catch (error) {
    next(error);
  }
};

// POST /chats/:chatId/messages — отправить сообщение
exports.sendMessage = async (req, res, next) => {
  try {
    const { chatId } = req.params;
    const { text } = req.body;

    const chat = await prisma.chat.findUnique({
      where: { id: chatId },
      include: {
        cabinet: { include: { marketplace: true } },
      },
    });
    if (!chat) {
      return res.status(404).json({ success: false, error: 'Чат не найден' });
    }

    // ── Отправляем на маркетплейс (если есть externalChatId и ключи) ──
    let marketplaceSent = false;
    if (chat.externalChatId && chat.cabinet) {
      try {
        const { getSyncService } = require('../services/marketplaceSync');
        const svc = getSyncService(chat.cabinet.marketplace.slug);
        if (svc) {
          marketplaceSent = await svc.sendMessage(chat.cabinet, chat.externalChatId, text);
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
    const { chatId } = req.params;

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
    const { chatId } = req.params;
    const { managerId } = req.body;

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
    const { chatId } = req.params;
    const { status } = req.body;

    const chat = await prisma.chat.update({
      where: { id: chatId },
      data: { status },
    });

    res.json({ success: true, data: chat });
  } catch (error) {
    next(error);
  }
};
