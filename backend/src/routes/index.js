const express = require('express');
const { authenticate, authorize, cabinetAccess } = require('../middleware/auth');

// Controllers
const authController = require('../controllers/authController');
const chatController = require('../controllers/chatController');
const taskController = require('../controllers/taskController');
const analyticsController = require('../controllers/analyticsController');
const marketplaceController = require('../controllers/marketplaceController');
const notificationController = require('../controllers/notificationController');

const router = express.Router();
let manualSyncInProgress = false;

// ─── Health Check ───
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Auth ───
router.post('/auth/register', authController.register);
router.post('/auth/login', authController.login);
router.post('/auth/refresh', authController.refreshToken);
router.post('/auth/logout', authenticate, authController.logout);
router.get('/auth/me', authenticate, authController.getMe);

// ─── Marketplaces & Cabinets ───
router.get('/marketplaces', authenticate, marketplaceController.getMarketplaces);
router.get('/cabinets/:cabinetId', authenticate, cabinetAccess, marketplaceController.getCabinetById);
router.post('/cabinets', authenticate, authorize('ADMIN'), marketplaceController.createCabinet);
router.put('/cabinets/:cabinetId', authenticate, authorize('ADMIN'), marketplaceController.updateCabinet);

// ─── Chats ───
router.get('/chats', authenticate, chatController.useChats, chatController.getChats);
router.get('/chats/:chatId', authenticate, chatController.useChats, chatController.getChatById);
router.get('/chats/:chatId/messages/:messageId/media', authenticate, chatController.useChats, chatController.getMessageMedia);
router.post('/chats/:chatId/messages', authenticate, chatController.useChats, chatController.sendMessage);
router.patch('/chats/:chatId/read', authenticate, chatController.useChats, chatController.markAsRead);
router.patch('/chats/:chatId/assign', authenticate, chatController.useChats, chatController.assignManager);
router.patch('/chats/:chatId/status', authenticate, chatController.useChats, chatController.updateStatus);

// ─── Questions ───
router.get('/questions', authenticate, chatController.useQuestions, chatController.getChats);
router.get('/questions/:chatId', authenticate, chatController.useQuestions, chatController.getChatById);
router.get('/questions/:chatId/messages/:messageId/media', authenticate, chatController.useQuestions, chatController.getMessageMedia);
router.post('/questions/:chatId/messages', authenticate, chatController.useQuestions, chatController.sendMessage);
router.patch('/questions/:chatId/read', authenticate, chatController.useQuestions, chatController.markAsRead);
router.patch('/questions/:chatId/assign', authenticate, chatController.useQuestions, chatController.assignManager);
router.patch('/questions/:chatId/status', authenticate, chatController.useQuestions, chatController.updateStatus);

// ─── Tasks ───
router.get('/tasks', authenticate, taskController.getTasks);
router.get('/tasks/:taskId', authenticate, taskController.getTaskById);
router.post('/tasks', authenticate, taskController.createTask);
router.put('/tasks/:taskId', authenticate, taskController.updateTask);
router.delete('/tasks/:taskId', authenticate, taskController.deleteTask);
router.patch('/tasks/:taskId/toggle', authenticate, taskController.toggleTask);

// ─── Notifications ───
router.get('/notifications', authenticate, notificationController.getNotifications);
router.patch('/notifications/read-all', authenticate, notificationController.markAllAsRead);
router.patch('/notifications/:id/read', authenticate, notificationController.markAsRead);

// ─── Sync (ручной запуск) ───
router.post('/sync/manual', authenticate, authorize('ADMIN'), async (req, res) => {
  try {
    if (manualSyncInProgress) {
      return res.status(202).json({
        success: true,
        message: 'Синхронизация уже выполняется',
        alreadyRunning: true,
      });
    }

    const { syncAllMarketplaces } = require('../services/marketplaceSync');
    const io = req.app.get('io');
    manualSyncInProgress = true;
    syncAllMarketplaces(io)
      .catch((e) => console.error('sync error:', e))
      .finally(() => {
        manualSyncInProgress = false;
      });

    res.json({ success: true, message: 'Синхронизация запущена', alreadyRunning: false });
  } catch (e) {
    manualSyncInProgress = false;
    res.status(500).json({ success: false, error: e.message });
  }
});

// ─── Analytics ───
router.get('/analytics/response-time', authenticate, analyticsController.getResponseTimeAnalytics);
router.get('/analytics/response-time/export', authenticate, analyticsController.exportResponseTimeCSV);
router.get('/analytics/dashboard', authenticate, analyticsController.getDashboard);

module.exports = router;
