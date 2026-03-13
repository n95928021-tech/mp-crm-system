// ══════════════════════════════════════════════
// MP CRM — Database Seed
// ══════════════════════════════════════════════

const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Начинаем заполнение базы данных...\n');

  // ─── Маркетплейсы ───
  const wb = await prisma.marketplace.upsert({
    where: { slug: 'wb' },
    update: {},
    create: { name: 'Wildberries', slug: 'wb', color: '#a855f7' },
  });

  const ozon = await prisma.marketplace.upsert({
    where: { slug: 'ozon' },
    update: {},
    create: { name: 'Ozon', slug: 'ozon', color: '#3b82f6' },
  });

  const yandex = await prisma.marketplace.upsert({
    where: { slug: 'yandex' },
    update: {},
    create: { name: 'Яндекс Маркет', slug: 'yandex', color: '#f59e0b' },
  });

  console.log('✅ Маркетплейсы созданы');

  // ─── Кабинеты WB (5 шт) ───
  const wbCabinets = [];
  const wbNames = ['WB Основной', 'WB Одежда', 'WB Электроника', 'WB Косметика', 'WB Дом и сад'];
  for (const name of wbNames) {
    const cab = await prisma.cabinet.create({
      data: { name, marketplaceId: wb.id },
    });
    wbCabinets.push(cab);
  }

  // ─── Кабинеты Ozon (4 шт) ───
  const ozonCabinets = [];
  const ozonNames = ['Ozon Основной', 'Ozon Premium', 'Ozon Склад МСК', 'Ozon Склад СПБ'];
  for (const name of ozonNames) {
    const cab = await prisma.cabinet.create({
      data: { name, marketplaceId: ozon.id },
    });
    ozonCabinets.push(cab);
  }

  // ─── Кабинет Яндекс (1 шт) ───
  const ymCabinet = await prisma.cabinet.create({
    data: { name: 'ЯМ Основной', marketplaceId: yandex.id },
  });

  const allCabinets = [...wbCabinets, ...ozonCabinets, ymCabinet];
  console.log(`✅ Кабинеты созданы: ${allCabinets.length} шт`);

  // ─── Пользователи ───
  const passwordHash = await bcrypt.hash('password123', 12);

  const admin = await prisma.user.create({
    data: {
      email: 'admin@mpcrm.ru',
      password: passwordHash,
      firstName: 'Админ',
      lastName: 'Системы',
      role: 'ADMIN',
    },
  });

  const managers = [];
  const managerData = [
    { email: 'ivanov@mpcrm.ru', firstName: 'Иван', lastName: 'Иванов' },
    { email: 'petrova@mpcrm.ru', firstName: 'Мария', lastName: 'Петрова' },
    { email: 'sidorov@mpcrm.ru', firstName: 'Алексей', lastName: 'Сидоров' },
  ];

  for (const data of managerData) {
    const user = await prisma.user.create({
      data: { ...data, password: passwordHash, role: 'MANAGER' },
    });
    managers.push(user);
  }

  console.log('✅ Пользователи созданы');

  // ─── Привязка менеджеров к кабинетам ───
  for (const manager of managers) {
    for (const cabinet of allCabinets) {
      await prisma.userCabinet.create({
        data: { userId: manager.id, cabinetId: cabinet.id },
      });
    }
  }

  console.log('✅ Доступы к кабинетам настроены');

  // ─── Демо-чаты ───
  const customerNames = [
    'Алексей Козлов', 'Мария Смирнова', 'Дмитрий Волков', 'Елена Новикова',
    'Сергей Морозов', 'Анна Лебедева', 'Павел Соколов', 'Ольга Попова',
    'Артём Кузнецов', 'Юлия Васильева', 'Николай Петров', 'Татьяна Михайлова',
  ];

  const messageTemplates = [
    'Здравствуйте! Подскажите по заказу.',
    'Когда будет доставка моего заказа?',
    'Хочу оформить возврат товара.',
    'Товар не соответствует описанию на сайте.',
    'Спасибо за быструю доставку!',
    'Можно ли изменить адрес доставки?',
    'Есть ли скидка на повторный заказ?',
    'Проблема с оплатой, помогите пожалуйста.',
    'Товар пришёл повреждённый, что делать?',
    'Отличное качество, рекомендую!',
  ];

  let chatCount = 0;
  for (const cabinet of allCabinets) {
    const numChats = 3 + Math.floor(Math.random() * 5);
    for (let i = 0; i < numChats; i++) {
      const customerName = customerNames[Math.floor(Math.random() * customerNames.length)];
      const manager = managers[Math.floor(Math.random() * managers.length)];

      const chat = await prisma.chat.create({
        data: {
          cabinetId: cabinet.id,
          customerName,
          assignedManagerId: manager.id,
          status: 'OPEN',
          lastMessageAt: new Date(Date.now() - Math.floor(Math.random() * 900000)),
          unreadCount: Math.floor(Math.random() * 4),
        },
      });

      // Создаём 3-5 сообщений в каждом чате
      const numMessages = 3 + Math.floor(Math.random() * 3);
      for (let j = 0; j < numMessages; j++) {
        const isCustomer = j % 2 === 0;
        await prisma.chatMessage.create({
          data: {
            chatId: chat.id,
            senderType: isCustomer ? 'CUSTOMER' : 'MANAGER',
            senderId: isCustomer ? null : manager.id,
            text: messageTemplates[Math.floor(Math.random() * messageTemplates.length)],
            createdAt: new Date(Date.now() - (numMessages - j) * 120000),
          },
        });
      }

      // Обновляем lastMessageText
      const lastMsg = messageTemplates[Math.floor(Math.random() * messageTemplates.length)];
      await prisma.chat.update({
        where: { id: chat.id },
        data: { lastMessageText: lastMsg },
      });

      chatCount++;
    }
  }

  console.log(`✅ Чаты созданы: ${chatCount} шт`);

  // ─── Демо-задачи ───
  const taskTitles = [
    'Обновить карточки товаров',
    'Загрузить новые фото',
    'Ответить на отзывы',
    'Проверить остатки на складе',
    'Настроить рекламную кампанию',
    'Подготовить акцию к выходным',
    'Обновить цены по категории',
    'Проверить возвраты за неделю',
    'Собрать аналитику за месяц',
    'Оформить поставку на склад',
  ];

  for (let i = 0; i < 15; i++) {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + Math.floor(Math.random() * 14) - 5);
    dueDate.setHours(9 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 4) * 15);

    const isOverdue = dueDate < new Date();
    const isDone = Math.random() > 0.7;

    await prisma.task.create({
      data: {
        title: taskTitles[i % taskTitles.length],
        userId: managers[Math.floor(Math.random() * managers.length)].id,
        cabinetId: allCabinets[Math.floor(Math.random() * allCabinets.length)].id,
        priority: ['LOW', 'MEDIUM', 'HIGH', 'URGENT'][Math.floor(Math.random() * 4)],
        status: isDone ? 'DONE' : 'TODO',
        dueDate,
        isOverdue: isOverdue && !isDone,
        completedAt: isDone ? new Date() : null,
      },
    });
  }

  console.log('✅ Задачи созданы');

  console.log('\n🎉 База данных заполнена успешно!');
  console.log('─────────────────────────────────');
  console.log('Логин:  admin@mpcrm.ru');
  console.log('Пароль: password123');
  console.log('─────────────────────────────────');
}

main()
  .catch((e) => {
    console.error('❌ Ошибка:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
