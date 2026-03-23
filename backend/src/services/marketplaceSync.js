// ══════════════════════════════════════════════
// MP CRM — Marketplace Sync Services
// ══════════════════════════════════════════════
//
// Сервисы для синхронизации чатов с API маркетплейсов.
// Каждый маркетплейс имеет свой формат API — здесь
// реализована абстракция для унифицированной работы.
// ══════════════════════════════════════════════

const axios = require('axios');
const prisma = require('../config/database');
const config = require('../config');
const logger = require('../utils/logger');

// ─── Базовый класс ───
class MarketplaceSyncService {
  static manualHistoryLocks = new Set();

  constructor(name) {
    this.name = name;
  }

  parseMessageDate(value) {
    if (!value) return new Date();
    if (typeof value === 'number' && Number.isFinite(value)) {
      return new Date(value);
    }
    if (typeof value === 'string' && /^\d{10,17}$/.test(value.trim())) {
      const numeric = Number(value.trim());
      if (Number.isFinite(numeric)) return new Date(numeric);
    }
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    return new Date();
  }

  async sleep(ms) {
    if (!ms || ms <= 0) return;
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  isManualHistoryLocked(cabinetId) {
    return MarketplaceSyncService.manualHistoryLocks.has(cabinetId);
  }

  lockManualHistory(cabinetId) {
    MarketplaceSyncService.manualHistoryLocks.add(cabinetId);
  }

  unlockManualHistory(cabinetId) {
    MarketplaceSyncService.manualHistoryLocks.delete(cabinetId);
  }

  async syncChats(cabinet, io) {
    throw new Error('syncChats() не реализован');
  }

  async syncQuestions(_cabinet, _io) {
    return null;
  }

  extractMarkdownMedia(text) {
    if (!text || typeof text !== 'string') return null;

    const imageMatch = text.match(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i);
    if (imageMatch?.[1]) {
      const url = imageMatch[1];
      return {
        messageType: 'IMAGE',
        mediaUrl: url,
        thumbnailUrl: url,
        mediaMimeType: /\.(jpg|jpeg|png|gif|webp|bmp|heic)(\?|$)/i.test(url) ? 'image/*' : null,
      };
    }

    const fileMatch = text.match(/\[[^\]]*]\((https?:\/\/[^)\s]+)\)/i);
    if (fileMatch?.[1]) {
      return {
        messageType: 'FILE',
        mediaUrl: fileMatch[1],
        thumbnailUrl: null,
        mediaMimeType: null,
      };
    }

    return null;
  }

  stripMarkdownMedia(text) {
    if (!text || typeof text !== 'string') return text;
    return text
      .replace(/!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi, '')
      .replace(/\[[^\]]*]\((https?:\/\/[^)\s]+)\)/gi, '')
      .trim();
  }

  extractProductImageUrl(payload, depth = 0) {
    if (!payload || depth > 6) return '';
    if (typeof payload === 'string') {
      const normalized = payload.trim();
      if (!/^https?:\/\//i.test(normalized)) return '';
      if (/\.(jpg|jpeg|png|gif|webp|bmp|heic)(\?|$)/i.test(normalized)) return normalized;
      // Маркетплейсы часто отдают image_url без расширения файла — такой URL тоже считаем валидной миниатюрой.
      return normalized;
    }
    if (Array.isArray(payload)) {
      for (const item of payload) {
        const found = this.extractProductImageUrl(item, depth + 1);
        if (found) return found;
      }
      return '';
    }
    if (typeof payload !== 'object') return '';

    const directCandidates = [
      payload.image,
      payload.imageUrl,
      payload.image_url,
      payload.photo,
      payload.photoUrl,
      payload.photo_url,
      payload.thumbnail,
      payload.thumbnailUrl,
      payload.thumbnail_url,
      payload.preview,
      payload.previewUrl,
      payload.preview_url,
      payload.picture,
      payload.pictureUrl,
      payload.picture_url,
      payload.primaryImage,
      payload.primary_image,
      payload.mainImage,
      payload.main_image,
      payload.images,
      payload.photos,
      payload.pictures,
      payload.gallery,
    ];

    for (const candidate of directCandidates) {
      const found = this.extractProductImageUrl(candidate, depth + 1);
      if (found) return found;
    }

    for (const [key, value] of Object.entries(payload)) {
      const normalizedKey = key.toLowerCase();
      if (
        normalizedKey.includes('image') ||
        normalizedKey.includes('photo') ||
        normalizedKey.includes('picture') ||
        normalizedKey.includes('thumb') ||
        normalizedKey.includes('preview')
      ) {
        const found = this.extractProductImageUrl(value, depth + 1);
        if (found) return found;
      }
    }

    return '';
  }

  async sendMessage(cabinet, externalChatId, text) {
    throw new Error('sendMessage() не реализован');
  }

  async processIncomingMessage(cabinet, rawMessage, io) {
    const {
      externalChatId,
      customerName,
      text,
      messageType = 'TEXT',
      mediaUrl,
      thumbnailUrl,
      mediaMimeType,
      externalMsgId,
      conversationType = 'CHAT',
      senderType = 'CUSTOMER',
      createdAt,
    } = rawMessage;
    const messageCreatedAt = this.parseMessageDate(createdAt);

    // Найти или создать чат
    let chat = await prisma.chat.findFirst({
      where: { cabinetId: cabinet.id, externalChatId, conversationType },
    });

    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          cabinetId: cabinet.id,
          conversationType,
          externalChatId,
          customerName: customerName || 'Покупатель',
          status: 'OPEN',
        },
      });
    } else if (customerName && chat.customerName !== customerName) {
      chat = await prisma.chat.update({
        where: { id: chat.id },
        data: { customerName },
      });
    }

    // Проверяем дубликат
    if (externalMsgId) {
      const existing = await prisma.chatMessage.findFirst({
        where: { chatId: chat.id, externalMsgId },
      });
      if (existing) {
        const inferredMedia = mediaUrl
          ? { messageType, mediaUrl, thumbnailUrl, mediaMimeType }
          : this.extractMarkdownMedia(existing.text || text);
        const normalizedText = this.stripMarkdownMedia(text || existing.text) || (
          inferredMedia?.messageType === 'IMAGE' ? '📷 Фотография' :
          inferredMedia?.messageType === 'FILE' ? '📎 Файл' :
          existing.text
        );

        if (
          inferredMedia &&
          (
            !existing.mediaUrl ||
            existing.messageType === 'TEXT' ||
            existing.text !== normalizedText
          )
        ) {
          await prisma.chatMessage.update({
            where: { id: existing.id },
            data: {
              text: normalizedText,
              messageType: inferredMedia.messageType,
              mediaUrl: inferredMedia.mediaUrl,
              thumbnailUrl: inferredMedia.thumbnailUrl,
              mediaMimeType: inferredMedia.mediaMimeType,
            },
          });
        }

        return null;
      }
    }

    // Создаём сообщение
    const message = await prisma.chatMessage.create({
      data: {
        chatId: chat.id,
        senderType,
        text,
        messageType,
        mediaUrl,
        thumbnailUrl,
        mediaMimeType,
        externalMsgId,
        createdAt: messageCreatedAt,
      },
    });

    const chatUpdate = {
      status: 'OPEN',
    };

    if (!chat.lastMessageAt || messageCreatedAt >= chat.lastMessageAt) {
      chatUpdate.lastMessageAt = messageCreatedAt;
      chatUpdate.lastMessageText = text;
    }

    if (senderType === 'CUSTOMER') {
      chatUpdate.unreadCount = { increment: 1 };
    }

    await prisma.chat.update({ where: { id: chat.id }, data: chatUpdate });

    // WebSocket уведомление
    if (io && senderType === 'CUSTOMER') {
      const { notifyNewCustomerMessage } = require('../websocket');
      notifyNewCustomerMessage(io, chat.id, cabinet.id, message);
    }

    return message;
  }
}

// ─── Wildberries ───
class WildberriesSyncService extends MarketplaceSyncService {
  constructor() {
    super('Wildberries');
    this.baseUrl = config.marketplaces.wb.baseUrl;
    this.chatBaseUrl = config.marketplaces.wb.chatBaseUrl;
    this.chatListPath = config.marketplaces.wb.chatListPath;
    this.chatEventsPath = config.marketplaces.wb.chatEventsPath;
    this.chatMessagePath = config.marketplaces.wb.chatMessagePath;
    this.chatDownloadPath = config.marketplaces.wb.chatDownloadPath;
    this.wbImageUrlCache = new Map();
  }

  getWbNmIdFromPayload(payload) {
    if (!payload || typeof payload !== 'object') return '';
    const raw = (
      payload.productDetails?.nmId ||
      payload.goodCard?.nmId ||
      payload.product?.nmId ||
      payload.nmId ||
      payload.nm_id ||
      ''
    ).toString().trim();
    return /^\d+$/.test(raw) ? raw : '';
  }

  buildWbProductUrlFromNmId(nmId) {
    if (!nmId || !/^\d+$/.test(String(nmId))) return '';
    return `https://www.wildberries.ru/catalog/${nmId}/detail.aspx`;
  }

  buildWbImageCandidates(nmId) {
    const numericNm = Number(nmId);
    if (!Number.isFinite(numericNm) || numericNm <= 0) return [];
    const vol = Math.floor(numericNm / 100000);
    const part = Math.floor(numericNm / 1000);
    const basketHosts = Array.from({ length: 20 }, (_, idx) => `basket-${String(idx + 1).padStart(2, '0')}.wbbasket.ru`);

    const candidates = [];
    for (const host of basketHosts) {
      candidates.push(`https://${host}/vol${vol}/part${part}/${numericNm}/images/c246x328/1.webp`);
      candidates.push(`https://${host}/vol${vol}/part${part}/${numericNm}/images/c246x328/1.jpg`);
    }
    return candidates;
  }

  async resolveWbImageByNmId(nmId) {
    if (!nmId) return '';
    if (this.wbImageUrlCache.has(nmId)) return this.wbImageUrlCache.get(nmId);

    const candidates = this.buildWbImageCandidates(nmId);
    if (!candidates.length) {
      this.wbImageUrlCache.set(nmId, '');
      return '';
    }

    const checks = candidates.map(async (url) => {
      try {
        const response = await axios.head(url, { timeout: 1600, validateStatus: () => true });
        return response.status === 200 ? url : '';
      } catch (_) {
        return '';
      }
    });

    const resolved = (await Promise.all(checks)).find(Boolean) || '';
    this.wbImageUrlCache.set(nmId, resolved);
    return resolved;
  }

