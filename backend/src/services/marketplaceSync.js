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

  async syncChats(cabinet, io) {
    throw new Error('syncChats() не реализован');
  }

  async sendMessage(cabinet, externalChatId, text) {
    throw new Error('sendMessage() не реализован');
  }

  async processIncomingMessage(cabinet, rawMessage, io) {
    const { externalChatId, customerName, text, externalMsgId } = rawMessage;

    // Найти или создать чат
    let chat = await prisma.chat.findFirst({
      where: { cabinetId: cabinet.id, externalChatId },
    });

    if (!chat) {
      chat = await prisma.chat.create({
        data: {
          cabinetId: cabinet.id,
          externalChatId,
          customerName: customerName || 'Покупатель',
          status: 'OPEN',
        },
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
        senderType: 'CUSTOMER',
        text,
        externalMsgId,
      },
    });

    // Обновляем чат
    await prisma.chat.update({
      where: { id: chat.id },
      data: {
        lastMessageAt: new Date(),
        lastMessageText: text,
        unreadCount: { increment: 1 },
        status: 'OPEN',
      },
    });

    // WebSocket уведомление
    if (io) {
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
        }, io);
      }

      // Обновляем время синхронизации
      await prisma.cabinet.update({
        where: { id: cabinet.id },
        data: { lastSyncAt: new Date() },
      });

      logger.info(`WB ${cabinet.name}: синхронизировано ${questions.length} вопросов`);
    } catch (error) {
      logger.error(`WB ${cabinet.name} ошибка синхронизации:`, error.message);
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
        `${this.baseUrl}/v2/chat/list`,
        {
          chat_id_list: [],
          page: 1,
          page_size: 100,
        },
        {
          headers: {
            'Client-Id': cabinet.apiClientId,
            'Api-Key': cabinet.apiKey,
          },
          timeout: 10000,
        }
      );

      const chats = response.data?.result?.chats || [];

      for (const chatData of chats) {
        // Получаем сообщения чата
        const msgResponse = await axios.post(
          `${this.baseUrl}/v2/chat/history`,
          {
            chat_id: chatData.chat_id,
            from_message_id: 0,
            limit: 50,
          },
          {
            headers: {
              'Client-Id': cabinet.apiClientId,
              'Api-Key': cabinet.apiKey,
            },
            timeout: 10000,
          }
        );

        const messages = msgResponse.data?.result?.messages || [];
        for (const msg of messages) {
          if (msg.sender === 'buyer') {
            await this.processIncomingMessage(cabinet, {
              externalChatId: `ozon-${chatData.chat_id}`,
              customerName: chatData.buyer_name || 'Покупатель Ozon',
              text: msg.data?.text || '',
              externalMsgId: `ozon-msg-${msg.message_id}`,
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
      logger.error(`Ozon ${cabinet.name} ошибка синхронизации:`, error.message);
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
      logger.error(`ЯМ ${cabinet.name} ошибка синхронизации:`, error.message);
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

module.exports = { getSyncService, WildberriesSyncService, OzonSyncService, YandexMarketSyncService };
