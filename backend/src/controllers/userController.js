const bcrypt = require('bcryptjs');
const prisma = require('../config/database');

const ALLOWED_ROLES = new Set(['ADMIN', 'MANAGER']);

const normalizeRole = (value) => {
  const role = String(value || '').toUpperCase().trim();
  return ALLOWED_ROLES.has(role) ? role : null;
};

// GET /users
exports.getUsers = async (req, res, next) => {
  try {
    const users = await prisma.user.findMany({
      orderBy: [
        { isActive: 'desc' },
        { createdAt: 'asc' },
      ],
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
        cabinetAccess: {
          select: { cabinetId: true },
        },
      },
    });

    res.json({
      success: true,
      data: users.map((u) => ({
        ...u,
        cabinetIds: u.cabinetAccess.map((x) => x.cabinetId),
      })),
    });
  } catch (error) {
    next(error);
  }
};

// POST /users
exports.createUser = async (req, res, next) => {
  try {
    const { email, password, firstName, lastName, role } = req.body || {};

    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        error: 'Поля email, password, firstName, lastName обязательны',
      });
    }

    const normalizedRole = normalizeRole(role || 'MANAGER');
    if (!normalizedRole) {
      return res.status(400).json({
        success: false,
        error: 'Доступные роли: ADMIN, MANAGER',
      });
    }

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      return res.status(409).json({
        success: false,
        error: 'Email уже зарегистрирован',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 12);

    const user = await prisma.user.create({
      data: {
        email: String(email).trim().toLowerCase(),
        password: hashedPassword,
        firstName: String(firstName).trim(),
        lastName: String(lastName).trim(),
        role: normalizedRole,
      },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    });

    // Для MANAGER сразу выдаём доступ ко всем кабинетам.
    if (normalizedRole === 'MANAGER') {
      const cabinets = await prisma.cabinet.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      if (cabinets.length) {
        await prisma.userCabinet.createMany({
          data: cabinets.map((c) => ({ userId: user.id, cabinetId: c.id })),
          skipDuplicates: true,
        });
      }
    }

    res.status(201).json({ success: true, data: user });
  } catch (error) {
    next(error);
  }
};

// PATCH /users/:userId
exports.updateUser = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { role, isActive, firstName, lastName, password } = req.body || {};

    const current = await prisma.user.findUnique({ where: { id: userId } });
    if (!current) {
      return res.status(404).json({ success: false, error: 'Пользователь не найден' });
    }

    const data = {};

    if (firstName !== undefined) data.firstName = String(firstName || '').trim();
    if (lastName !== undefined) data.lastName = String(lastName || '').trim();

    if (isActive !== undefined) data.isActive = Boolean(isActive);

    if (role !== undefined) {
      const normalizedRole = normalizeRole(role);
      if (!normalizedRole) {
        return res.status(400).json({
          success: false,
          error: 'Доступные роли: ADMIN, MANAGER',
        });
      }
      data.role = normalizedRole;
    }

    if (password) {
      data.password = await bcrypt.hash(String(password), 12);
    }

    const updated = await prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        lastLoginAt: true,
        createdAt: true,
      },
    });

    // Если роль стала MANAGER — гарантируем доступ к кабинетам.
    if (updated.role === 'MANAGER') {
      const cabinets = await prisma.cabinet.findMany({
        where: { isActive: true },
        select: { id: true },
      });
      if (cabinets.length) {
        await prisma.userCabinet.createMany({
          data: cabinets.map((c) => ({ userId: updated.id, cabinetId: c.id })),
          skipDuplicates: true,
        });
      }
    }

    res.json({ success: true, data: updated });
  } catch (error) {
    next(error);
  }
};
