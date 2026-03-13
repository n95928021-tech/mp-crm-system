// ══════════════════════════════════════════════
// MP CRM — Application Configuration
// ══════════════════════════════════════════════

require('dotenv').config();

module.exports = {
  // Server
  port: parseInt(process.env.PORT, 10) || 4000,
  nodeEnv: process.env.NODE_ENV || 'development',
  apiPrefix: process.env.API_PREFIX || '/api/v1',

  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-change-me',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  },

  // CORS
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
    credentials: true,
  },

  // Marketplace APIs
  marketplaces: {
    wb: {
      baseUrl: process.env.WB_API_BASE_URL || 'https://suppliers-api.wildberries.ru',
      tokens: [
        process.env.WB_CABINET_1_TOKEN,
        process.env.WB_CABINET_2_TOKEN,
        process.env.WB_CABINET_3_TOKEN,
        process.env.WB_CABINET_4_TOKEN,
        process.env.WB_CABINET_5_TOKEN,
      ].filter(Boolean),
    },
    ozon: {
      baseUrl: process.env.OZON_API_BASE_URL || 'https://api-seller.ozon.ru',
      cabinets: [1, 2, 3, 4].map((i) => ({
        clientId: process.env[`OZON_CABINET_${i}_CLIENT_ID`],
        apiKey: process.env[`OZON_CABINET_${i}_API_KEY`],
      })).filter((c) => c.clientId),
    },
    yandex: {
      baseUrl: process.env.YANDEX_API_BASE_URL || 'https://api.partner.market.yandex.ru',
      token: process.env.YANDEX_CABINET_1_TOKEN,
      campaignId: process.env.YANDEX_CABINET_1_CAMPAIGN_ID,
    },
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    file: process.env.LOG_FILE || 'logs/app.log',
  },

  // Chat timer thresholds (seconds)
  chatTimers: {
    green: 120,   // < 2 мин
    yellow: 300,  // 2-5 мин
    // > 5 мин = красный
  },
};
