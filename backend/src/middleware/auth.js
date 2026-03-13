const jwt = require('jsonwebtoken');
const config = require('../config');
const prisma = require('../config/database');

// Проверка JWT токена
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'Необходима авторизация',
      });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, config.jwt.secret);

    const user = await prisma.user.findUnique({
      where: { id: decoded.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
      },
    });

    if (!user || !user.isActive) {
      return res.status(401).json({
        success: false,
        error: 'Пользователь не найден или деактивирован',
      });
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Токен истёк' });
    }
    return res.status(401).json({ success: false, error: 'Невалидный токен' });
  }
};

// Проверка роли
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: 'Недостаточно прав',
      });
    }
    next();
  };
};

// Проверка доступа к кабинету
const cabinetAccess = async (req, res, next) => {
  try {
    const cabinetId = req.params.cabinetId || req.body.cabinetId;
    if (!cabinetId) return next();

    if (req.user.role === 'ADMIN') return next();

    const access = await prisma.userCabinet.findUnique({
      where: {
        userId_cabinetId: {
          userId: req.user.id,
          cabinetId,
        },
      },
    });

    if (!access) {
      return res.status(403).json({
        success: false,
        error: 'Нет доступа к данному кабинету',
      });
    }

    next();
  } catch (error) {
    next(error);
  }
};

module.exports = { authenticate, authorize, cabinetAccess };
