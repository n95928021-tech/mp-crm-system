// ══════════════════════════════════════════════
// MP CRM — WebSocket Handler
// ══════════════════════════════════════════════

const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../config/database');
const logger = require('../utils/logger');

const setupWebSocket = (io) => {
  // Аутентификация WebSocket
  io.use(async (socket, next) => {
    try {
      const token = socket.handshake.auth.token;
      if (!token) {
        return next(new Error('Необходима авторизация'));
      }

      const decoded = jwt.verify(token, config.jwt.secret);
      const user = await prisma.user.findUnique({
        where: { id: decoded.userId },
        select: { id: true, firstName: true, lastName: true, role: true },
      });

      if (!user) {
        return next(new Error('Пользователь не найден'));
      }

      socket.user = user;
      next();
    } catch (error) {
      next(new Error('Невалидный токен'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    logger.info(`WS подключён: ${user.firstName} ${user.lastName} (${user.id})`);

    // Подключаем пользователя к его персональной комнате
    socket.join(`user:${user.id}`);

    // ─── Подписка на чат ───
    socket.on('join_chat', (chatId) => {
      socket.join(`chat:${chatId}`);
      logger.debug(`${user.id} подключился к чату ${chatId}`);
    });

    socket.on('leave_chat', (chatId) => {
      socket.leave(`chat:${chatId}`);
    });

    // ─── Подписка на кабинет (все чаты кабинета) ───
    socket.on('join_cabinet', (cabinetId) => {
      socket.join(`cabinet:${cabinetId}`);
      logger.debug(`${user.id} подключился к кабинету ${cabinetId}`);
    });

    socket.on('leave_cabinet', (cabinetId) => {
      socket.leave(`cabinet:${cabinetId}`);
    });

    // ─── Менеджер печатает ───
    socket.on('typing', ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit('user_typing', {
        chatId,
        user: { id: user.id, firstName: user.firstName },
      });
    });

    socket.on('stop_typing', ({ chatId }) => {
      socket.to(`chat:${chatId}`).emit('user_stop_typing', {
        chatId,
        userId: user.id,
      });
    });

    // ─── Отправка сообщения через WS ───
    socket.on('send_message', async ({ chatId, text }) => {
      try {
        const message = await prisma.chatMessage.create({
          data: {
            chatId,
            senderType: 'MANAGER',
            senderId: user.id,
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

        // Уведомляем всех в чате
        io.to(`chat:${chatId}`).emit('new_message', { chatId, message });

        // Обновляем список чатов для кабинета
        const chat = await prisma.chat.findUnique({
          where: { id: chatId },
          select: { cabinetId: true },
        });
        if (chat) {
          io.to(`cabinet:${chat.cabinetId}`).emit('chat_updated', {
            chatId,
            lastMessageAt: new Date(),
            lastMessageText: text,
            unreadCount: 0,
          });
        }

        logger.debug(`WS сообщение отправлено в ${chatId} от ${user.id}`);
      } catch (error) {
        socket.emit('error', { message: 'Ошибка отправки сообщения' });
        logger.error('WS ошибка отправки:', error);
      }
    });

    // ─── Пометить как прочитанное ───
    socket.on('mark_read', async ({ chatId }) => {
      try {
        await prisma.chatMessage.updateMany({
          where: { chatId, isRead: false, senderType: 'CUSTOMER' },
          data: { isRead: true },
        });
        await prisma.chat.update({
          where: { id: chatId },
          data: { unreadCount: 0 },
        });

        socket.emit('chat_read', { chatId });
      } catch (error) {
        logger.error('WS ошибка mark_read:', error);
      }
    });

    // ─── Отключение ───
    socket.on('disconnect', (reason) => {
      logger.info(`WS отключён: ${user.id} (${reason})`);
    });
  });

  return io;
};

// Утилита: отправить уведомление о новом сообщении от клиента
const notifyNewCustomerMessage = (io, chatId, cabinetId, message) => {
  io.to(`chat:${chatId}`).emit('new_message', { chatId, message });
  io.to(`cabinet:${cabinetId}`).emit('chat_updated', {
    chatId,
    lastMessageAt: message.createdAt,
    lastMessageText: message.text,
    unreadCount: 1, // increment на клиенте
  });
  // Звуковое уведомление
  io.to(`cabinet:${cabinetId}`).emit('notification_sound', {
    type: 'new_message',
    chatId,
  });
};

module.exports = { setupWebSocket, notifyNewCustomerMessage };
