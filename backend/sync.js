const { getSyncService } = require('./src/services/marketplaceSync');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const cabinets = await prisma.cabinet.findMany({
    where: { isActive: true },
    include: { marketplace: true }
  });
  console.log('Кабинетов для синхронизации:', cabinets.length);
  for (const cab of cabinets) {
    if (!cab.apiToken && !cab.apiKey) {
      console.log('Пропуск (нет ключей):', cab.name);
      continue;
    }
    console.log('Синхронизация:', cab.name, '(' + cab.marketplace.slug + ')');
    const svc = getSyncService(cab.marketplace.slug);
    if (svc) await svc.syncChats(cab, null);
  }
  console.log('Готово!');
  await prisma.$disconnect();
}

run().catch(console.error);
