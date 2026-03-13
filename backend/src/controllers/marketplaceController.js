const prisma = require('../config/database');

// GET /marketplaces — все маркетплейсы с кабинетами
exports.getMarketplaces = async (req, res, next) => {
  try {
    const marketplaces = await prisma.marketplace.findMany({
      where: { isActive: true },
      include: {
        cabinets: {
          where: { isActive: true },
          orderBy: { name: 'asc' },
          include: {
            _count: { select: { chats: true } },
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
    const cabinet = await prisma.cabinet.findUnique({
      where: { id: req.params.cabinetId },
      include: {
        marketplace: true,
        _count: { select: { chats: true, tasks: true } },
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
