// ══════════════════════════════════════════════
// MP CRM Frontend — WebSocket Service
// ══════════════════════════════════════════════

import { io } from 'socket.io-client';

const WS_URL = import.meta.env.VITE_WS_URL || 'http://localhost:4000';

class WebSocketService {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(token) {
    if (this.socket?.connected) return;

    this.socket = io(WS_URL, {
      auth: { token },
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: 10,
      timeout: 20000,
    });

    this.socket.on('connect', () => {
      console.log('🔌 WebSocket подключён');
    });

    this.socket.on('disconnect', (reason) => {
      console.log('🔌 WebSocket отключён:', reason);
    });

    this.socket.on('connect_error', (error) => {
      console.error('🔌 WebSocket ошибка:', error.message);
    });

    // Переподключаем все слушатели
    this.listeners.forEach((callbacks, event) => {
      callbacks.forEach((cb) => this.socket.on(event, cb));
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Подписка на событие
  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);

    if (this.socket) {
      this.socket.on(event, callback);
    }
  }

  // Отписка
  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
    if (this.socket) {
      this.socket.off(event, callback);
    }
  }

  // Отправка события
  emit(event, data) {
    if (this.socket?.connected) {
      this.socket.emit(event, data);
    }
  }

  // Подписка на чат
  joinChat(chatId) {
    this.emit('join_chat', chatId);
  }

  leaveChat(chatId) {
    this.emit('leave_chat', chatId);
  }

  // Подписка на кабинет
  joinCabinet(cabinetId) {
    this.emit('join_cabinet', cabinetId);
  }

  leaveCabinet(cabinetId) {
    this.emit('leave_cabinet', cabinetId);
  }

  // Отправка сообщения
  sendMessage(chatId, text) {
    this.emit('send_message', { chatId, text });
  }

  // Индикатор печати
  startTyping(chatId) {
    this.emit('typing', { chatId });
  }

  stopTyping(chatId) {
    this.emit('stop_typing', { chatId });
  }

  // Пометить прочитанным
  markRead(chatId) {
    this.emit('mark_read', { chatId });
  }
}

// Singleton
const wsService = new WebSocketService();
export default wsService;
