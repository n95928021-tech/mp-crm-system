<<<<<<< HEAD
# MP CRM — CRM для менеджеров маркетплейсов

Полнофункциональная CRM-система для управления чатами, задачами и аналитикой на маркетплейсах Wildberries, Ozon и Яндекс Маркет.

## Архитектура

```
mp-crm/
├── backend/                    # Node.js + Express + Prisma
│   ├── prisma/
│   │   ├── schema.prisma       # Схема БД (12 моделей)
│   │   └── seed.js             # Наполнение тестовыми данными
│   ├── src/
│   │   ├── config/
│   │   │   ├── index.js        # Конфигурация приложения
│   │   │   └── database.js     # Prisma client singleton
│   │   ├── controllers/
│   │   │   ├── authController.js        # Регистрация, логин, JWT
│   │   │   ├── chatController.js        # CRUD чатов + сообщения
│   │   │   ├── taskController.js        # CRUD задач + календарь
│   │   │   ├── analyticsController.js   # Аналитика + CSV экспорт
│   │   │   └── marketplaceController.js # Маркетплейсы и кабинеты
│   │   ├── middleware/
│   │   │   ├── auth.js          # JWT аутентификация + RBAC
│   │   │   └── errorHandler.js  # Обработка ошибок
│   │   ├── routes/
│   │   │   └── index.js         # Все API маршруты
│   │   ├── services/
│   │   │   ├── marketplaceSync.js  # Синхронизация с API WB/Ozon/ЯМ
│   │   │   └── cronJobs.js         # Фоновые задачи
│   │   ├── websocket/
│   │   │   └── index.js         # WebSocket обработчики
│   │   ├── utils/
│   │   │   └── logger.js        # Winston логгер
│   │   └── index.js             # Точка входа
│   ├── Dockerfile
│   └── .env.example
│
├── frontend/                   # React + Vite + Zustand
│   ├── src/
│   │   ├── services/
│   │   │   ├── api.js           # Axios + interceptors
│   │   │   └── websocket.js     # Socket.IO клиент
│   │   ├── store/
│   │   │   └── index.js         # Zustand сторы
│   │   └── components/          # React компоненты (+ CRM.jsx)
│   ├── Dockerfile
│   └── vite.config.js
│
├── nginx/
│   └── nginx.conf              # Reverse proxy для продакшена
│
├── docker-compose.yml          # PostgreSQL + Redis + Backend + Frontend
├── package.json                # Monorepo scripts
└── README.md
```

## Стек технологий

| Слой | Технологии |
|------|-----------|
| **Frontend** | React 18, Vite, Zustand, Socket.IO Client, Axios, Tailwind CSS |
| **Backend** | Node.js 20, Express 4, Socket.IO, JWT, bcrypt |
| **БД** | PostgreSQL 16, Prisma ORM |
| **Кэш** | Redis 7 |
| **Инфра** | Docker, Nginx, node-cron |

## API Эндпоинты

### Auth
| Метод | Маршрут | Описание |
|-------|---------|----------|
| POST | `/auth/register` | Регистрация |
| POST | `/auth/login` | Вход |
| POST | `/auth/refresh` | Обновление токена |
| POST | `/auth/logout` | Выход |
| GET | `/auth/me` | Текущий пользователь |

### Чаты
| Метод | Маршрут | Описание |
|-------|---------|----------|
| GET | `/chats` | Список чатов (фильтры: marketplaceId, cabinetId, status) |
| GET | `/chats/:id` | Чат с историей сообщений |
| POST | `/chats/:id/messages` | Отправить сообщение |
| PATCH | `/chats/:id/read` | Пометить прочитанным |
| PATCH | `/chats/:id/assign` | Назначить менеджера |
| PATCH | `/chats/:id/status` | Изменить статус |

### Задачи
| Метод | Маршрут | Описание |
|-------|---------|----------|
| GET | `/tasks` | Список задач (фильтры: status, priority, startDate, endDate) |
| POST | `/tasks` | Создать задачу |
| PUT | `/tasks/:id` | Обновить задачу |
| DELETE | `/tasks/:id` | Удалить |
| PATCH | `/tasks/:id/toggle` | Переключить статус |

