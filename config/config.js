'use strict';

const dotenv = require('dotenv');
dotenv.config();

const environment = process.env.NODE_ENV || 'development';
const isDevelopment = environment === 'development';

// Generate power-of-2 denominations (1, 2, 4, 8, 16, 32, 64, 128, 256, 512, 1024, etc.)
// Going up to the next power of 2 after 1,000,000 (which is 2^20 = 1,048,576)
function generatePowerOf2Denominations(maxPower = 20) {
  const denominations = [];
  for (let power = 0; power <= maxPower; power++) {
    denominations.push(Math.pow(2, power));
  }
  return denominations;
}

module.exports = {
  // Server configuration
  environment,
  isDevelopment,
  port: process.env.PORT || 3500,
  
  // Authentication
  apiKeys: process.env.API_KEYS ? process.env.API_KEYS.split(',') : ['dev-key-do-not-use-in-production'],
  
  // Database configuration
  database: {
    client: 'sqlite3',
    connection: {
      filename: process.env.DB_PATH || './db/giftmint.sqlite'
    },
    useNullAsDefault: true,
    debug: isDevelopment
  },
  
  // Token configuration
  token: {
    prefix: process.env.TOKEN_PREFIX || 'GM',
    expiryDays: parseInt(process.env.TOKEN_EXPIRY_DAYS || '365', 10),
    maxBundleSize: parseInt(process.env.MAX_BUNDLE_SIZE || '100', 10)
  },
  
  // Cryptography configuration
  crypto: {
    curve: 'secp256k1',
    keyRotationDays: parseInt(process.env.KEY_ROTATION_DAYS || '30', 10),
    keyRetentionDays: parseInt(process.env.KEY_RETENTION_DAYS || '365', 10),
    keyStoragePath: process.env.KEY_STORAGE_PATH || './keys'
  },
  
  // Denominations configuration (power of 2 values, up to and beyond 1,000,000)
  denominations: generatePowerOf2Denominations(20),
  
  // Rate limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10), // 1 minute
    max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10) // 100 requests per minute
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || (isDevelopment ? 'debug' : 'info')
  }
};