  async syncChats(cabinet, io) {
    try {
      if (this.isManualHistoryLocked(cabinet.id)) {
        logger.info(`WB ${cabinet.name}: пропускаем фоновую синхронизацию чатов, идёт ручная догрузка истории`);
        return;
      }

      if (!cabinet.apiToken) {
        logger.warn(`WB кабинет ${cabinet.name}: API токен не настроен`);
        return;
      }

      const response = await axios.get(`${this.chatBaseUrl}${this.chatListPath}`, {
        headers: { Authorization: cabinet.apiToken },
        timeout: 10000,
      });

      const chats =
        response.data?.data?.chats ||
        response.data?.chats ||
        (Array.isArray(response.data?.result) ? response.data.result : null) ||
        response.data?.data ||
        response.data ||
        [];
      const normalizedChats = Array.isArray(chats) ? chats : [];
      logger.info(`WB ${cabinet.name}: chat list returned ${normalizedChats.length} items`);
      if (normalizedChats[0]) {
        logger.debug(`WB ${cabinet.name}: sample chat payload ${JSON.stringify(normalizedChats[0]).slice(0, 2500)}`);
      }

      if (!normalizedChats.length) {
        await prisma.cabinet.update({
          where: { id: cabinet.id },
          data: { lastSyncAt: new Date() },
        });

        logger.info(`WB ${cabinet.name}: синхронизировано 0 чатов`);
        return;
      }

      const savedChats = new Map();

      for (const chatData of normalizedChats) {
        const chatId = this.getWbChatId(chatData);
        if (!chatId) continue;

        const externalChatId = `wb-chat-${chatId}`;
        const customerName = this.getWbChatCustomerName(chatData);
        const replySign = this.getWbChatReplySign(chatData);
        const unreadCountInfo = this.getWbChatUnreadCount(chatData);
        const lastMessageText = this.getWbChatLastMessageText(chatData);
        const lastMessageAtRaw = this.getWbChatLastMessageAt(chatData);
        const lastMessageAt = lastMessageAtRaw ? this.parseMessageDate(lastMessageAtRaw) : null;

        const existingChat = await prisma.chat.findFirst({
          where: {
            cabinetId: cabinet.id,
            externalChatId,
            conversationType: 'CHAT',
          },
        });

        let chatRecord;
        if (!existingChat) {
          chatRecord = await prisma.chat.create({
            data: {
              cabinetId: cabinet.id,
              conversationType: 'CHAT',
              externalChatId,
              customerName,
              customerExternalId: replySign || null,
              status: 'OPEN',
              unreadCount: unreadCountInfo.value,
              ...(lastMessageText ? { lastMessageText } : {}),
              ...(lastMessageAt ? { lastMessageAt } : {}),
            },
          });
        } else {
          const nextUnreadCount = unreadCountInfo.present ? unreadCountInfo.value : existingChat.unreadCount;
          chatRecord = await prisma.chat.update({
            where: { id: existingChat.id },
            data: {
              customerName,
              customerExternalId: replySign || existingChat.customerExternalId,
              unreadCount: nextUnreadCount,
              lastMessageText: lastMessageText || existingChat.lastMessageText,
              lastMessageAt: lastMessageAt || existingChat.lastMessageAt,
              status: 'OPEN',
            },
          });
        }
        savedChats.set(chatId, {
          chatRecord,
          externalChatId,
          customerName,
          unreadCountInfo,
          listLastMessageAt: lastMessageAt,
          listLastMessageText: lastMessageText,
        });
      }

      const prioritizedChatIds = normalizedChats
        .slice()
        .sort((a, b) => {
          const bRaw = this.getWbChatLastMessageAt(b);
          const aRaw = this.getWbChatLastMessageAt(a);
          const bTime = bRaw ? this.parseMessageDate(bRaw).getTime() : 0;
          const aTime = aRaw ? this.parseMessageDate(aRaw).getTime() : 0;
          return bTime - aTime;
        })
        .slice(0, 30)
        .map((chat) => this.getWbChatId(chat))
        .filter(Boolean);

      const events = await this.fetchWbEvents(cabinet, {
        debugLabel: normalizedChats[0] ? cabinet.name : null,
        targetChatIds: prioritizedChatIds,
      });
      if (events[0]) {
        logger.debug(`WB ${cabinet.name}: sample event payload ${JSON.stringify(events[0]).slice(0, 2500)}`);
      }

      const eventsByChatId = new Map();
      for (const event of events) {
        const chatId = this.getWbEventChatId(event);
        if (!chatId || !savedChats.has(chatId)) continue;
        if (!eventsByChatId.has(chatId)) eventsByChatId.set(chatId, []);
        eventsByChatId.get(chatId).push(event);
      }

      for (const [chatId, meta] of savedChats.entries()) {
        const chatEvents = (eventsByChatId.get(chatId) || []).sort((a, b) => {
          return this.parseMessageDate(this.getWbEventCreatedAt(a)) - this.parseMessageDate(this.getWbEventCreatedAt(b));
        });

        for (const event of chatEvents) {
          const media = this.getWbEventMedia(event);
          const text = this.getWbEventText(event) || (media?.messageType === 'IMAGE' ? '📷 Фотография' : media?.messageType === 'FILE' ? '📎 Файл' : '');
          if (!text && !media?.mediaUrl) continue;
          const eventCreatedAt = this.parseMessageDate(this.getWbEventCreatedAt(event));

          await this.processIncomingMessage(cabinet, {
            externalChatId: meta.externalChatId,
            customerName: this.getWbEventCustomerName(event) || meta.customerName,
            text,
            messageType: media?.messageType || 'TEXT',
            mediaUrl: media?.mediaUrl || null,
            thumbnailUrl: media?.thumbnailUrl || null,
            mediaMimeType: media?.mediaMimeType || null,
            externalMsgId: `wb-chat-event-${this.getWbEventId(event) || `${chatId}-${this.getWbEventCreatedAt(event)}`}`,
            conversationType: 'CHAT',
            senderType: this.getWbEventSenderType(event),
            createdAt: eventCreatedAt,
          }, io);
        }

        const lastEvent = chatEvents[chatEvents.length - 1];
        const derivedUnreadCount = this.deriveWbUnreadCount(chatEvents);
        if (lastEvent && meta.chatRecord) {
          const lastEventAt = this.parseMessageDate(this.getWbEventCreatedAt(lastEvent));
          const updateData = {
            lastMessageText: this.getWbEventText(lastEvent) || meta.listLastMessageText || meta.chatRecord.lastMessageText,
            lastMessageAt: lastEventAt,
          };

          if (meta.unreadCountInfo.present) {
            updateData.unreadCount = meta.unreadCountInfo.value;
          } else if (derivedUnreadCount > 0) {
            updateData.unreadCount = derivedUnreadCount;
          } else {
            const confidentManagerReply = (
              chatEvents.length > 0 &&
              this.getWbEventSenderType(lastEvent) === 'MANAGER' &&
              (
                !meta.listLastMessageAt ||
                Math.abs(lastEventAt.getTime() - meta.listLastMessageAt.getTime()) <= 5 * 60 * 1000 ||
                lastEventAt >= meta.listLastMessageAt
              )
            );
            if (confidentManagerReply) {
              updateData.unreadCount = 0;
            }
          }

          await prisma.chat.update({
            where: { id: meta.chatRecord.id },
            data: updateData,
          });
        }
      }

      await prisma.cabinet.update({
        where: { id: cabinet.id },
        data: { lastSyncAt: new Date() },
      });

      logger.info(`WB ${cabinet.name}: синхронизировано ${normalizedChats.length} чатов, полная история автозагружена для ${prioritizedChatIds.length} последних`);
    } catch (error) {
      logger.error(`WB ${cabinet.name} ошибка синхронизации чатов: ${error.message} | response: ${JSON.stringify(error.response?.data)}`);
    }
  }

  async loadFullChatHistory(cabinet, chat) {
    if (!cabinet?.apiToken || !chat?.externalChatId?.startsWith('wb-chat-')) {
      return { loaded: 0 };
    }

    const targetChatId = chat.externalChatId.replace('wb-chat-', '');
    this.lockManualHistory(cabinet.id);
    logger.info(`WB ${cabinet.name}: запускаем ручную догрузку полной истории для чата ${targetChatId}`);

    try {
      const events = await this.fetchWbEvents(cabinet, {
        debugLabel: `${cabinet.name}:${targetChatId}:manual`,
        targetChatIds: [targetChatId],
        maxPages: 200,
        pageDelayMs: 450,
        stopAfterInitialQuietPages: 6,
        stopAfterTargetQuietPages: 3,
      });

      const filteredEvents = events
        .filter((event) => this.getWbEventChatId(event) === targetChatId)
        .sort((a, b) => this.parseMessageDate(this.getWbEventCreatedAt(a)) - this.parseMessageDate(this.getWbEventCreatedAt(b)));

      let loaded = 0;
      for (const event of filteredEvents) {
        const media = this.getWbEventMedia(event);
        const text = this.getWbEventText(event) || (media?.messageType === 'IMAGE' ? '📷 Фотография' : media?.messageType === 'FILE' ? '📎 Файл' : '');
        if (!text && !media?.mediaUrl) continue;
        const eventCreatedAt = this.parseMessageDate(this.getWbEventCreatedAt(event));

        await this.processIncomingMessage(cabinet, {
          externalChatId: chat.externalChatId,
          customerName: this.getWbEventCustomerName(event) || chat.customerName,
          text,
          messageType: media?.messageType || 'TEXT',
          mediaUrl: media?.mediaUrl || null,
          thumbnailUrl: media?.thumbnailUrl || null,
          mediaMimeType: media?.mediaMimeType || null,
          externalMsgId: `wb-chat-event-${this.getWbEventId(event) || `${targetChatId}-${this.getWbEventCreatedAt(event)}`}`,
          conversationType: 'CHAT',
          senderType: this.getWbEventSenderType(event),
          createdAt: eventCreatedAt,
        });
        loaded += 1;
      }

      const lastEvent = filteredEvents[filteredEvents.length - 1];
      if (lastEvent) {
        await prisma.chat.update({
          where: { id: chat.id },
          data: {
            customerName: this.getWbEventCustomerName(lastEvent) || chat.customerName,
            lastMessageText: this.getWbEventText(lastEvent) || chat.lastMessageText,
            lastMessageAt: this.parseMessageDate(this.getWbEventCreatedAt(lastEvent)),
          },
        });
      }

      logger.info(`WB ${cabinet.name}: вручную догружено ${loaded} сообщений для чата ${targetChatId}`);
      return { loaded };
    } finally {
      this.unlockManualHistory(cabinet.id);
    }
  }

