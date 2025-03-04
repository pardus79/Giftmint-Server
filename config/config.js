/**
 * Giftmint Server Configuration
 */

const config = {
  // Server configuration
  server: {
    port: process.env.PORT || 3500,
    host: process.env.HOST || 'localhost',
  },
  
  // Database configuration
  database: {
    type: process.env.DB_TYPE || 'sqlite', // 'sqlite', 'mysql', 'postgres'
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME || 'giftmint',
    filename: process.env.DB_FILE || './db/giftmint.db', // For SQLite
  },
  
  // API configuration
  api: {
    baseUrl: process.env.API_BASE_URL || '/api/v1',
    apiKeys: (process.env.API_KEYS || '').split(',').filter(Boolean),
    rateLimitWindow: process.env.RATE_LIMIT_WINDOW || 60 * 1000, // 1 minute in ms
    rateLimitMax: process.env.RATE_LIMIT_MAX || 60, // requests per window
  },
  
  // Crypto configuration
  crypto: {
    blindingFactorSize: 32, // bytes
    tokenExpiry: process.env.TOKEN_EXPIRY || 60 * 60 * 24 * 365, // 1 year in seconds
    keyRotationInterval: process.env.KEY_ROTATION_INTERVAL || 60 * 60 * 24 * 30, // 30 days in seconds
    keyFilePath: process.env.KEY_FILE_PATH || './config/keys.json',
  },
  
  // Logging configuration
  log: {
    level: process.env.LOG_LEVEL || 'info', // trace, debug, info, warn, error, fatal
    file: process.env.LOG_FILE,
  },
};

module.exports = config;