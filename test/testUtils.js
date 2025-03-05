'use strict';

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const testConfig = require('./testConfig');

/**
 * Initializes the test environment
 */
async function setupTestEnvironment() {
  // Create directories if they don't exist
  try {
    await fs.mkdir(testConfig.crypto.keyStoragePath, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
  
  // Ensure the parent directory for the DB exists
  const dbDir = path.dirname(testConfig.database.connection.filename);
  try {
    await fs.mkdir(dbDir, { recursive: true });
  } catch (err) {
    if (err.code !== 'EEXIST') throw err;
  }
}

/**
 * Cleans up test environment (files, etc.)
 */
async function cleanupTestEnvironment() {
  if (!testConfig.test.cleanupAfterTests) return;
  
  // Remove test database
  try {
    await fs.unlink(testConfig.database.connection.filename);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`Error cleaning up test DB: ${err.message}`);
  }
  
  // Remove test key files
  try {
    const files = await fs.readdir(testConfig.crypto.keyStoragePath);
    for (const file of files) {
      await fs.unlink(path.join(testConfig.crypto.keyStoragePath, file));
    }
    await fs.rmdir(testConfig.crypto.keyStoragePath);
  } catch (err) {
    if (err.code !== 'ENOENT') console.error(`Error cleaning up test keys: ${err.message}`);
  }
}

/**
 * Generates test data for tokens
 */
function generateTestData() {
  return {
    // Generate test amounts
    validAmounts: [1, 5, 42, 100, 1024, 9999],
    invalidAmounts: [-1, 0, 'abc', null, undefined, NaN],
    
    // Generate mock API key
    validApiKey: testConfig.apiKeys[0],
    invalidApiKey: 'invalid-api-key',
    
    // Generate mock tokens
    mockSecret: crypto.randomBytes(32).toString('hex'),
    mockSignature: crypto.randomBytes(64).toString('hex')
  };
}

/**
 * Creates a full mock token for testing
 */
function createMockToken(keyId = 'test-key-id', denomination = 1024, secret = null, signature = null) {
  // Generate random values if not provided
  const tokenSecret = secret || crypto.randomBytes(32).toString('hex');
  const tokenSignature = signature || crypto.randomBytes(64).toString('hex');
  
  // Create token ID from secret
  const tokenId = crypto.createHash('sha256').update(tokenSecret).digest('hex');
  
  // Create the token object
  const tokenObj = {
    id: tokenId,
    keyId: keyId,
    denomination: denomination,
    secret: tokenSecret,
    signature: tokenSignature
  };
  
  // Convert to JSON and encode as base64
  const tokenJson = JSON.stringify(tokenObj);
  const tokenBase64 = Buffer.from(tokenJson).toString('base64url');
  
  // Add token prefix
  return {
    token: `${testConfig.token.prefix}_${tokenBase64}`,
    raw: tokenObj
  };
}

/**
 * Creates a mock key for testing
 */
function createMockKey(expired = false) {
  const expiresAt = new Date();
  if (expired) {
    expiresAt.setDate(expiresAt.getDate() - 10); // 10 days in the past
  } else {
    expiresAt.setDate(expiresAt.getDate() + 10); // 10 days in the future
  }
  
  return {
    id: crypto.randomBytes(8).toString('hex'),
    publicKey: '-----BEGIN PUBLIC KEY-----\nMFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAETest/Public/Key/For/Testing/Purposes/Only==\n-----END PUBLIC KEY-----',
    privateKey: '-----BEGIN PRIVATE KEY-----\nMHcCAQEEITest+Private+Key+For+Testing+Purposes+Only/Invalid/Do/Not/Use\n-----END PRIVATE KEY-----',
    expiresAt,
    createdAt: new Date(),
    active: !expired
  };
}

// Mock database functions
const mockDb = {
  init: jest.fn().mockResolvedValue(true),
  shutdown: jest.fn().mockResolvedValue(true),
  isTokenRedeemed: jest.fn().mockResolvedValue(false),
  markTokenAsRedeemed: jest.fn().mockResolvedValue(true),
  getTokenStats: jest.fn().mockResolvedValue([]),
  incrementMintedCount: jest.fn().mockResolvedValue(true),
  storeKey: jest.fn().mockResolvedValue(true),
  getKeyById: jest.fn().mockResolvedValue(null),
  getActiveKeys: jest.fn().mockResolvedValue([]),
  deactivateKey: jest.fn().mockResolvedValue(true),
  beginTransaction: jest.fn().mockResolvedValue(true),
  commitTransaction: jest.fn().mockResolvedValue(true),
  rollbackTransaction: jest.fn().mockResolvedValue(true),
  getTransaction: jest.fn().mockReturnValue(null)
};

// Export test utilities
module.exports = {
  setupTestEnvironment,
  cleanupTestEnvironment,
  generateTestData,
  createMockToken,
  createMockKey,
  mockDb
};