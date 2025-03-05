'use strict';

// Test configuration module - overrides production config settings for testing

const path = require('path');
const os = require('os');

// Generate temporary file paths for testing
const tempDir = os.tmpdir();
const testDbPath = path.join(tempDir, 'giftmint-test.sqlite');
const testKeyStoragePath = path.join(tempDir, 'giftmint-test-keys');

// Generate power-of-2 denominations
function generatePowerOf2Denominations(maxPower = 10) { // Smaller set for tests
  const denominations = [];
  for (let power = 0; power <= maxPower; power++) {
    denominations.push(Math.pow(2, power));
  }
  return denominations;
}

// Export test configuration
module.exports = {
  // Server configuration
  environment: 'test',
  isDevelopment: false,
  port: process.env.PORT || 3501,
  
  // Authentication
  apiKeys: ['test-api-key-1', 'test-api-key-2'],
  
  // Database configuration
  database: {
    client: 'sqlite3',
    connection: {
      filename: testDbPath
    },
    useNullAsDefault: true,
    debug: false,
    // Test-specific settings
    pool: {
      min: 1,
      max: 1,
      idleTimeoutMillis: 1000
    }
  },
  
  // Token configuration
  token: {
    prefix: 'GM',
    expiryDays: 7, // shorter expiry for testing
    maxBundleSize: 100
  },
  
  // Cryptography configuration
  crypto: {
    curve: 'secp256k1',
    keyRotationDays: 1, // shorter rotation for testing
    keyRetentionDays: 7, // shorter retention for testing
    keyStoragePath: testKeyStoragePath
  },
  
  // Denominations configuration (smaller set for testing)
  denominations: generatePowerOf2Denominations(10),
  
  // Rate limiting (high limits for testing)
  rateLimit: {
    windowMs: 60000, // 1 minute
    max: 1000 // high max for tests
  },
  
  // Logging - silent for tests
  logging: {
    level: 'error'
  },
  
  // Testing specific configuration
  test: {
    dbPath: testDbPath,
    keyStoragePath: testKeyStoragePath,
    cleanupAfterTests: true // Whether to clean up test files after tests
  }
};