### Аналитика
| Метод | Маршрут | Описание |
|-------|---------|----------|
| GET | `/analytics/response-time` | Среднее время ответа |
| GET | `/analytics/response-time/export` | Выгрузка CSV |
| GET | `/analytics/dashboard` | Сводная статистика |

### Маркетплейсы
| Метод | Маршрут | Описание |
|-------|---------|----------|
| GET | `/marketplaces` | Все маркетплейсы с кабинетами |
| GET | `/cabinets/:id` | Информация о кабинете |
| PUT | `/cabinets/:id` | Обновить API ключи (ADMIN) |

## WebSocket события

### Клиент → Сервер
| Событие | Данные | Описание |
|---------|--------|----------|
| `join_chat` | chatId | Подписка на чат |
| `leave_chat` | chatId | Отписка |
| `join_cabinet` | cabinetId | Подписка на все чаты кабинета |
| `send_message` | {chatId, text} | Отправка сообщения |
| `typing` | {chatId} | Индикатор печати |
| `mark_read` | {chatId} | Пометить прочитанным |

### Сервер → Клиент
| Событие | Данные | Описание |
|---------|--------|----------|
| `new_message` | {chatId, message} | Новое сообщение |
| `chat_updated` | {chatId, ...} | Обновление чата |
| `notification_sound` | {type, chatId} | Триггер звукового уведомления |
| `task_overdue` | {taskId, title} | Задача просрочена |
| `task_reminder` | {taskId, title} | Напоминание о задаче (за 15 мин) |

## Схема базы данных

```
users ──┬── user_cabinets ──── cabinets ──── marketplaces
        ├── tasks                  │
        ├── chat_messages          ├── chats ──── chat_messages
        ├── notifications          └── analytics_snapshots
        └── refresh_tokens
```

**12 моделей:** User, RefreshToken, Marketplace, Cabinet, UserCabinet, Chat, ChatMessage, Task, Notification, AnalyticsSnapshot

## Фоновые задачи (Cron)

| Расписание | Задача |
|-----------|--------|
| Каждые 2 мин | Синхронизация чатов с API маркетплейсов |
| Каждую минуту | Проверка просроченных задач + уведомления |
| Каждый час | Агрегация аналитики по кабинетам |
| Каждую минуту | Напоминания о задачах (за 15 мин до срока) |

## Быстрый старт

### С Docker (рекомендуется)

```bash
# Клонировать и запустить
git clone <repo>
cd mp-crm
cp backend/.env.example backend/.env

# Запуск всего стека
docker-compose up -d

# Приложение доступно:
# Frontend: http://localhost:5173
# Backend:  http://localhost:4000/api/v1
# Логин:    admin@mpcrm.ru / password123
```

### Без Docker

```bash
# 1. Установить PostgreSQL и Redis
# 2. Создать БД
createdb mp_crm

# 3. Настроить переменные окружения
cd backend
cp .env.example .env
# Отредактировать .env — DATABASE_URL, JWT_SECRET

# 4. Установить зависимости
cd ..
npm install

# 5. Миграции и seed
npm run db:migrate
npm run db:seed

# 6. Запуск dev
npm run dev
```

## Настройка API маркетплейсов

В файле `backend/.env` укажите токены:

**Wildberries:** Получите API-ключ в Личном кабинете → Настройки → Доступ к API.

**Ozon:** Seller API ключи в Личном кабинете → Настройки → API-ключи.

**Яндекс Маркет:** OAuth-токен через Яндекс.OAuth + Campaign ID из кабинета.

## Ключевые фичи

- **Единое окно** — все 10 кабинетов 3 маркетплейсов в одном интерфейсе
- **Реал-тайм чаты** — WebSocket уведомления, звуковые алерты
- **Таймеры на чатах** — зелёный (<2 мин), жёлтый (2-5 мин), красный (>5 мин)
- **Календарь задач** — создание, напоминания за 15 мин, подсветка просроченных
- **Аналитика** — среднее время ответа с выгрузкой в CSV
- **RBAC** — роли Admin, Manager, Viewer с доступом по кабинетам
- **Auto-sync** — автоматическая синхронизация чатов каждые 2 минуты
=======
# mp-crm-system
>>>>>>> 6d0ba87938e7acae808b6dd549580eeb0257d26d