  async loadFullQuestionHistory(cabinet, chat, io) {
    if (!cabinet?.apiToken || !chat?.externalChatId?.startsWith('wb-q-')) {
      return { loaded: 0 };
    }

    const questionId = chat.externalChatId.replace('wb-q-', '');
    logger.info(`WB ${cabinet.name}: targeted question sync for ${questionId}`);

    const question = await this.fetchWbQuestionById(cabinet, questionId);
    if (!question) {
      logger.warn(`WB ${cabinet.name}: question ${questionId} not found in API`);
      return { loaded: 0 };
    }

    let loaded = 0;
    const customerName = question.userName || 'Покупатель WB';

    if (question.text) {
      const message = await this.processIncomingMessage(cabinet, {
        externalChatId: `wb-q-${question.id}`,
        customerName,
        text: question.text,
        externalMsgId: `wb-msg-${question.id}`,
        conversationType: 'QUESTION',
        createdAt: question.createdDate || question.createdAt,
      }, io);
      if (message) loaded += 1;
    }

    const answerText = question.answer?.text || question.answerText || question.answer;
    if (answerText) {
      const answerMessage = await this.processIncomingMessage(cabinet, {
        externalChatId: `wb-q-${question.id}`,
        customerName,
        text: answerText,
        externalMsgId: `wb-answer-${question.id}`,
        conversationType: 'QUESTION',
        senderType: 'MANAGER',
        createdAt: question.answer?.createdDate || question.answer?.createdAt || question.updatedDate || question.updatedAt,
      }, io);
      if (answerMessage) loaded += 1;
    }

    await prisma.cabinet.update({
      where: { id: cabinet.id },
      data: { lastSyncAt: new Date() },
    });

    return { loaded };
  }

  async fetchWbQuestionById(cabinet, questionId) {
    const headers = { Authorization: cabinet.apiToken };
    const normalizedId = String(questionId);
    const searchVariants = [
      { isAnswered: false },
      { isAnswered: true },
      {},
    ];

    for (const variant of searchVariants) {
      for (let page = 0; page < 10; page += 1) {
        const params = {
          take: 100,
          skip: page * 100,
          ...variant,
        };

        const response = await axios.get(`${this.baseUrl}/api/v1/questions`, {
          headers,
          params,
          timeout: 10000,
        });

        const questions = response.data?.data?.questions || [];
        const normalizedQuestions = Array.isArray(questions) ? questions : [];
        const match = normalizedQuestions.find((q) => String(q?.id || '') === normalizedId);
        if (match) return match;
        if (normalizedQuestions.length < 100) break;
      }
    }

    return null;
  }

  async getChatMetadata(cabinet, externalChatId) {
    if (!cabinet?.apiToken || !externalChatId?.startsWith('wb-chat-')) {
      return null;
    }

    const targetChatId = externalChatId.replace('wb-chat-', '');
    const response = await axios.get(`${this.chatBaseUrl}${this.chatListPath}`, {
      headers: { Authorization: cabinet.apiToken },
      timeout: 10000,
    });

    const chats =
      response.data?.data?.chats ||
      response.data?.chats ||
      (Array.isArray(response.data?.result) ? response.data.result : null) ||
      response.data?.data ||
      response.data ||
      [];

    const matchedChat = (Array.isArray(chats) ? chats : []).find((item) => this.getWbChatId(item) === targetChatId);
    if (!matchedChat) return null;

    const goodCard = matchedChat.goodCard || matchedChat.good_card || {};
    const nmId = this.getWbNmIdFromPayload({ ...matchedChat, goodCard });
    const resolvedImage = await this.resolveWbImageByNmId(nmId);
    const productUrl = this.buildWbProductUrlFromNmId(nmId);
    return {
      orderId: goodCard.rid || matchedChat.rid || '',
      orderDate: goodCard.date || matchedChat.orderDate || null,
      orderScheme: 'Wildberries',
      orderCity: '',
      orderTitle: goodCard.name || matchedChat.goodName || '',
      productTitle: goodCard.name || matchedChat.goodName || '',
      sellerArticle: (
        goodCard.supplierArticle ||
        goodCard.vendorCode ||
        matchedChat.supplierArticle ||
        matchedChat.vendorCode ||
        ''
      ).toString().trim(),
      productImage: this.extractProductImageUrl(goodCard) || this.extractProductImageUrl(matchedChat) || resolvedImage || '',
      productUrl,
    };
  }

  extractWbQuestionProductMetadata(question) {
    if (!question || typeof question !== 'object') {
      return { productTitle: '', sellerArticle: '', productImage: '', productUrl: '' };
    }

    const productTitle = (
      question.productDetails?.productName ||
      question.productDetails?.name ||
      question.product?.name ||
      question.productCard?.name ||
      question.goodCard?.name ||
      question.good_name ||
      question.productName ||
      question.itemName ||
      question.nmName ||
      question.subjectName ||
      ''
    ).toString().trim();

    const sellerArticle = (
      question.productDetails?.supplierArticle ||
      question.productDetails?.vendorCode ||
      question.product?.supplierArticle ||
      question.product?.vendorCode ||
      question.goodCard?.supplierArticle ||
      question.goodCard?.vendorCode ||
      question.supplierArticle ||
      question.vendorCode ||
      question.vendor_code ||
      question.sku ||
      ''
    ).toString().trim();

    const productImage = this.extractProductImageUrl(question.productDetails) || this.extractProductImageUrl(question);
    const productUrl = this.buildWbProductUrlFromNmId(this.getWbNmIdFromPayload(question));

    return { productTitle, sellerArticle, productImage, productUrl };
  }

  async getQuestionMetadata(cabinet, externalChatId) {
    if (!cabinet?.apiToken || !externalChatId?.startsWith('wb-q-')) {
      return null;
    }

    const questionId = externalChatId.replace('wb-q-', '');
    const question = await this.fetchWbQuestionById(cabinet, questionId);
    if (!question) return null;

    const { productTitle, sellerArticle, productImage, productUrl } = this.extractWbQuestionProductMetadata(question);
    const nmId = this.getWbNmIdFromPayload(question);
    const resolvedImage = await this.resolveWbImageByNmId(nmId);
    return {
      productTitle,
      sellerArticle,
      productImage: productImage || resolvedImage || '',
      productUrl: productUrl || this.buildWbProductUrlFromNmId(nmId),
      orderTitle: productTitle || '',
    };
  }

  async syncQuestions(cabinet, io) {
    try {
      if (!cabinet.apiToken) {
        logger.warn(`WB кабинет ${cabinet.name}: API токен не настроен`);
        return;
      }

      const response = await axios.get(`${this.baseUrl}/api/v1/questions`, {
        headers: { Authorization: cabinet.apiToken },
        params: {
          isAnswered: false,
          take: 100,
          skip: 0,
        },
        timeout: 10000,
      });

      const questions = response.data?.data?.questions || [];

      for (const q of questions) {
        await this.processIncomingMessage(cabinet, {
          externalChatId: `wb-q-${q.id}`,
          customerName: q.userName || 'Покупатель WB',
          text: q.text,
          externalMsgId: `wb-msg-${q.id}`,
          conversationType: 'QUESTION',
          createdAt: q.createdDate || q.createdAt,
        }, io);

        const answerText = q.answer?.text || q.answerText || q.answer;
        if (answerText) {
          await this.processIncomingMessage(cabinet, {
            externalChatId: `wb-q-${q.id}`,
            customerName: q.userName || 'Покупатель WB',
            text: answerText,
            externalMsgId: `wb-answer-${q.id}`,
            conversationType: 'QUESTION',
            senderType: 'MANAGER',
            createdAt: q.answer?.createdDate || q.answer?.createdAt || q.updatedDate || q.updatedAt,
          }, io);
        }
      }

      await prisma.cabinet.update({
        where: { id: cabinet.id },
        data: { lastSyncAt: new Date() },
      });

      logger.info(`WB ${cabinet.name}: синхронизировано ${questions.length} вопросов`);
    } catch (error) {
      logger.error(`WB ${cabinet.name} ошибка синхронизации вопросов: ${error.message} | response: ${JSON.stringify(error.response?.data)}`);
    }
  }

  async sendMessage(cabinet, externalChatId, text, context = {}) {
    try {
      if (externalChatId.startsWith('wb-chat-')) {
        const chatId = externalChatId.replace('wb-chat-', '');
        let replySign = context.chat?.customerExternalId || null;

        if (!replySign) {
          const listResponse = await axios.get(`${this.chatBaseUrl}${this.chatListPath}`, {
            headers: { Authorization: cabinet.apiToken },
            timeout: 10000,
          });
          const chats = listResponse.data?.data?.chats || listResponse.data?.chats || listResponse.data?.data || listResponse.data || [];
          const matchedChat = (Array.isArray(chats) ? chats : []).find((item) => this.getWbChatId(item) === chatId);
          replySign = this.getWbChatReplySign(matchedChat);
        }

        if (!replySign) {
          throw new Error(`Для WB чата ${chatId} не найден replySign`);
        }

        const formData = new FormData();
        formData.append('replySign', replySign);
        formData.append('message', text);

        await axios.post(
          `${this.chatBaseUrl}${this.chatMessagePath}`,
          formData,
          {
            headers: {
              Authorization: cabinet.apiToken,
            },
            timeout: 10000,
          }
        );
        return true;
      }

      const questionId = externalChatId.replace('wb-q-', '');
      await axios.patch(
        `${this.baseUrl}/api/v1/questions`,
        {
          id: questionId,
          answer: text,
          state: 'wbRu',
        },
        {
          headers: { Authorization: cabinet.apiToken },
          timeout: 10000,
        }
      );
      return true;
    } catch (error) {
      logger.error(`WB отправка ошибка:`, error.message);
      return false;
    }
  }

  getWbChatId(chatData) {
    return String(chatData?.chatID || chatData?.chatId || chatData?.id || '');
  }

  getWbChatReplySign(chatData) {
    return chatData?.replySign || chatData?.reply_sign || chatData?.replysign || null;
  }

  getWbChatCustomerName(chatData) {
    return (
      chatData?.clientName ||
      chatData?.client_name ||
      chatData?.userName ||
      chatData?.name ||
      'Покупатель WB'
    );
  }

