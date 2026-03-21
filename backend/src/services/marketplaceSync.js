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
  constructor(name) {
    this.name = name;
  }

  parseMessageDate(value) {
    if (!value) return new Date();
    const parsed = new Date(value);
    if (!Number.isNaN(parsed.getTime())) return parsed;
    return new Date();
  }

  async syncChats(cabinet, io) {
    throw new Error('syncChats() не реализован');
  }

  async sendMessage(cabinet, externalChatId, text) {
    throw new Error('sendMessage() не реализован');
  }

  async processIncomingMessage(cabinet, rawMessage, io) {
    const {
      externalChatId,
      customerName,
      text,
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
      if (existing) return null;
    }

    // Создаём сообщение
    const message = await prisma.chatMessage.create({
      data: {
        chatId: chat.id,
        senderType,
        text,
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
  }

  async syncChats(cabinet, io) {
    try {
      if (!cabinet.apiToken) {
        logger.warn(`WB кабинет ${cabinet.name}: API токен не настроен`);
        return;
      }

      // WB API: Получение вопросов/чатов
      // Документация: https://openapi.wildberries.ru/
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

      // Обновляем время синхронизации
      await prisma.cabinet.update({
        where: { id: cabinet.id },
        data: { lastSyncAt: new Date() },
      });

      logger.info(`WB ${cabinet.name}: синхронизировано ${questions.length} вопросов`);
    } catch (error) {
      logger.error(`WB ${cabinet.name} ошибка синхронизации: ${error.message} | response: ${JSON.stringify(error.response?.data)}`);
    }
  }

  async sendMessage(cabinet, externalChatId, text) {
    try {
      // WB API: Ответ на вопрос
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
}

// ─── Ozon ───
class OzonSyncService extends MarketplaceSyncService {
  constructor() {
    super('Ozon');
    this.baseUrl = config.marketplaces.ozon.baseUrl;
    this.chatListPath = config.marketplaces.ozon.chatListPath;
    this.chatHistoryPath = config.marketplaces.ozon.chatHistoryPath;
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

    return `Ozon чат ${String(chatId).slice(-8)}`;
  }

  isOzonBuyerSellerChat(chatData, chatMeta) {
    const chatType = (
      chatData.chat_type ||
      chatMeta.chat_type ||
      chatData.type ||
      chatMeta.type ||
      ''
    ).toString().toUpperCase();

    return chatType === 'BUYER_SELLER';
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

    if ((msg.user?.type || '').toString().toLowerCase() === 'customer' && msg.user?.id) {
      return `Покупатель ${msg.user.id}`;
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

        if (!existingChat) {
          await prisma.chat.create({
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
          await prisma.chat.update({
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
          const text = this.extractOzonText(msg);
          const senderType = this.getOzonSenderType(msg);
          const buyerName = this.getOzonMessageCustomerName(msg, customerName);

          if (text) {
            await this.processIncomingMessage(cabinet, {
              externalChatId,
              customerName: buyerName,
              text,
              externalMsgId: `ozon-msg-${msg.message_id || msg.id}`,
              senderType,
              createdAt: msg.created_at || msg.createdAt,
            }, io);
          }
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

  for (const cabinet of cabinets) {
    const service = getSyncService(cabinet.marketplace.slug);
    if (!service) continue;

    try {
      await service.syncChats(cabinet, io);
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
  syncAllMarketplaces,
  WildberriesSyncService,
  OzonSyncService,
  YandexMarketSyncService,
};
