const express = require('express');
const { authenticate, authorize, cabinetAccess } = require('../middleware/auth');

// Controllers
const authController = require('../controllers/authController');
const chatController = require('../controllers/chatController');
const taskController = require('../controllers/taskController');
const analyticsController = require('../controllers/analyticsController');
const marketplaceController = require('../controllers/marketplaceController');

const router = express.Router();

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
router.put('/cabinets/:cabinetId', authenticate, authorize('ADMIN'), marketplaceController.updateCabinet);

// ─── Chats ───
router.get('/chats', authenticate, chatController.getChats);
router.get('/chats/:chatId', authenticate, chatController.getChatById);
router.post('/chats/:chatId/messages', authenticate, chatController.sendMessage);
router.patch('/chats/:chatId/read', authenticate, chatController.markAsRead);
router.patch('/chats/:chatId/assign', authenticate, chatController.assignManager);
router.patch('/chats/:chatId/status', authenticate, chatController.updateStatus);

// ─── Tasks ───
router.get('/tasks', authenticate, taskController.getTasks);
router.get('/tasks/:taskId', authenticate, taskController.getTaskById);
router.post('/tasks', authenticate, taskController.createTask);
router.put('/tasks/:taskId', authenticate, taskController.updateTask);
router.delete('/tasks/:taskId', authenticate, taskController.deleteTask);
router.patch('/tasks/:taskId/toggle', authenticate, taskController.toggleTask);

// ─── Analytics ───
router.get('/analytics/response-time', authenticate, analyticsController.getResponseTimeAnalytics);
router.get('/analytics/response-time/export', authenticate, analyticsController.exportResponseTimeCSV);
router.get('/analytics/dashboard', authenticate, analyticsController.getDashboard);

module.exports = router;