  getWbChatUnreadCount(chatData) {
    const candidates = [
      chatData?.unreadCount,
      chatData?.unread_count,
      chatData?.unreadMessagesCount,
      chatData?.unread_messages_count,
      chatData?.newMessagesCount,
      chatData?.new_messages_count,
      chatData?.countUnread,
      chatData?.count_unread,
      chatData?.unansweredCount,
      chatData?.unanswered_count,
      chatData?.lastMessage?.unreadCount,
      chatData?.lastMessage?.unread_count,
    ];

    const presentValue = candidates.find((value) => value !== undefined && value !== null && value !== '');
    return {
      present: presentValue !== undefined,
      value: Number(presentValue || 0) || 0,
    };
  }

  getWbChatLastMessageText(chatData) {
    const lastMessage = chatData?.lastMessage || chatData?.last_message || chatData?.message || null;
    if (typeof lastMessage === 'string') return lastMessage;
    return (
      lastMessage?.text ||
      lastMessage?.message ||
      chatData?.text ||
      null
    ) || null;
  }

  getWbChatLastMessageAt(chatData) {
    const lastMessage = chatData?.lastMessage || chatData?.last_message || chatData?.message || null;
    return (
      lastMessage?.addTimestamp ||
      lastMessage?.add_timestamp ||
      lastMessage?.timestamp ||
      lastMessage?.createdAt ||
      lastMessage?.created_at ||
      chatData?.lastMessageDate ||
      chatData?.last_message_date ||
      chatData?.lastMessageAt ||
      chatData?.updatedAt ||
      chatData?.createdAt ||
      null
    );
  }

  deriveWbUnreadCount(chatEvents) {
    if (!Array.isArray(chatEvents) || chatEvents.length === 0) return 0;
    let unread = 0;
    for (let i = chatEvents.length - 1; i >= 0; i -= 1) {
      const senderType = this.getWbEventSenderType(chatEvents[i]);
      if (senderType === 'MANAGER') break;
      unread += 1;
    }
    return unread;
  }

  getWbEventId(event) {
    return event?.eventID || event?.eventId || event?.id || event?.messageID || event?.messageId || null;
  }

  getWbEventChatId(event) {
    const raw = event?.chatID || event?.chatId || event?.chat?.id || event?.chat?.chatID || null;
    return raw ? String(raw) : null;
  }

  getWbEventCreatedAt(event) {
    return (
      event?.addTimestamp ||
      event?.add_timestamp ||
      event?.addTime ||
      event?.add_time ||
      event?.createdAt ||
      event?.createdDate ||
      event?.dateTime ||
      event?.date ||
      event?.timestamp ||
      new Date()
    );
  }

  getWbEventCustomerName(event) {
    return (
      event?.clientName ||
      event?.client_name ||
      event?.userName ||
      event?.authorName ||
      event?.name ||
      null
    );
  }

  getWbEventText(event) {
    const value = (
      event?.text ||
      event?.message?.text ||
      event?.message ||
      event?.body ||
      event?.content?.text ||
      event?.payload?.text ||
      event?.payload?.message?.text ||
      ''
    );
    return typeof value === 'string' ? value.trim() : '';
  }

  getWbEventSenderType(event) {
    const raw = (
      event?.senderType ||
      event?.sender ||
      event?.authorType ||
      event?.author ||
      event?.userType ||
      ''
    ).toString().toLowerCase();

    if (
      raw.includes('seller') ||
      raw.includes('manager') ||
      raw.includes('operator') ||
      raw.includes('employee')
    ) {
      return 'MANAGER';
    }

    return 'CUSTOMER';
  }

  getWbEventMedia(event) {
    const candidates = [];
    const scan = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(scan);
        return;
      }
      if (typeof value !== 'object') return;

      const url = value.url || value.src || value.link || null;
      const downloadId = value.downloadID || value.downloadId || value.fileId || value.fileID || null;
      const fileName = value.fileName || value.name || value.filename || '';

      if (url || downloadId) {
        candidates.push({ url, downloadId, fileName });
      }

      Object.values(value).forEach((nested) => {
        if (nested && typeof nested === 'object') scan(nested);
      });
    };

    scan(event?.attachments);
    scan(event?.attachment);
    scan(event?.files);
    scan(event?.images);
    scan(event?.content);
    scan(event?.payload);

    const mediaCandidate = candidates.find((candidate) => candidate.url || candidate.downloadId);
    if (!mediaCandidate) return null;

    const mediaUrl = mediaCandidate.url || `${this.chatBaseUrl}${this.chatDownloadPath}/${mediaCandidate.downloadId}`;
    const isImage = /\.(jpg|jpeg|png|gif|webp|bmp|heic)(\?|$)/i.test(mediaUrl) || /\.(jpg|jpeg|png|gif|webp|bmp|heic)$/i.test(mediaCandidate.fileName || '');

    return {
      messageType: isImage ? 'IMAGE' : 'FILE',
      mediaUrl,
      thumbnailUrl: isImage ? mediaUrl : null,
      mediaMimeType: isImage ? 'image/*' : null,
    };
  }

  async fetchWbEvents(cabinet, options = {}) {
    const headers = { Authorization: cabinet.apiToken };
    const collected = [];
    const seen = new Set();
    let next = null;
    let page = 0;
    const {
      debugLabel = null,
      targetChatIds = null,
      maxPages = 100,
      pageDelayMs = 1100,
      stopAfterInitialQuietPages = 0,
      stopAfterTargetQuietPages = 0,
    } = options;
    const targetSet = Array.isArray(targetChatIds) && targetChatIds.length ? new Set(targetChatIds.map(String)) : null;
    let hasMatchedTarget = false;
    let targetQuietPages = 0;

    while (page < maxPages) {
      let response;
      let attempt = 0;
      while (attempt < 5) {
        try {
          response = await axios.get(`${this.chatBaseUrl}${this.chatEventsPath}`, {
            headers,
            params: next ? { next } : {},
            timeout: 15000,
          });
          break;
        } catch (error) {
          if (error.response?.status === 429) {
            attempt += 1;
            const retryDelay = Math.min(5000, pageDelayMs * attempt);
            logger.warn(`WB ${cabinet.name}: лимит events (429), повтор ${attempt}/5 через ${retryDelay}мс`);
            await this.sleep(retryDelay);
            continue;
          }
          throw error;
        }
      }

      if (!response) {
        logger.warn(`WB ${cabinet.name}: достигнут лимит events, используем частично загруженную историю (${collected.length} событий)`);
        break;
      }

      const payload = response.data?.data || response.data?.result || response.data || {};
      const events = payload?.events || payload?.items || payload?.messages || [];
      const normalizedEvents = Array.isArray(events) ? events : [];
      const nextCursor = payload?.next || payload?.nextCursor || payload?.cursor?.next || null;
      const totalEvents = payload?.totalEvents;
      const scopedEvents = targetSet
        ? normalizedEvents.filter((event) => targetSet.has(this.getWbEventChatId(event)))
        : normalizedEvents;

      if (targetSet) {
        if (scopedEvents.length > 0) {
          hasMatchedTarget = true;
          targetQuietPages = 0;
        } else if (hasMatchedTarget) {
          targetQuietPages += 1;
        }
      }

      if (debugLabel) {
        logger.debug(`WB events ${debugLabel}: page ${page + 1}, next=${next || 'null'}, batch=${normalizedEvents.length}, matched=${scopedEvents.length}, totalEvents=${totalEvents ?? 'n/a'}`);
      }

      if (!normalizedEvents.length) break;

      let added = 0;
      for (const event of scopedEvents) {
        const eventId = this.getWbEventId(event) || `${this.getWbEventChatId(event)}-${this.getWbEventCreatedAt(event)}`;
        if (seen.has(eventId)) continue;
        seen.add(eventId);
        collected.push(event);
        added += 1;
      }

      if (targetSet) {
        if (totalEvents === 0 || !nextCursor) break;
        if (!hasMatchedTarget && stopAfterInitialQuietPages > 0 && page + 1 >= stopAfterInitialQuietPages) {
          logger.info(`WB ${cabinet.name}: останавливаем поиск истории после ${page + 1} страниц без единого события целевого чата`);
          break;
        }
        if (hasMatchedTarget && stopAfterTargetQuietPages > 0 && targetQuietPages >= stopAfterTargetQuietPages) {
          logger.info(`WB ${cabinet.name}: останавливаем поиск истории после ${targetQuietPages} пустых страниц подряд для целевого чата`);
          break;
        }
      } else {
        if (totalEvents === 0 || !nextCursor || added === 0) break;
      }
      next = nextCursor;
      page += 1;
      await this.sleep(pageDelayMs);
    }

    return collected;
  }
}

// ─── Ozon ───
class OzonSyncService extends MarketplaceSyncService {
  constructor() {
    super('Ozon');
    this.baseUrl = config.marketplaces.ozon.baseUrl;
    this.chatListPath = config.marketplaces.ozon.chatListPath;
    this.chatHistoryPath = config.marketplaces.ozon.chatHistoryPath;
    this.productInfoListPath = config.marketplaces.ozon.productInfoListPath;
    this.questionListPath = config.marketplaces.ozon.questionListPath;
    this.questionInfoPath = config.marketplaces.ozon.questionInfoPath;
    this.questionAnswerListPath = config.marketplaces.ozon.questionAnswerListPath;
    this.questionAnswerCreatePath = config.marketplaces.ozon.questionAnswerCreatePath;
    this.productInfoCache = new Map();
  }

  getOzonChatId(chatData, chatMeta) {
    return chatData.chat_id || chatMeta.chat_id || chatMeta.id;
  }

  getOzonCustomerName(chatData, chatMeta, chatId) {
    const memberCollections = [
      chatData.users,
      chatMeta.users,
      chatData.members,
      chatMeta.members,
      chatData.participants,
      chatMeta.participants,
    ].filter(Array.isArray);

    for (const collection of memberCollections) {
      for (const user of collection) {
        const role = (
          user.role ||
          user.type ||
          user.user_type ||
          user.participant_type ||
          ''
        ).toString().toLowerCase();

        if (
          role.includes('seller') ||
          role.includes('manager') ||
          role.includes('operator') ||
          role.includes('admin')
        ) {
          continue;
        }

        const fullName = [
          user.name,
          user.full_name,
          user.username,
          user.fio,
          [user.first_name, user.last_name].filter(Boolean).join(' '),
          [user.firstName, user.lastName].filter(Boolean).join(' '),
          user.display_name,
          user.displayName,
        ].find((value) => value && value.trim());

        if (fullName) return fullName;
      }
    }

    const explicitName = (
      chatData.buyer_name ||
      chatData.buyerName ||
      chatData.customer_name ||
      chatData.customerName ||
      chatMeta.buyer_name ||
      chatMeta.buyerName ||
      chatMeta.customer_name ||
      chatMeta.customerName ||
      chatMeta.buyer?.name ||
      chatData.title ||
      chatMeta.title ||
      chatData.name ||
      chatMeta.name
    );

    if (explicitName && explicitName.trim()) {
      return explicitName;
    }

    return 'Покупатель';
  }

