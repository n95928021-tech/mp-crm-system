const prisma = require('../config/database');
const logger = require('../utils/logger');

// GET /analytics/response-time — среднее время ответа
exports.getResponseTimeAnalytics = async (req, res, next) => {
  try {
    const { startDate, endDate, cabinetId, marketplaceId } = req.query;

    // Базовый фильтр
    const chatWhere = { conversationType: 'CHAT' };
    if (cabinetId) chatWhere.cabinetId = cabinetId;
    if (marketplaceId) chatWhere.cabinet = { marketplaceId };

    const dateFilter = {};
    if (startDate) dateFilter.gte = new Date(startDate);
    if (endDate) dateFilter.lte = new Date(endDate);
    if (Object.keys(dateFilter).length) chatWhere.createdAt = dateFilter;

    // Получаем все чаты с сообщениями для расчёта
    const chats = await prisma.chat.findMany({
      where: chatWhere,
      include: {
        cabinet: { include: { marketplace: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { senderType: true, createdAt: true },
        },
      },
    });

    // Считаем среднее время ответа по каждому чату
    const chatMetrics = chats.map((chat) => {
      const responseTimes = [];

      for (let i = 0; i < chat.messages.length - 1; i++) {
        const msg = chat.messages[i];
        const nextMsg = chat.messages[i + 1];

        // Клиент написал → менеджер ответил
        if (msg.senderType === 'CUSTOMER' && nextMsg.senderType === 'MANAGER') {
          const diff = (new Date(nextMsg.createdAt) - new Date(msg.createdAt)) / 1000;
          responseTimes.push(diff);
        }
      }

      const avg = responseTimes.length
        ? responseTimes.reduce((s, t) => s + t, 0) / responseTimes.length
        : null;

      return {
        chatId: chat.id,
        cabinetId: chat.cabinetId,
        cabinetName: chat.cabinet.name,
        marketplaceId: chat.cabinet.marketplaceId,
        marketplaceName: chat.cabinet.marketplace.name,
        avgResponseSec: avg ? Math.round(avg) : null,
        maxResponseSec: responseTimes.length ? Math.round(Math.max(...responseTimes)) : null,
        minResponseSec: responseTimes.length ? Math.round(Math.min(...responseTimes)) : null,
        messageCount: chat.messages.length,
        responseCount: responseTimes.length,
      };
    });

    // Агрегация по кабинетам
    const byCabinet = {};
    chatMetrics.forEach((m) => {
      if (m.avgResponseSec === null) return;
      if (!byCabinet[m.cabinetId]) {
        byCabinet[m.cabinetId] = {
          cabinetId: m.cabinetId,
          cabinetName: m.cabinetName,
          marketplaceId: m.marketplaceId,
          marketplaceName: m.marketplaceName,
          totalResponseSec: 0,
          count: 0,
          maxResponseSec: 0,
        };
      }
      byCabinet[m.cabinetId].totalResponseSec += m.avgResponseSec;
      byCabinet[m.cabinetId].count++;
      byCabinet[m.cabinetId].maxResponseSec = Math.max(
        byCabinet[m.cabinetId].maxResponseSec,
        m.maxResponseSec || 0
      );
    });

    const cabinetStats = Object.values(byCabinet).map((c) => ({
      ...c,
      avgResponseSec: Math.round(c.totalResponseSec / c.count),
    }));

    // Агрегация по маркетплейсам
    const byMarketplace = {};
    cabinetStats.forEach((c) => {
      if (!byMarketplace[c.marketplaceId]) {
        byMarketplace[c.marketplaceId] = {
          marketplaceId: c.marketplaceId,
          marketplaceName: c.marketplaceName,
          totalResponseSec: 0,
          count: 0,
        };
      }
      byMarketplace[c.marketplaceId].totalResponseSec += c.avgResponseSec * c.count;
      byMarketplace[c.marketplaceId].count += c.count;
    });

    const marketplaceStats = Object.values(byMarketplace).map((m) => ({
      ...m,
      avgResponseSec: Math.round(m.totalResponseSec / m.count),
    }));

    // Общее среднее
    const allAvgs = chatMetrics.filter((m) => m.avgResponseSec !== null);
    const totalAvg = allAvgs.length
      ? Math.round(allAvgs.reduce((s, m) => s + m.avgResponseSec, 0) / allAvgs.length)
      : 0;

    res.json({
      success: true,
      data: {
        totalAvgResponseSec: totalAvg,
        totalChats: chats.length,
        byMarketplace: marketplaceStats,
        byCabinet: cabinetStats,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /analytics/response-time/export — выгрузка CSV
exports.exportResponseTimeCSV = async (req, res, next) => {
  try {
    const { startDate, endDate } = req.query;

    const chatWhere = { conversationType: 'CHAT' };
    if (startDate || endDate) {
      chatWhere.createdAt = {};
      if (startDate) chatWhere.createdAt.gte = new Date(startDate);
      if (endDate) chatWhere.createdAt.lte = new Date(endDate);
    }

    const chats = await prisma.chat.findMany({
      where: chatWhere,
      include: {
        cabinet: { include: { marketplace: true } },
        messages: {
          orderBy: { createdAt: 'asc' },
          select: { senderType: true, createdAt: true },
        },
        assignedManager: {
          select: { firstName: true, lastName: true },
        },
      },
    });

    // CSV header
    const lines = [
      'Маркетплейс,Кабинет,Менеджер,Клиент,Среднее время ответа (сек),Кол-во сообщений,Дата',
    ];

    chats.forEach((chat) => {
      const responseTimes = [];
      for (let i = 0; i < chat.messages.length - 1; i++) {
        if (
          chat.messages[i].senderType === 'CUSTOMER' &&
          chat.messages[i + 1].senderType === 'MANAGER'
        ) {
          responseTimes.push(
            (new Date(chat.messages[i + 1].createdAt) - new Date(chat.messages[i].createdAt)) / 1000
          );
        }
      }

      const avg = responseTimes.length
        ? Math.round(responseTimes.reduce((s, t) => s + t, 0) / responseTimes.length)
        : 'N/A';

      const manager = chat.assignedManager
        ? `${chat.assignedManager.firstName} ${chat.assignedManager.lastName}`
        : 'Не назначен';

      lines.push(
        [
          chat.cabinet.marketplace.name,
          chat.cabinet.name,
          manager,
          chat.customerName,
          avg,
          chat.messages.length,
          new Date(chat.createdAt).toISOString().split('T')[0],
        ].join(',')
      );
    });

    const csv = lines.join('\n');

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename=analytics_${Date.now()}.csv`);
    // BOM для корректного отображения кириллицы в Excel
    res.send('\uFEFF' + csv);
  } catch (error) {
    next(error);
  }
};

// GET /analytics/dashboard — сводная статистика
exports.getDashboard = async (req, res, next) => {
  try {
    const [
      totalChats,
      openChats,
      totalTasks,
      overdueTasks,
      totalMessages,
      unreadMessages,
    ] = await Promise.all([
      prisma.chat.count({ where: { conversationType: 'CHAT' } }),
      prisma.chat.count({ where: { conversationType: 'CHAT', status: 'OPEN' } }),
      prisma.task.count({ where: { userId: req.user.id } }),
      prisma.task.count({
        where: {
          userId: req.user.id,
          status: { not: 'DONE' },
          dueDate: { lt: new Date() },
        },
      }),
      prisma.chatMessage.count(),
      prisma.chat.aggregate({ where: { conversationType: 'CHAT' }, _sum: { unreadCount: true } }),
    ]);

    res.json({
      success: true,
      data: {
        totalChats,
        openChats,
        totalTasks,
        overdueTasks,
        totalMessages,
        unreadMessages: unreadMessages._sum.unreadCount || 0,
      },
    });
  } catch (error) {
    next(error);
  }
};
