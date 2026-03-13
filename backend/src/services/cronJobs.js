// ══════════════════════════════════════════════
// MP CRM — Scheduled Jobs (Cron)
// ══════════════════════════════════════════════

const cron = require('node-cron');
const prisma = require('../config/database');
const { getSyncService } = require('./marketplaceSync');
const logger = require('../utils/logger');

const setupCronJobs = (io) => {
  // ─── Синхронизация чатов каждые 2 минуты ───
  cron.schedule('*/2 * * * *', async () => {
    logger.info('⏰ Запуск синхронизации чатов...');
    try {
      const cabinets = await prisma.cabinet.findMany({
        where: { isActive: true },
        include: { marketplace: true },
      });

      for (const cabinet of cabinets) {
        const service = getSyncService(cabinet.marketplace.slug);
        if (service) {
          await service.syncChats(cabinet, io);
        }
      }

      logger.info('✅ Синхронизация чатов завершена');
    } catch (error) {
      logger.error('❌ Ошибка синхронизации:', error);
    }
  });

  // ─── Проверка просроченных задач каждую минуту ───
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();

      // Помечаем просроченные задачи
      const result = await prisma.task.updateMany({
        where: {
          dueDate: { lt: now },
          status: { in: ['TODO', 'IN_PROGRESS'] },
          isOverdue: false,
        },
        data: { isOverdue: true },
      });

      if (result.count > 0) {
        logger.info(`⚠️ Просрочено задач: ${result.count}`);

        // Получаем просроченные задачи для уведомлений
        const overdueTasks = await prisma.task.findMany({
          where: {
            isOverdue: true,
            status: { in: ['TODO', 'IN_PROGRESS'] },
          },
          select: { id: true, title: true, userId: true, dueDate: true },
        });

        // Создаём уведомления и отправляем через WS
        for (const task of overdueTasks) {
          // Проверяем нет ли уже уведомления
          const existingNotif = await prisma.notification.findFirst({
            where: {
              userId: task.userId,
              type: 'TASK_OVERDUE',
              data: { path: ['taskId'], equals: task.id },
            },
          });

          if (!existingNotif) {
            await prisma.notification.create({
              data: {
                userId: task.userId,
                type: 'TASK_OVERDUE',
                title: 'Просроченная задача',
                body: `Задача "${task.title}" просрочена`,
                data: { taskId: task.id },
              },
            });

            // WS уведомление
            io.to(`user:${task.userId}`).emit('task_overdue', {
              taskId: task.id,
              title: task.title,
              dueDate: task.dueDate,
            });
          }
        }
      }
    } catch (error) {
      logger.error('Ошибка проверки задач:', error);
    }
  });

  // ─── Агрегация аналитики каждый час ───
  cron.schedule('0 * * * *', async () => {
    logger.info('📊 Агрегация аналитики...');
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const cabinets = await prisma.cabinet.findMany({
        where: { isActive: true },
      });

      for (const cabinet of cabinets) {
        const chats = await prisma.chat.findMany({
          where: {
            cabinetId: cabinet.id,
            createdAt: { gte: today },
          },
          include: {
            messages: {
              orderBy: { createdAt: 'asc' },
              select: { senderType: true, createdAt: true },
            },
          },
        });

        const responseTimes = [];
        chats.forEach((chat) => {
          for (let i = 0; i < chat.messages.length - 1; i++) {
            if (
              chat.messages[i].senderType === 'CUSTOMER' &&
              chat.messages[i + 1].senderType === 'MANAGER'
            ) {
              responseTimes.push(
                (new Date(chat.messages[i + 1].createdAt) -
                  new Date(chat.messages[i].createdAt)) /
                  1000
              );
            }
          }
        });

        const avgSec = responseTimes.length
          ? responseTimes.reduce((s, t) => s + t, 0) / responseTimes.length
          : 0;

        await prisma.analyticsSnapshot.upsert({
          where: {
            cabinetId_date: { cabinetId: cabinet.id, date: today },
          },
          update: {
            totalChats: chats.length,
            avgResponseSec: Math.round(avgSec),
            maxResponseSec: responseTimes.length ? Math.round(Math.max(...responseTimes)) : 0,
            minResponseSec: responseTimes.length ? Math.round(Math.min(...responseTimes)) : 0,
            totalMessages: chats.reduce((s, c) => s + c.messages.length, 0),
          },
          create: {
            cabinetId: cabinet.id,
            date: today,
            totalChats: chats.length,
            avgResponseSec: Math.round(avgSec),
            maxResponseSec: responseTimes.length ? Math.round(Math.max(...responseTimes)) : 0,
            minResponseSec: responseTimes.length ? Math.round(Math.min(...responseTimes)) : 0,
            totalMessages: chats.reduce((s, c) => s + c.messages.length, 0),
          },
        });
      }

      logger.info('✅ Аналитика обновлена');
    } catch (error) {
      logger.error('Ошибка аналитики:', error);
    }
  });

  // ─── Напоминания о задачах за 15 минут ───
  cron.schedule('* * * * *', async () => {
    try {
      const now = new Date();
      const in15min = new Date(now.getTime() + 15 * 60 * 1000);

      const upcomingTasks = await prisma.task.findMany({
        where: {
          dueDate: { gte: now, lte: in15min },
          status: { in: ['TODO', 'IN_PROGRESS'] },
        },
      });

      for (const task of upcomingTasks) {
        const existingNotif = await prisma.notification.findFirst({
          where: {
            userId: task.userId,
            type: 'TASK_REMINDER',
            data: { path: ['taskId'], equals: task.id },
            createdAt: { gte: new Date(now.getTime() - 20 * 60 * 1000) },
          },
        });

        if (!existingNotif) {
          await prisma.notification.create({
            data: {
              userId: task.userId,
              type: 'TASK_REMINDER',
              title: 'Напоминание',
              body: `Задача "${task.title}" через 15 минут`,
              data: { taskId: task.id },
            },
          });

          io.to(`user:${task.userId}`).emit('task_reminder', {
            taskId: task.id,
            title: task.title,
            dueDate: task.dueDate,
          });
        }
      }
    } catch (error) {
      logger.error('Ошибка напоминаний:', error);
    }
  });

  logger.info('🕐 Cron задачи запущены');
};

module.exports = { setupCronJobs };