  isOzonBuyerSellerChat(chatData, chatMeta) {
    const chatType = (
      chatData.chat_type ||
      chatMeta.chat_type ||
      chatData.type ||
      chatMeta.type ||
      ''
    ).toString().toUpperCase();

    if (chatType === 'BUYER_SELLER') {
      return true;
    }

    if (chatType && ['NOTIFICATION', 'SYSTEM', 'BOT', 'SUPPORT'].some((token) => chatType.includes(token))) {
      return false;
    }

    const roles = [];
    const collectRoles = (value) => {
      if (!value) return;
      if (Array.isArray(value)) {
        value.forEach(collectRoles);
        return;
      }
      if (typeof value !== 'object') {
        roles.push(String(value).toLowerCase());
        return;
      }

      const directValues = [
        value.type,
        value.user_type,
        value.role,
        value.name,
        value.title,
        value.chat_type,
        value.participant_type,
      ];

      directValues.filter(Boolean).forEach((item) => roles.push(String(item).toLowerCase()));
      Object.values(value).forEach(collectRoles);
    };

    collectRoles(chatData.participants);
    collectRoles(chatMeta.participants);
    collectRoles(chatData.users);
    collectRoles(chatMeta.users);
    collectRoles(chatData.members);
    collectRoles(chatMeta.members);
    collectRoles(chatData.buyer);
    collectRoles(chatMeta.buyer);
    collectRoles(chatData.seller);
    collectRoles(chatMeta.seller);

    const hasBuyerRole = roles.some((role) => role.includes('buyer') || role.includes('customer') || role.includes('client'));
    const hasSellerRole = roles.some((role) => role.includes('seller') || role.includes('manager') || role.includes('operator') || role.includes('admin'));

    if (hasBuyerRole && hasSellerRole) {
      return true;
    }

    const hasBuyerMetadata = Boolean(
      chatData.buyer_name ||
      chatData.buyerName ||
      chatData.customer_name ||
      chatData.customerName ||
      chatMeta.buyer_name ||
      chatMeta.buyerName ||
      chatMeta.customer_name ||
      chatMeta.customerName ||
      chatMeta.buyer?.name
    );

    if (hasBuyerMetadata && (!chatType || chatType === 'UNSPECIFIED' || chatType === 'UNKNOWN')) {
      return true;
    }

    return false;
  }

  isOzonSystemMessage(msg) {
    const userType = (
      msg.user?.type ||
      msg.user?.user_type ||
      msg.sender ||
      ''
    ).toString().toLowerCase();

    return userType.includes('notification') || userType.includes('chatbot');
  }

  getOzonMessageCustomerName(msg, fallbackName) {
    const explicitName = [
      msg.user?.name,
      msg.user?.full_name,
      msg.user?.username,
      msg.user?.fio,
      [msg.user?.first_name, msg.user?.last_name].filter(Boolean).join(' '),
      [msg.user?.firstName, msg.user?.lastName].filter(Boolean).join(' '),
      msg.user?.display_name,
      msg.user?.displayName,
    ].find((value) => value && value.trim());

    if (explicitName) return explicitName;

    if ((msg.user?.type || '').toString().toLowerCase() === 'customer') {
      return fallbackName && !fallbackName.startsWith('Ozon чат')
        ? fallbackName
        : 'Покупатель';
    }

    return fallbackName;
  }

  getOzonLastMessageText(chatData, chatMeta) {
    return this.extractOzonText(
      chatData.last_message ||
      chatMeta.last_message ||
      chatData.lastMessage ||
      chatMeta.lastMessage
    );
  }

  getOzonLastMessageAt(chatData, chatMeta) {
    return this.parseMessageDate(
      chatData.last_message_created_at ||
      chatData.updated_at ||
      chatData.created_at ||
      chatMeta.last_message_created_at ||
      chatMeta.updated_at ||
      chatMeta.created_at
    );
  }

  getOzonLastHistoryMessage(messages) {
    const sorted = [...messages].sort((a, b) => {
      return this.parseMessageDate(a.created_at || a.createdAt) - this.parseMessageDate(b.created_at || b.createdAt);
    });

    for (let index = sorted.length - 1; index >= 0; index -= 1) {
      const msg = sorted[index];
      const text = this.extractOzonText(msg);
      if (text) {
        return {
          text,
          createdAt: this.parseMessageDate(msg.created_at || msg.createdAt),
          senderType: this.getOzonSenderType(msg),
          customerName: this.getOzonMessageCustomerName(msg, 'Покупатель'),
        };
      }
    }

    return null;
  }

  getOzonSortKey(chatData, chatMeta) {
    return String(
      chatData.last_message_id ||
      chatMeta.last_message_id ||
      chatData.lastMessageId ||
      chatMeta.lastMessageId ||
      ''
    );
  }

  getOzonSenderType(msg) {
    const sender = (
      msg.sender ||
      msg.author ||
      msg.user_type ||
      msg.user?.type ||
      msg.user?.user_type ||
      msg.user?.role ||
      ''
    ).toString().toLowerCase();

    if (!sender) return 'CUSTOMER';
    if (sender.includes('notification') || sender.includes('chatbot') || sender.includes('assistant')) {
      return 'SYSTEM';
    }
    if (
      sender.includes('seller') ||
      sender.includes('manager') ||
      sender.includes('operator') ||
      sender.includes('admin')
    ) {
      return 'MANAGER';
    }

    return 'CUSTOMER';
  }

  extractOzonText(value) {
    if (!value) return '';
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      for (const item of value) {
        const text = this.extractOzonText(item);
        if (text) return text;
      }
      return '';
    }
    if (typeof value !== 'object') return '';

    const directCandidates = [
      value.text,
      value.message,
      value.body,
      value.content,
      value.caption,
      value.title,
      value.value,
    ];

    for (const candidate of directCandidates) {
      const text = this.extractOzonText(candidate);
      if (text) return text;
    }

    const nestedCandidates = [
      value.data,
      value.content,
      value.message_data,
      value.payload,
      value.message,
    ];

    for (const candidate of nestedCandidates) {
      const text = this.extractOzonText(candidate);
      if (text) return text;
    }

