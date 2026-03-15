const prisma = require('../config/database');

// GET /marketplaces — все маркетплейсы с кабинетами
exports.getMarketplaces = async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'ADMIN';

    const marketplaces = await prisma.marketplace.findMany({
      where: { isActive: true },
      include: {
        cabinets: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          select: {
            id: true,
            name: true,
            marketplaceId: true,
            isActive: true,
            lastSyncAt: true,
            createdAt: true,
            updatedAt: true,
            _count: { select: { chats: true } },
            // API ключи — только для ADMIN
            ...(isAdmin ? {
              apiToken: true,
              apiClientId: true,
              apiKey: true,
              campaignId: true,
            } : {}),
          },
        },
      },
      orderBy: { name: 'asc' },
    });

    res.json({ success: true, data: marketplaces });
  } catch (error) {
    next(error);
  }
};

// GET /cabinets/:cabinetId
exports.getCabinetById = async (req, res, next) => {
  try {
    const isAdmin = req.user.role === 'ADMIN';
    const cabinet = await prisma.cabinet.findUnique({
      where: { id: req.params.cabinetId },
      select: {
        id: true, name: true, marketplaceId: true,
        isActive: true, lastSyncAt: true, createdAt: true, updatedAt: true,
        marketplace: true,
        _count: { select: { chats: true, tasks: true } },
        ...(isAdmin ? {
          apiToken: true, apiClientId: true, apiKey: true, campaignId: true,
        } : {}),
      },
    });

    if (!cabinet) {
      return res.status(404).json({ success: false, error: 'Кабинет не найден' });
    }

    res.json({ success: true, data: cabinet });
  } catch (error) {
    next(error);
  }
};

// PUT /cabinets/:cabinetId — обновить настройки кабинета (API ключи)
exports.updateCabinet = async (req, res, next) => {
  try {
    const { cabinetId } = req.params;
    const { name, apiToken, apiClientId, apiKey, campaignId } = req.body;

    const updateData = {};
    if (name) updateData.name = name;
    if (apiToken !== undefined) updateData.apiToken = apiToken;
    if (apiClientId !== undefined) updateData.apiClientId = apiClientId;
    if (apiKey !== undefined) updateData.apiKey = apiKey;
    if (campaignId !== undefined) updateData.campaignId = campaignId;

    const cabinet = await prisma.cabinet.update({
      where: { id: cabinetId },
      data: updateData,
      include: { marketplace: true },
    });

    res.json({ success: true, data: cabinet });
  } catch (error) {
    next(error);
  }
};

// POST /cabinets — создать кабинет (только ADMIN, макс 6 на маркетплейс)
exports.createCabinet = async (req, res, next) => {
  try {
    const { name, marketplaceId } = req.body;
    if (!name || !marketplaceId) {
      return res.status(400).json({ success: false, error: 'Укажите название и маркетплейс' });
    }
    // Проверяем лимит
    const count = await prisma.cabinet.count({ where: { marketplaceId, isActive: true } });
    if (count >= 6) {
      return res.status(400).json({ success: false, error: 'Достигнут лимит кабинетов (6)' });
    }
    const cabinet = await prisma.cabinet.create({
      data: { name, marketplaceId },
      include: { marketplace: true },
    });
    res.status(201).json({ success: true, data: cabinet });
  } catch (error) { next(error); }
};
