# MP CRM — CRM для менеджеров маркетплейсов

Полнофункциональная CRM-система для управления чатами, задачами и аналитикой на маркетплейсах Wildberries, Ozon и Яндекс Маркет.

## Архитектура

```text
mp-crm/
├── backend/                    # Node.js + Express + Prisma
│   ├── prisma/
│   │   ├── schema.prisma       # Схема БД
│   │   ├── seed.js             # Наполнение тестовыми данными
│   │   └── cleanup.js          # Очистка демо-данных
│   ├── src/
│   │   ├── config/
│   │   │   ├── index.js        # Конфигурация приложения
│   │   │   └── database.js     # Prisma client singleton
│   │   ├── controllers/
│   │   │   ├── authController.js
│   │   │   ├── chatController.js
│   │   │   ├── taskController.js
│   │   │   ├── analyticsController.js
│   │   │   ├── marketplaceController.js
│   │   │   └── notificationController.js
│   │   ├── middleware/
│   │   │   ├── auth.js
│   │   │   └── errorHandler.js
│   │   ├── routes/
│   │   │   └── index.js
│   │   ├── services/
│   │   │   ├── marketplaceSync.js
│   │   │   └── cronJobs.js
│   │   ├── websocket/
│   │   │   └── index.js
│   │   ├── utils/
│   │   │   └── logger.js
│   │   └── index.js
│   ├── Dockerfile
│   └── package.json
│
├── frontend/                   # React + Vite + Zustand
│   ├── src/
│   │   ├── services/
│   │   │   ├── api.js
│   │   │   └── websocket.js
│   │   ├── store/
│   │   │   └── index.js
│   │   └── components/
│   ├── Dockerfile
│   └── package.json
│
├── nginx/
│   └── nginx.conf
├── docker-compose.yml
├── package.json
└── README.md
```

## Стек технологий

| Слой | Технологии |
|------|------------|
| Frontend | React 18, Vite, Zustand, Socket.IO Client, Axios |
| Backend | Node.js, Express, Socket.IO, JWT, bcrypt |
| БД | PostgreSQL, Prisma ORM |
| Кэш | Redis |
| Инфра | Docker, Nginx, node-cron |

## Основные возможности

- Единое окно для нескольких кабинетов маркетплейсов
- Реал-тайм чаты через WebSocket
- Задачи и напоминания для менеджеров
- Уведомления о новых сообщениях и просроченных задачах
- Аналитика по времени ответа и экспорт в CSV
- Роли `ADMIN`, `MANAGER`, `VIEWER`
- Автоматическая синхронизация чатов по cron

## API

### Auth

| Метод | Маршрут | Описание |
|-------|---------|----------|
| POST | `/auth/register` | Регистрация |
| POST | `/auth/login` | Вход |
| POST | `/auth/refresh` | Обновление токена |
| POST | `/auth/logout` | Выход |
| GET | `/auth/me` | Текущий пользователь |

### Chats

| Метод | Маршрут | Описание |
|-------|---------|----------|
| GET | `/chats` | Список чатов |
| GET | `/chats/:chatId` | Чат с сообщениями |
| POST | `/chats/:chatId/messages` | Отправить сообщение |
| PATCH | `/chats/:chatId/read` | Пометить прочитанным |
| PATCH | `/chats/:chatId/assign` | Назначить менеджера |
| PATCH | `/chats/:chatId/status` | Изменить статус |

### Tasks

| Метод | Маршрут | Описание |
|-------|---------|----------|
| GET | `/tasks` | Список задач |
| GET | `/tasks/:taskId` | Одна задача |
| POST | `/tasks` | Создать задачу |
| PUT | `/tasks/:taskId` | Обновить задачу |
| DELETE | `/tasks/:taskId` | Удалить задачу |
| PATCH | `/tasks/:taskId/toggle` | Переключить статус |

### Notifications

| Метод | Маршрут | Описание |
|-------|---------|----------|
| GET | `/notifications` | Список уведомлений |
| PATCH | `/notifications/read-all` | Прочитать все |
| PATCH | `/notifications/:id/read` | Прочитать одно |

### Analytics

| Метод | Маршрут | Описание |
|-------|---------|----------|
| GET | `/analytics/response-time` | Время ответа |
| GET | `/analytics/response-time/export` | Экспорт CSV |
| GET | `/analytics/dashboard` | Сводная статистика |

## WebSocket события

### Клиент → Сервер

| Событие | Данные |
|---------|--------|
| `join_chat` | `chatId` |
| `leave_chat` | `chatId` |
| `join_cabinet` | `cabinetId` |
| `send_message` | `{ chatId, text }` |
| `typing` | `{ chatId }` |
| `mark_read` | `{ chatId }` |

### Сервер → Клиент

| Событие | Данные |
|---------|--------|
| `new_message` | `{ chatId, message }` |
| `chat_updated` | `{ chatId, ... }` |
| `notification_sound` | `{ type, chatId }` |
| `task_overdue` | `{ taskId, title }` |
| `task_reminder` | `{ taskId, title }` |

## Схема данных

Основные сущности:

- `User`
- `RefreshToken`
- `Marketplace`
- `Cabinet`
- `UserCabinet`
- `Chat`
- `ChatMessage`
- `Task`
- `Notification`
- `AnalyticsSnapshot`

## Фоновые задачи

| Расписание | Задача |
|------------|--------|
| Каждые 2 минуты | Синхронизация чатов |
| Каждую минуту | Проверка просроченных задач |
| Каждый час | Агрегация аналитики |
| Каждую минуту | Напоминания о задачах |

## Быстрый старт

### Docker

```bash
git clone <repo>
cd mp-crm-system

# Создайте backend/.env вручную
docker compose up -d
```

Приложение будет доступно по адресам:

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:4000/api/v1`

### Локальный запуск без Docker

Требования:

- Node.js 20+
- PostgreSQL
- Redis

1. Создайте базу данных:

```bash
createdb mp_crm
```

2. Создайте файл `backend/.env` вручную. Минимальный пример:

```env
PORT=4000
NODE_ENV=development
API_PREFIX=/api/v1
DATABASE_URL=postgresql://postgres:password@localhost:5432/mp_crm?schema=public
JWT_SECRET=dev-secret-change-me
JWT_REFRESH_SECRET=dev-refresh-secret
CORS_ORIGIN=http://localhost:5173
LOG_LEVEL=debug
```

3. Установите зависимости:

```bash
npm install
```

4. Подготовьте Prisma и заполните базу:

```bash
cd backend
npx prisma generate
npx prisma db push
npx prisma db seed
cd ..
```

5. Запустите проект:

```bash
npm run dev
```

Тестовый доступ после `seed`:

- Email: `admin@mpcrm.ru`
- Пароль: `password123`

## Переменные окружения для маркетплейсов

При необходимости добавьте в `backend/.env` токены для интеграций:

- `WB_CABINET_1_TOKEN` ... `WB_CABINET_5_TOKEN`
- `OZON_CABINET_1_CLIENT_ID`, `OZON_CABINET_1_API_KEY` и далее
- `YANDEX_CABINET_1_TOKEN`
- `YANDEX_CABINET_1_BUSINESS_ID` (приоритетно для API `/businesses/{id}`)
- `YANDEX_CABINET_1_CAMPAIGN_ID`

## Статус проекта

Проект выглядит как сильный MVP: основная серверная логика, WebSocket и доменная модель уже реализованы, но для production-готовности ещё понадобятся тесты, выравнивание frontend API-слоя и дополнительные проверки запуска.
