const prisma = require('../config/database');
const logger = require('../utils/logger');

// GET /tasks — список задач пользователя
exports.getTasks = async (req, res, next) => {
  try {
    const {
      status,
      priority,
      cabinetId,
      startDate,
      endDate,
      page = 1,
      limit = 100,
    } = req.query;

    const where = { userId: req.user.id };

    if (status) where.status = status;
    if (priority) where.priority = priority;
    if (cabinetId) where.cabinetId = cabinetId;
    if (startDate || endDate) {
      where.dueDate = {};
      if (startDate) where.dueDate.gte = new Date(startDate);
      if (endDate) where.dueDate.lte = new Date(endDate);
    }

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        include: {
          cabinet: {
            include: { marketplace: true },
          },
        },
        orderBy: { dueDate: 'asc' },
        skip: (parseInt(page) - 1) * parseInt(limit),
        take: parseInt(limit),
      }),
      prisma.task.count({ where }),
    ]);

    // Обогащаем данные просроченности
    const now = new Date();
    const enrichedTasks = tasks.map((task) => ({
      ...task,
      isOverdue: task.status !== 'DONE' && task.status !== 'CANCELLED' && task.dueDate < now,
    }));

    res.json({
      success: true,
      data: enrichedTasks,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /tasks/:taskId
exports.getTaskById = async (req, res, next) => {
  try {
    const task = await prisma.task.findUnique({
      where: { id: req.params.taskId },
      include: {
        cabinet: { include: { marketplace: true } },
        user: { select: { id: true, firstName: true, lastName: true } },
      },
    });

    if (!task) {
      return res.status(404).json({ success: false, error: 'Задача не найдена' });
    }

    if (task.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Нет доступа' });
    }

    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

// POST /tasks — создать задачу
exports.createTask = async (req, res, next) => {
  try {
    const { title, description, cabinetId, priority, dueDate } = req.body;

    const task = await prisma.task.create({
      data: {
        title,
        description,
        userId: req.user.id,
        cabinetId: cabinetId || null,
        priority: priority || 'MEDIUM',
        dueDate: new Date(dueDate),
      },
      include: {
        cabinet: { include: { marketplace: true } },
      },
    });

    logger.info(`Задача создана: "${title}"`, { userId: req.user.id });

    res.status(201).json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

// PUT /tasks/:taskId — обновить задачу
exports.updateTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;
    const { title, description, priority, status, dueDate, cabinetId } = req.body;

    const existing = await prisma.task.findUnique({ where: { id: taskId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Задача не найдена' });
    }
    if (existing.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Нет доступа' });
    }

    const updateData = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (priority !== undefined) updateData.priority = priority;
    if (dueDate !== undefined) updateData.dueDate = new Date(dueDate);
    if (cabinetId !== undefined) updateData.cabinetId = cabinetId;

    if (status !== undefined) {
      updateData.status = status;
      if (status === 'DONE') {
        updateData.completedAt = new Date();
        updateData.isOverdue = false;
      } else if (status === 'TODO' || status === 'IN_PROGRESS') {
        updateData.completedAt = null;
      }
    }

    const task = await prisma.task.update({
      where: { id: taskId },
      data: updateData,
      include: {
        cabinet: { include: { marketplace: true } },
      },
    });

    res.json({ success: true, data: task });
  } catch (error) {
    next(error);
  }
};

// DELETE /tasks/:taskId — удалить задачу
exports.deleteTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    const existing = await prisma.task.findUnique({ where: { id: taskId } });
    if (!existing) {
      return res.status(404).json({ success: false, error: 'Задача не найдена' });
    }
    if (existing.userId !== req.user.id && req.user.role !== 'ADMIN') {
      return res.status(403).json({ success: false, error: 'Нет доступа' });
    }

    await prisma.task.delete({ where: { id: taskId } });

    res.json({ success: true, message: 'Задача удалена' });
  } catch (error) {
    next(error);
  }
};

// PATCH /tasks/:taskId/toggle — переключить статус
exports.toggleTask = async (req, res, next) => {
  try {
    const { taskId } = req.params;

    const task = await prisma.task.findUnique({ where: { id: taskId } });
    if (!task) {
      return res.status(404).json({ success: false, error: 'Задача не найдена' });
    }

    const newStatus = task.status === 'DONE' ? 'TODO' : 'DONE';
    const updated = await prisma.task.update({
      where: { id: taskId },
      data: {
        status: newStatus,
        completedAt: newStatus === 'DONE' ? new Date() : null,
        isOverdue: false,
      },
    });

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};
