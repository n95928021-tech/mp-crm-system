const logger = require('../utils/logger');

const errorHandler = (err, req, res, next) => {
  logger.error(err.message, { stack: err.stack, path: req.path });

  if (err.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      error: 'Ошибка валидации',
      details: err.errors,
    });
  }

  if (err.code === 'P2002') {
    return res.status(409).json({
      success: false,
      error: 'Запись уже существует',
    });
  }

  if (err.code === 'P2025') {
    return res.status(404).json({
      success: false,
      error: 'Запись не найдена',
    });
  }

  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success: false,
    error: process.env.NODE_ENV === 'production'
      ? 'Внутренняя ошибка сервера'
      : err.message,
  });
};

const notFound = (req, res) => {
  res.status(404).json({
    success: false,
    error: `Маршрут ${req.originalUrl} не найден`,
  });
};

module.exports = { errorHandler, notFound };