    return '';
  }

  collectMediaCandidates(value, bucket = []) {
    if (!value) return bucket;

    if (typeof value === 'string') {
      if (/^https?:\/\//i.test(value)) {
        bucket.push({ url: value });
      }
      return bucket;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        this.collectMediaCandidates(item, bucket);
      }
      return bucket;
    }

    if (typeof value !== 'object') return bucket;

    const directUrl = value.url || value.src || value.link || value.href || value.file_url || value.fileUrl || value.original_url || value.originalUrl;
    if (typeof directUrl === 'string' && /^https?:\/\//i.test(directUrl)) {
      bucket.push({
        url: directUrl,
        thumbnailUrl: value.preview_url || value.previewUrl || value.thumbnail_url || value.thumbnailUrl || null,
        mimeType: value.mime_type || value.mimeType || value.content_type || value.contentType || null,
      });
    }

    for (const nested of Object.values(value)) {
      this.collectMediaCandidates(nested, bucket);
    }

    return bucket;
  }

  getOzonMessageMedia(msg) {
    const markdownMedia = this.extractMarkdownMedia(this.extractOzonText(msg));
    if (markdownMedia) return markdownMedia;

    const candidates = this.collectMediaCandidates(msg.data || msg.content || msg.message || msg);
    const imageCandidate = candidates.find((item) => {
      const source = `${item.mimeType || ''} ${item.url || ''}`.toLowerCase();
      return source.includes('image') || /\.(jpg|jpeg|png|gif|webp|bmp|heic)(\?|$)/i.test(source);
    });

    if (imageCandidate) {
      return {
        messageType: 'IMAGE',
        mediaUrl: imageCandidate.url,
        thumbnailUrl: imageCandidate.thumbnailUrl || imageCandidate.url,
        mediaMimeType: imageCandidate.mimeType || 'image/*',
      };
    }

    const genericCandidate = candidates[0];
    if (genericCandidate) {
      return {
        messageType: 'FILE',
        mediaUrl: genericCandidate.url,
        thumbnailUrl: genericCandidate.thumbnailUrl || null,
        mediaMimeType: genericCandidate.mimeType || null,
      };
    }

    return null;
  }

  getOzonQuestionId(item) {
    return item?.question_id || item?.questionId || item?.id || item?.question?.id || null;
  }

  getOzonQuestionCustomerName(item) {
    return (
      item?.author_name ||
      item?.authorName ||
      item?.author?.name ||
      item?.customer_name ||
      item?.user_name ||
      item?.userName ||
      item?.profile_name ||
      'Покупатель'
    );
  }

  getOzonQuestionText(item) {
    const raw = (
      item?.text ||
      item?.question_text ||
      item?.questionText ||
      item?.question ||
      item?.content ||
      item?.body ||
      item?.message ||
      ''
    );

    if (Array.isArray(raw)) return raw.filter(Boolean).join('\n').trim();
    if (typeof raw === 'object' && raw !== null) {
      return raw.text || raw.value || raw.content || '';
    }
    return String(raw || '').trim();
  }

  getOzonQuestionCreatedAt(item) {
    return (
      item?.created_at ||
      item?.createdAt ||
      item?.published_at ||
      item?.publishedAt ||
      item?.updated_at ||
      item?.updatedAt ||
      new Date().toISOString()
    );
  }

  normalizeOzonAnswerSenderType(answer) {
    const sender = `${answer?.author_type || answer?.authorType || answer?.sender_type || answer?.senderType || ''}`.toLowerCase();
    if (sender.includes('seller') || sender.includes('manager') || sender.includes('vendor')) return 'MANAGER';
    return 'MANAGER';
  }

  getOzonAnswerText(answer) {
    const raw = answer?.text || answer?.answer_text || answer?.answerText || answer?.content || answer?.message || '';
    if (Array.isArray(raw)) return raw.filter(Boolean).join('\n').trim();
    if (typeof raw === 'object' && raw !== null) return raw.text || raw.value || raw.content || '';
    return String(raw || '').trim();
  }

  getOzonAnswerCreatedAt(answer, fallback = null) {
    return (
      answer?.created_at ||
      answer?.createdAt ||
      answer?.published_at ||
      answer?.publishedAt ||
      answer?.updated_at ||
      answer?.updatedAt ||
      fallback ||
      new Date().toISOString()
    );
  }

  async fetchOzonQuestionDetails(cabinet, questionId) {
    const headers = {
      'Client-Id': cabinet.apiClientId,
      'Api-Key': cabinet.apiKey,
    };

    let info = null;
    let answers = [];

    try {
      const infoResp = await axios.post(
        `${this.baseUrl}${this.questionInfoPath}`,
        { question_id: questionId },
        { headers, timeout: 10000 }
      );

      info = infoResp.data?.result?.question || infoResp.data?.result || infoResp.data?.question || infoResp.data || null;
    } catch (error) {
      logger.warn(`Ozon ${cabinet.name}: не удалось получить info вопроса ${questionId}: ${error.response?.status || ''} ${error.message}`);
    }

    try {
      const answerResp = await axios.post(
        `${this.baseUrl}${this.questionAnswerListPath}`,
        { question_id: questionId },
        { headers, timeout: 10000 }
      );

      answers = answerResp.data?.result?.answers || answerResp.data?.answers || answerResp.data?.result || [];
      if (!Array.isArray(answers)) answers = [];
    } catch (error) {
      logger.warn(`Ozon ${cabinet.name}: не удалось получить ответы вопроса ${questionId}: ${error.response?.status || ''} ${error.message}`);
    }

    return { info, answers };
  }

  extractOzonProductMetadata(payload) {
    const source = payload || {};

    const findByKeyHints = (node, hints, options = {}, depth = 0) => {
      if (!node || depth > 6) return '';
      if (Array.isArray(node)) {
        for (const item of node) {
          const found = findByKeyHints(item, hints, options, depth + 1);
          if (found) return found;
        }
        return '';
      }
      if (typeof node !== 'object') return '';

      for (const [key, value] of Object.entries(node)) {
        const normalizedKey = key.toLowerCase();
        if (hints.some((hint) => normalizedKey.includes(hint))) {
          if (options.excludeHints?.some((hint) => normalizedKey.includes(hint))) {
            continue;
          }
          if (typeof value === 'string' && value.trim()) return value.trim();
          if (typeof value === 'number') return String(value);
        }
      }

      for (const value of Object.values(node)) {
        const found = findByKeyHints(value, hints, options, depth + 1);
        if (found) return found;
      }
      return '';
    };

    const productUrl = (
      source.product_url ||
      source.productUrl ||
      source.offer?.url ||
      source.product?.url ||
      ''
    ).toString().trim();

    const productTitle = (
      source.product_name ||
      source.productName ||
      source.offer_name ||
      source.offerName ||
      source.item_name ||
      source.itemName ||
      source.sku_name ||
      source.skuName ||
      source.nm_name ||
      source.nmName ||
      source.product?.name ||
      source.product?.title ||
      source.offer?.name ||
      source.offer?.title ||
      source.item?.name ||
      source.item?.title ||
      findByKeyHints(source, ['product_name', 'offer_name', 'item_name', 'sku_name', 'nm_name']) ||
      (() => {
        const match = productUrl.match(/\/product\/([^/?#]+)/i);
        if (!match?.[1]) return '';
        const slug = decodeURIComponent(match[1]).replace(/-\d+$/, '');
        return slug.replace(/-/g, ' ').trim();
      })() ||
      ''
    ).toString().trim();

    const sellerArticle = (
      source.seller_sku ||
      source.sellerSku ||
      source.vendor_code ||
      source.vendorCode ||
      source.shop_sku ||
      source.shopSku ||
      source.article ||
      source.product?.seller_sku ||
      source.product?.sellerSku ||
      source.product?.vendor_code ||
      source.product?.vendorCode ||
      source.offer?.seller_sku ||
      source.offer?.sellerSku ||
      source.offer?.vendor_code ||
      source.offer?.vendorCode ||
      source.offer?.shop_sku ||
      source.offer?.shopSku ||
      source.item?.seller_sku ||
      source.item?.sellerSku ||
      source.item?.vendor_code ||
      source.item?.vendorCode ||
      findByKeyHints(source, ['seller_sku', 'vendor_code', 'shop_sku', 'article'], { excludeHints: ['sku_name'] }) ||
      ''
    ).toString().trim();

    const offerId = (
      source.offer_id ||
      source.offerId ||
      source.offer?.id ||
      source.offer?.offer_id ||
      source.item?.offer_id ||
      source.item?.offerId ||
      source.product?.offer_id ||
      source.product?.offerId ||
      ''
    ).toString().trim();

    const skuRaw = source.sku || source.sku_id || source.skuId || source.product?.sku || source.product?.sku_id || source.product?.skuId || '';
    const sku = skuRaw === '' || skuRaw === null || skuRaw === undefined ? null : String(skuRaw).trim();

    const productIdRaw = source.product_id || source.productId || source.item_id || source.itemId || source.product?.id || source.offer?.product_id || '';
    const productId = productIdRaw === '' || productIdRaw === null || productIdRaw === undefined ? null : String(productIdRaw).trim();

    const productImage = this.extractProductImageUrl(source) || '';

    return {
      productTitle,
      sellerArticle,
      productImage,
      productUrl,
      offerId,
      sku,
      productId,
    };
  }

  getOzonMetadataCacheKey(cabinet, seed) {
    const normalizedSeed = JSON.stringify({
      offerId: seed.offerId || '',
      sellerArticle: seed.sellerArticle || '',
      sku: seed.sku || '',
      productId: seed.productId || '',
      productUrl: seed.productUrl || '',
    });
    return `${cabinet?.id || 'cabinet'}:${normalizedSeed}`;
  }

  normalizeOzonCatalogItem(item) {
    if (!item || typeof item !== 'object') return null;
    return {
      productTitle: (
        item.name ||
        item.product_name ||
        item.offer_name ||
        item.title ||
        ''
      ).toString().trim(),
      sellerArticle: (
        item.offer_id ||
        item.offerId ||
        item.seller_sku ||
        item.sellerSku ||
        item.vendor_code ||
        item.vendorCode ||
        item.shop_sku ||
        item.shopSku ||
        ''
      ).toString().trim(),
      productImage: (
        item.primary_image ||
        item.primaryImage ||
        item.image_url ||
        item.imageUrl ||
        this.extractProductImageUrl(item)
      ).toString().trim(),
      productUrl: (
        item.product_url ||
        item.productUrl ||
        item.url ||
        item.link ||
        item.offer_url ||
        item.offerUrl ||
        ''
      ).toString().trim(),
    };
  }

  async fetchOzonProductInfoList(cabinet, requestBody) {
    if (!this.productInfoListPath) return [];
    const response = await axios.post(
      `${this.baseUrl}${this.productInfoListPath}`,
      requestBody,
      {
        headers: {
          'Client-Id': cabinet.apiClientId,
          'Api-Key': cabinet.apiKey,
        },
        timeout: 10000,
      }
    );

    return (
      response.data?.result?.items ||
      response.data?.result?.products ||
      response.data?.result ||
      response.data?.items ||
      response.data?.products ||
      []
    );
  }

  async enrichOzonProductMetadata(cabinet, seedMetadata) {
    if (!cabinet?.apiClientId || !cabinet?.apiKey) return seedMetadata;
    const cacheKey = this.getOzonMetadataCacheKey(cabinet, seedMetadata);
    if (this.productInfoCache.has(cacheKey)) {
      return { ...seedMetadata, ...this.productInfoCache.get(cacheKey) };
    }

    const requests = [];
    if (seedMetadata.offerId) {
      requests.push({ offer_id: [seedMetadata.offerId] });
    }
    if (seedMetadata.sellerArticle && seedMetadata.sellerArticle !== seedMetadata.offerId) {
      requests.push({ offer_id: [seedMetadata.sellerArticle] });
    }
    if (seedMetadata.productId && /^\d+$/.test(seedMetadata.productId)) {
      requests.push({ product_id: [Number(seedMetadata.productId)] });
    }
    if (seedMetadata.sku && /^\d+$/.test(seedMetadata.sku)) {
      requests.push({ product_id: [Number(seedMetadata.sku)] });
      requests.push({ sku: [Number(seedMetadata.sku)] });
    }

    for (const requestBody of requests) {
      try {
        const items = await this.fetchOzonProductInfoList(cabinet, requestBody);
        const normalizedItems = Array.isArray(items) ? items : [];
        const first = normalizedItems.map((item) => this.normalizeOzonCatalogItem(item)).find(Boolean);
        if (first) {
          const enriched = {
            productTitle: first.productTitle || seedMetadata.productTitle || '',
            sellerArticle: first.sellerArticle || seedMetadata.sellerArticle || '',
            productImage: first.productImage || seedMetadata.productImage || '',
            productUrl: first.productUrl || seedMetadata.productUrl || '',
          };
          this.productInfoCache.set(cacheKey, enriched);
          return { ...seedMetadata, ...enriched };
        }
      } catch (error) {
        logger.debug(`Ozon ${cabinet.name}: product info request failed (${JSON.stringify(requestBody)}): ${error.response?.status || ''} ${error.message}`);
      }
    }

    const fallback = {
      productTitle: seedMetadata.productTitle || '',
      sellerArticle: seedMetadata.sellerArticle || '',
      productImage: seedMetadata.productImage || '',
      productUrl: seedMetadata.productUrl || '',
    };
    this.productInfoCache.set(cacheKey, fallback);
    return { ...seedMetadata, ...fallback };
  }

  async getQuestionMetadata(cabinet, externalChatId) {
    if (!cabinet?.apiClientId || !cabinet?.apiKey || !externalChatId?.startsWith('ozon-q-')) {
      return null;
    }

    const questionId = externalChatId.replace('ozon-q-', '');
    const { info } = await this.fetchOzonQuestionDetails(cabinet, questionId);
    const meta = await this.enrichOzonProductMetadata(cabinet, this.extractOzonProductMetadata(info || {}));
    return {
      productTitle: meta.productTitle,
      sellerArticle: meta.sellerArticle,
      productImage: meta.productImage || '',
      productUrl: meta.productUrl || '',
      orderTitle: meta.productTitle || '',
    };
  }

  async getChatMetadata(cabinet, externalChatId) {
    if (!cabinet?.apiClientId || !cabinet?.apiKey || !externalChatId?.startsWith('ozon-')) {
      return null;
    }

    const chatId = externalChatId.replace('ozon-', '');
    const response = await axios.post(
      `${this.baseUrl}${this.chatListPath}`,
      { limit: 100 },
      {
        headers: {
          'Client-Id': cabinet.apiClientId,
          'Api-Key': cabinet.apiKey,
        },
        timeout: 10000,
      }
    );

    const chats = response.data?.result?.chats || response.data?.chats || [];
    const matched = (Array.isArray(chats) ? chats : []).find((item) => String(this.getOzonChatId(item, item.chat || item) || '') === String(chatId));
    if (!matched) return null;

    const meta = await this.enrichOzonProductMetadata(cabinet, this.extractOzonProductMetadata({
      ...matched,
      ...(matched.chat || {}),
      last_message: matched.last_message || matched.chat?.last_message || null,
    }));

    return {
      productTitle: meta.productTitle,
      sellerArticle: meta.sellerArticle,
      productImage: meta.productImage || '',
      productUrl: meta.productUrl || '',
      orderTitle: meta.productTitle || '',
    };
  }

  async syncQuestions(cabinet, io) {
    try {
      if (!cabinet.apiClientId || !cabinet.apiKey) {
        logger.warn(`Ozon кабинет ${cabinet.name}: API не настроен`);
        return;
      }

      const headers = {
        'Client-Id': cabinet.apiClientId,
        'Api-Key': cabinet.apiKey,
      };

      const response = await axios.post(
        `${this.baseUrl}${this.questionListPath}`,
        { limit: 100 },
        { headers, timeout: 10000 }
      );

      const questions =
        response.data?.result?.questions ||
        response.data?.questions ||
        response.data?.result?.items ||
        response.data?.items ||
        [];

      logger.info(`Ozon ${cabinet.name}: question list returned ${questions.length} items`);
      if (questions[0]) {
        logger.debug(`Ozon ${cabinet.name}: sample question payload ${JSON.stringify(questions[0]).slice(0, 2500)}`);
      }

      for (const rawQuestion of questions) {
        const questionId = this.getOzonQuestionId(rawQuestion);
        if (!questionId) continue;

        const { info, answers } = await this.fetchOzonQuestionDetails(cabinet, questionId);
        if (info) {
          logger.debug(`Ozon ${cabinet.name}: question ${questionId} info ${JSON.stringify(info).slice(0, 2500)}`);
        }
        if (answers[0]) {
          logger.debug(`Ozon ${cabinet.name}: question ${questionId} sample answer ${JSON.stringify(answers[0]).slice(0, 2500)}`);
        }
        const question = info || rawQuestion;
        const customerName = this.getOzonQuestionCustomerName(question);
        const questionText = this.getOzonQuestionText(question);
        const questionCreatedAt = this.getOzonQuestionCreatedAt(question);
        const externalChatId = `ozon-q-${questionId}`;

        if (questionText) {
          await this.processIncomingMessage(cabinet, {
            externalChatId,
            customerName,
            text: questionText,
            externalMsgId: `ozon-question-${questionId}`,
            conversationType: 'QUESTION',
            senderType: 'CUSTOMER',
            createdAt: questionCreatedAt,
          }, io);
        }

        const embeddedAnswers = [];
        const directAnswerText = question?.answer_text || question?.answerText || question?.answer?.text || question?.answer;
        if (directAnswerText) {
          embeddedAnswers.push({
            id: question?.answer_id || question?.answerId || `${questionId}-embedded`,
            text: directAnswerText,
            created_at: question?.answer_created_at || question?.answerCreatedAt || question?.updated_at || question?.updatedAt || questionCreatedAt,
            author_type: 'seller',
          });
        }

        const mergedAnswers = [...embeddedAnswers, ...answers];
        for (const answer of mergedAnswers) {
          const answerText = this.getOzonAnswerText(answer);
          if (!answerText) continue;

          const answerId = answer?.answer_id || answer?.answerId || answer?.id || `${questionId}-${this.getOzonAnswerCreatedAt(answer, questionCreatedAt)}`;
          await this.processIncomingMessage(cabinet, {
            externalChatId,
            customerName,
            text: answerText,
            externalMsgId: `ozon-question-answer-${answerId}`,
            conversationType: 'QUESTION',
            senderType: this.normalizeOzonAnswerSenderType(answer),
            createdAt: this.getOzonAnswerCreatedAt(answer, questionCreatedAt),
          }, io);
        }
      }

      logger.info(`Ozon ${cabinet.name}: синхронизировано ${questions.length} вопросов`);
    } catch (error) {
      logger.error(`Ozon ${cabinet.name} ошибка синхронизации вопросов: ${error.message} | status: ${error.response?.status} | response: ${JSON.stringify(error.response?.data)}`);
    }
  }

  async syncChats(cabinet, io) {
    try {
      if (!cabinet.apiClientId || !cabinet.apiKey) {
        logger.warn(`Ozon кабинет ${cabinet.name}: API не настроен`);
        return;
      }

      // Ozon API: Получение чатов
      // Документация: https://docs.ozon.ru/api/seller/
      const response = await axios.post(
        `${this.baseUrl}${this.chatListPath}`,
        {
          limit: 100,
        },
        {
          headers: {
            'Client-Id': cabinet.apiClientId,
            'Api-Key': cabinet.apiKey,
          },
          timeout: 10000,
        }
      );

      const chats = response.data?.result?.chats || response.data?.chats || [];
      logger.info(`Ozon ${cabinet.name}: chat list returned ${chats.length} items`);

      let debugLogged = false;
      for (const chatData of chats) {
        const chatMeta = chatData.chat || chatData;
        const chatId = this.getOzonChatId(chatData, chatMeta);
        if (!chatId) {
          logger.warn(`Ozon ${cabinet.name}: пропуск чата без chat_id`);
          continue;
        }

        if (!this.isOzonBuyerSellerChat(chatData, chatMeta)) {
          const existingSystemChat = await prisma.chat.findFirst({
            where: {
              cabinetId: cabinet.id,
              externalChatId: `ozon-${chatId}`,
              conversationType: 'CHAT',
            },
          });

          if (existingSystemChat) {
            await prisma.chat.update({
              where: { id: existingSystemChat.id },
              data: {
                status: 'RESOLVED',
                unreadCount: 0,
              },
            });
          }

          if (!debugLogged) {
            logger.debug(`Ozon ${cabinet.name}: skip non buyer-seller chat ${chatId}`);
          }
          continue;
        }

        if (!debugLogged) {
          logger.debug(`Ozon ${cabinet.name}: sample chat payload ${JSON.stringify(chatData).slice(0, 2500)}`);
        }

        const externalChatId = `ozon-${chatId}`;
        const customerName = this.getOzonCustomerName(chatData, chatMeta, chatId);
        const sortKey = this.getOzonSortKey(chatData, chatMeta);
        const unreadCount = chatData.unread_count || chatMeta.unread_count || 0;
        const lastMessageText = this.getOzonLastMessageText(chatData, chatMeta);
        const lastMessageAt = this.getOzonLastMessageAt(chatData, chatMeta);

        const existingChat = await prisma.chat.findFirst({
          where: {
            cabinetId: cabinet.id,
            externalChatId,
            conversationType: 'CHAT',
          },
        });

        let chatRecord;

        if (!existingChat) {
          chatRecord = await prisma.chat.create({
            data: {
              cabinetId: cabinet.id,
              conversationType: 'CHAT',
              externalChatId,
              customerName,
              customerExternalId: sortKey || null,
              status: 'OPEN',
              unreadCount,
              lastMessageText,
              lastMessageAt,
            },
          });
        } else {
          chatRecord = await prisma.chat.update({
            where: { id: existingChat.id },
            data: {
              customerName,
              customerExternalId: sortKey || existingChat.customerExternalId,
              unreadCount,
              lastMessageText: lastMessageText || existingChat.lastMessageText,
              lastMessageAt: lastMessageAt || existingChat.lastMessageAt,
              status: 'OPEN',
            },
          });
        }

        const messages = await this.fetchOzonHistory(cabinet, chatId, !debugLogged ? `${cabinet.name}:${chatId}` : null);
        const sortedMessages = [...messages].sort((a, b) => {
          return this.parseMessageDate(a.created_at || a.createdAt) - this.parseMessageDate(b.created_at || b.createdAt);
        });

        if (!debugLogged) {
          logger.debug(`Ozon ${cabinet.name}: sample history count ${messages.length}`);
          logger.debug(`Ozon ${cabinet.name}: sample first message ${JSON.stringify(messages[0] || null).slice(0, 2500)}`);
          debugLogged = true;
        }

        for (const msg of sortedMessages) {
          const media = this.getOzonMessageMedia(msg);
          const rawText = this.extractOzonText(msg);
          const cleanText = this.stripMarkdownMedia(rawText);
          const text = cleanText || (media?.messageType === 'IMAGE' ? '📷 Фотография' : media?.messageType === 'FILE' ? '📎 Файл' : '');
          const senderType = this.getOzonSenderType(msg);
          const buyerName = this.getOzonMessageCustomerName(msg, customerName);

          if (text || media?.mediaUrl) {
            await this.processIncomingMessage(cabinet, {
              externalChatId,
              customerName: buyerName,
              text,
              messageType: media?.messageType || 'TEXT',
              mediaUrl: media?.mediaUrl || null,
              thumbnailUrl: media?.thumbnailUrl || null,
              mediaMimeType: media?.mediaMimeType || null,
              externalMsgId: `ozon-msg-${msg.message_id || msg.id}`,
              senderType,
              createdAt: msg.created_at || msg.createdAt,
            }, io);
          }
        }

        const lastHistoryMessage = this.getOzonLastHistoryMessage(sortedMessages);
        if (lastHistoryMessage && chatRecord) {
          await prisma.chat.update({
            where: { id: chatRecord.id },
            data: {
              customerName:
                chatRecord.customerName && chatRecord.customerName !== 'Покупатель'
                  ? chatRecord.customerName
                  : lastHistoryMessage.customerName || chatRecord.customerName,
              lastMessageText: lastHistoryMessage.text,
              lastMessageAt: lastHistoryMessage.createdAt,
              status: 'OPEN',
            },
          });
        }
      }

      await prisma.cabinet.update({
        where: { id: cabinet.id },
        data: { lastSyncAt: new Date() },
      });

      logger.info(`Ozon ${cabinet.name}: синхронизировано ${chats.length} чатов`);
    } catch (error) {
      logger.error(`Ozon ${cabinet.name} ошибка синхронизации: ${error.message} | status: ${error.response?.status} | response: ${JSON.stringify(error.response?.data)}`);
    }
  }

  async sendMessage(cabinet, externalChatId, text) {
    try {
      if (externalChatId.startsWith('ozon-q-')) {
        const questionId = externalChatId.replace('ozon-q-', '');
        await axios.post(
          `${this.baseUrl}${this.questionAnswerCreatePath}`,
          { question_id: questionId, text },
          {
            headers: {
              'Client-Id': cabinet.apiClientId,
              'Api-Key': cabinet.apiKey,
            },
            timeout: 10000,
          }
        );
        return true;
      }

      const chatId = externalChatId.replace('ozon-', '');
      await axios.post(
        `${this.baseUrl}/v1/chat/send/message`,
        { chat_id: chatId, text },
        {
          headers: {
            'Client-Id': cabinet.apiClientId,
            'Api-Key': cabinet.apiKey,
          },
          timeout: 10000,
        }
      );
      return true;
    } catch (error) {
      logger.error(`Ozon отправка ошибка:`, error.message);
      return false;
    }
  }

  async fetchOzonHistory(cabinet, chatId, debugLabel = null) {
    const headers = {
      'Client-Id': cabinet.apiClientId,
      'Api-Key': cabinet.apiKey,
    };

    const collected = [];
    const seen = new Set();
    let fromMessageId = 0;
    let page = 0;
    const maxPages = 20;
    const limit = 100;

    while (page < maxPages) {
      const msgResponse = await axios.post(
        `${this.baseUrl}${this.chatHistoryPath}`,
        {
          chat_id: chatId,
          from_message_id: fromMessageId,
          limit,
        },
        {
          headers,
          timeout: 10000,
        }
      );

      const batch = msgResponse.data?.result?.messages || msgResponse.data?.messages || [];
      if (debugLabel) {
        logger.debug(`Ozon history ${debugLabel}: page ${page + 1}, from_message_id=${fromMessageId}, batch=${batch.length}`);
      }
      if (!batch.length) break;

      let added = 0;
      for (const msg of batch) {
        const messageId = msg.message_id || msg.id;
        if (!messageId || seen.has(messageId)) continue;
        seen.add(messageId);
        collected.push(msg);
        added += 1;
      }

      const lastMessage = batch[batch.length - 1];
      const lastMessageId = lastMessage?.message_id || lastMessage?.id;
      if (!lastMessageId || added === 0 || batch.length < limit) break;

      fromMessageId = lastMessageId;
      page += 1;
    }

    return collected;
  }
}

// ─── Яндекс Маркет ───
class YandexMarketSyncService extends MarketplaceSyncService {
  constructor() {
    super('Яндекс Маркет');
    this.baseUrl = config.marketplaces.yandex.baseUrl;
  }

  async syncChats(cabinet, io) {
    try {
      if (!cabinet.apiToken || !cabinet.campaignId) {
        logger.warn(`ЯМ кабинет ${cabinet.name}: API не настроен`);
        return;
      }

      // Яндекс Маркет API: Получение чатов
      // Документация: https://yandex.ru/dev/market/partner-api/
      const response = await axios.post(
        `${this.baseUrl}/businesses/${cabinet.campaignId}/chats`,
        { page: 1, pageSize: 100 },
        {
          headers: {
            Authorization: `Bearer ${cabinet.apiToken}`,
          },
          timeout: 10000,
        }
      );

      const chats = response.data?.result?.chats || [];

      for (const chatData of chats) {
        // Получаем историю
        const historyResp = await axios.post(
          `${this.baseUrl}/businesses/${cabinet.campaignId}/chats/history`,
          { chatId: chatData.chatId, messageIdFrom: 0 },
          {
            headers: {
              Authorization: `Bearer ${cabinet.apiToken}`,
            },
            timeout: 10000,
          }
        );

        const messages = historyResp.data?.result?.messages || [];
        for (const msg of messages) {
          if (msg.sender === 'BUYER') {
            await this.processIncomingMessage(cabinet, {
              externalChatId: `ym-${chatData.chatId}`,
              customerName: chatData.buyer?.name || 'Покупатель ЯМ',
              text: msg.message || '',
              externalMsgId: `ym-msg-${msg.messageId}`,
            }, io);
          }
        }
      }

      await prisma.cabinet.update({
        where: { id: cabinet.id },
        data: { lastSyncAt: new Date() },
      });

      logger.info(`ЯМ ${cabinet.name}: синхронизировано ${chats.length} чатов`);
    } catch (error) {
      logger.error(`ЯМ ${cabinet.name} ошибка синхронизации: ${error.message} | response: ${JSON.stringify(error.response?.data)}`);
    }
  }

  extractYandexProductMetadata(payload) {
    const source = payload || {};

    const productTitle = (
      source.offerName ||
      source.offer_name ||
      source.itemName ||
      source.item_name ||
      source.title ||
      source.name ||
      source.offer?.name ||
      source.offer?.title ||
      source.item?.name ||
      source.item?.title ||
      source.order?.items?.[0]?.offerName ||
      source.order?.items?.[0]?.offer_name ||
      ''
    ).toString().trim();

    const sellerArticle = (
      source.offerId ||
      source.offer_id ||
      source.shopSku ||
      source.shop_sku ||
      source.vendorCode ||
      source.vendor_code ||
      source.sku ||
      source.offer?.offerId ||
      source.offer?.offer_id ||
      source.offer?.shopSku ||
      source.order?.items?.[0]?.offerId ||
      source.order?.items?.[0]?.offer_id ||
      ''
    ).toString().trim();

    const productImage = this.extractProductImageUrl(source.order?.items?.[0]) || this.extractProductImageUrl(source);
    const productUrl = (
      source.offerUrl ||
      source.offer_url ||
      source.productUrl ||
      source.product_url ||
      source.url ||
      source.link ||
      source.offer?.url ||
      source.item?.url ||
      source.order?.items?.[0]?.offerUrl ||
      source.order?.items?.[0]?.offer_url ||
      ''
    ).toString().trim();

    return { productTitle, sellerArticle, productImage, productUrl };
  }

  async getChatMetadata(cabinet, externalChatId) {
    if (!cabinet?.apiToken || !cabinet?.campaignId || !externalChatId?.startsWith('ym-')) {
      return null;
    }

    const chatId = externalChatId.replace('ym-', '');
    const response = await axios.post(
      `${this.baseUrl}/businesses/${cabinet.campaignId}/chats`,
      { page: 1, pageSize: 100 },
      {
        headers: {
          Authorization: `Bearer ${cabinet.apiToken}`,
        },
        timeout: 10000,
      }
    );

    const chats = response.data?.result?.chats || [];
    const matched = (Array.isArray(chats) ? chats : []).find((item) => String(item?.chatId || item?.id || '') === String(chatId));
    if (!matched) return null;

    const meta = this.extractYandexProductMetadata(matched);
    return {
      productTitle: meta.productTitle,
      sellerArticle: meta.sellerArticle,
      productImage: meta.productImage || '',
      productUrl: meta.productUrl || '',
      orderTitle: meta.productTitle || '',
    };
  }

  async sendMessage(cabinet, externalChatId, text) {
    try {
      const chatId = externalChatId.replace('ym-', '');
      await axios.post(
        `${this.baseUrl}/businesses/${cabinet.campaignId}/chats/message`,
        { chatId, message: text },
        {
          headers: {
            Authorization: `Bearer ${cabinet.apiToken}`,
          },
          timeout: 10000,
        }
      );
      return true;
    } catch (error) {
      logger.error(`ЯМ отправка ошибка:`, error.message);
      return false;
    }
  }
}

// ─── Фабрика сервисов ───
const services = {
  wb: new WildberriesSyncService(),
  ozon: new OzonSyncService(),
  yandex: new YandexMarketSyncService(),
};

const getSyncService = (marketplaceSlug) => {
  return services[marketplaceSlug] || null;
};

let syncInFlightPromise = null;

const getMarketplaceSyncPriority = (marketplaceSlug) => {
  switch (marketplaceSlug) {
    case 'ozon':
      return 0;
    case 'yandex':
      return 1;
    case 'wb':
      return 2;
    default:
      return 10;
  }
};

const isSyncInFlight = () => Boolean(syncInFlightPromise);

const syncAllMarketplaces = async (io) => {
  if (syncInFlightPromise) {
    logger.warn('Синхронизация уже выполняется, повторный запуск пропущен');
    return syncInFlightPromise;
  }

  syncInFlightPromise = (async () => {
    const cabinets = await prisma.cabinet.findMany({
      where: { isActive: true },
      include: { marketplace: true },
    });

    const sortedCabinets = cabinets.sort((a, b) => {
      const priorityDiff =
        getMarketplaceSyncPriority(a.marketplace.slug) -
        getMarketplaceSyncPriority(b.marketplace.slug);
      if (priorityDiff !== 0) return priorityDiff;

      const aSyncTime = a.lastSyncAt ? new Date(a.lastSyncAt).getTime() : 0;
      const bSyncTime = b.lastSyncAt ? new Date(b.lastSyncAt).getTime() : 0;
      return aSyncTime - bSyncTime;
    });

    logger.info(
      `Starting marketplace sync for ${sortedCabinets.length} cabinets: ${sortedCabinets
        .map((cabinet) => `${cabinet.marketplace.slug}:${cabinet.name}`)
        .join(', ')}`
    );

    for (const cabinet of sortedCabinets) {
    const service = getSyncService(cabinet.marketplace.slug);
    if (!service) continue;

    try {
      if (cabinet.marketplace.slug === 'ozon' && typeof service.syncQuestions === 'function') {
        logger.info(`Запуск синхронизации вопросов: ${cabinet.marketplace.name} ${cabinet.name}`);
        await service.syncQuestions(cabinet, io);
        logger.info(`Завершена синхронизация вопросов: ${cabinet.marketplace.name} ${cabinet.name}`);
      }

      logger.info(`Запуск синхронизации чатов: ${cabinet.marketplace.name} ${cabinet.name}`);
      await service.syncChats(cabinet, io);
      logger.info(`Завершена синхронизация чатов: ${cabinet.marketplace.name} ${cabinet.name}`);

      if (cabinet.marketplace.slug !== 'ozon' && typeof service.syncQuestions === 'function') {
        logger.info(`Запуск синхронизации вопросов: ${cabinet.marketplace.name} ${cabinet.name}`);
        await service.syncQuestions(cabinet, io);
        logger.info(`Завершена синхронизация вопросов: ${cabinet.marketplace.name} ${cabinet.name}`);
      }
    } catch (error) {
      logger.error(`Ошибка ручной синхронизации ${cabinet.name}: ${error.message}`);
    }
  }
  })();

  try {
    await syncInFlightPromise;
  } finally {
    syncInFlightPromise = null;
  }
};

module.exports = {
  getSyncService,
  isSyncInFlight,
  syncAllMarketplaces,
  WildberriesSyncService,
  OzonSyncService,
  YandexMarketSyncService,
};
