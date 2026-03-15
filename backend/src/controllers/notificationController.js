const prisma = require('../config/database');

// GET /notifications
exports.getNotifications = async (req, res, next) => {
  try {
    const { limit = 20, page = 1 } = req.query;
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user.id },
      orderBy: { createdAt: 'desc' },
      take: parseInt(limit),
      skip: (parseInt(page) - 1) * parseInt(limit),
    });
    const unreadCount = await prisma.notification.count({
      where: { userId: req.user.id, isRead: false },
    });
    res.json({ success: true, data: notifications, unreadCount });
  } catch (error) { next(error); }
};

// PATCH /notifications/:id/read
exports.markAsRead = async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.id, userId: req.user.id },
      data: { isRead: true },
    });
    res.json({ success: true });
  } catch (error) { next(error); }
};

// PATCH /notifications/read-all
exports.markAllAsRead = async (req, res, next) => {
  try {
    await prisma.notification.updateMany({
      where: { userId: req.user.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ success: true });
  } catch (error) { next(error); }
};
