// Скрипт очистки дубликатов кабинетов
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function cleanup() {
  console.log('🧹 Начинаем очистку дубликатов...');

  const marketplaces = await prisma.marketplace.findMany({
    include: { cabinets: { orderBy: { createdAt: 'asc' } } }
  });

  for (const mp of marketplaces) {
    console.log(`\n📦 ${mp.name}: ${mp.cabinets.length} кабинетов`);

    // Группируем по имени
    const byName = {};
    for (const cab of mp.cabinets) {
      if (!byName[cab.name]) byName[cab.name] = [];
      byName[cab.name].push(cab);
    }

    for (const [name, cabs] of Object.entries(byName)) {
      if (cabs.length > 1) {
        // Оставляем первый (самый старый), удаляем остальные
        const keep = cabs[0];
        const deleteIds = cabs.slice(1).map(c => c.id);
        console.log(`  ⚠️  "${name}": ${cabs.length} дубликатов → оставляем ${keep.id}`);
        
        // Переносим чаты и задачи на основной кабинет
        await prisma.chat.updateMany({
          where: { cabinetId: { in: deleteIds } },
          data: { cabinetId: keep.id }
        });
        await prisma.task.updateMany({
          where: { cabinetId: { in: deleteIds } },
          data: { cabinetId: keep.id }
        });
        await prisma.userCabinet.deleteMany({
          where: { cabinetId: { in: deleteIds } }
        });
        await prisma.cabinet.deleteMany({
          where: { id: { in: deleteIds } }
        });
        console.log(`  ✅ Удалено ${deleteIds.length} дубликатов`);
      }
    }
  }

  // Итог
  const total = await prisma.cabinet.count();
  console.log(`\n✅ Готово! Осталось кабинетов: ${total}`);
}

cleanup()
  .catch(e => { console.error('❌ Ошибка:', e); process.exit(1); })
  .finally(() => prisma.$disconnect());
