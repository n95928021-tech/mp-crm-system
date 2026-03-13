// ══════════════════════════════════════════════
// MP CRM — Server Entry Point
// ══════════════════════════════════════════════

require('dotenv').config();

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const routes = require('./routes');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const { setupWebSocket } = require('./websocket');
const { setupCronJobs } = require('./services/cronJobs');
const logger = require('./utils/logger');

// ─── Express App ───
const app = express();
const server = http.createServer(app);

// ─── Socket.IO ───
const io = new Server(server, {
  cors: {
    origin: config.cors.origin,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  pingTimeout: 60000,
  pingInterval: 25000,
});

// Делаем io доступным через app
app.set('io', io);

// ─── Middleware ───
app.use(helmet());
app.use(cors(config.cors));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Логирование HTTP
app.use(
  morgan('short', {
    stream: { write: (msg) => logger.http(msg.trim()) },
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 минут
  max: 1000,
  message: { success: false, error: 'Слишком много запросов' },
});
app.use(config.apiPrefix, limiter);

// ─── Routes ───
app.use(config.apiPrefix, routes);

// ─── Error Handling ───
app.use(notFound);
app.use(errorHandler);

// ─── WebSocket ───
setupWebSocket(io);

// ─── Cron Jobs ───
setupCronJobs(io);

// ─── Start Server ───
server.listen(config.port, () => {
  logger.info(`
  ══════════════════════════════════════
  🚀 MP CRM Backend запущен
  ──────────────────────────────────────
  Среда:     ${config.nodeEnv}
  Порт:      ${config.port}
  API:       http://localhost:${config.port}${config.apiPrefix}
  WebSocket: ws://localhost:${config.port}
  ══════════════════════════════════════
  `);
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  logger.info(`${signal} получен. Завершение...`);
  server.close(() => {
    logger.info('HTTP сервер остановлен');
    process.exit(0);
  });
  setTimeout(() => {
    logger.error('Принудительное завершение');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = { app, server };
