'use strict';

const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const config = require('../config/config');
const db = require('../db/database');

/**
 * Generate a new EC key pair
 * @returns {Object} Object containing publicKey and privateKey
 */
function generateKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: config.crypto.curve,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'sec1',
      format: 'pem'
    }
  });
  
  return {
    publicKey,
    privateKey
  };
}

/**
 * Generate a unique key ID
 * @returns {string} A unique key ID
 */
function generateKeyId() {
  return crypto.randomBytes(16).toString('hex');
}

/**
 * Create a new key and store it
 * @returns {Promise<Object>} The newly created key
 */
async function createNewKey() {
  // Generate key pair
  const keyPair = generateKeyPair();
  const keyId = generateKeyId();
  
  // Calculate expiration date
  const expiresAt = new Date();
  expiresAt.setDate(expiresAt.getDate() + config.crypto.keyRotationDays);
  
  // Create key object
  const key = {
    id: keyId,
    publicKey: keyPair.publicKey,
    privateKey: keyPair.privateKey,
    expiresAt
  };
  
  // Ensure keys directory exists
  await ensureKeyDirectoryExists();
  
  // Save to database
  await db.storeKey(key);
  
  // Save to filesystem as backup
  await saveKeyToFile(key);
  
  console.log(`Created new key with ID: ${keyId}`);
  
  return key;
}

/**
 * Ensure the key directory exists
 */
async function ensureKeyDirectoryExists() {
  try {
    await fs.mkdir(config.crypto.keyStoragePath, { recursive: true });
  } catch (error) {
    if (error.code !== 'EEXIST') {
      throw error;
    }
  }
}

/**
 * Save a key to filesystem as backup
 * @param {Object} key - The key to save
 */
async function saveKeyToFile(key) {
  const keyPath = path.join(config.crypto.keyStoragePath, `${key.id}.json`);
  
  await fs.writeFile(
    keyPath,
    JSON.stringify({
      id: key.id,
      publicKey: key.publicKey,
      privateKey: key.privateKey,
      expiresAt: key.expiresAt
    }, null, 2),
    'utf8'
  );
}

/**
 * Gets the currently active key for signing
 * @returns {Promise<Object|null>} The active key, or null if no active key is available
 */
async function getActiveKey() {
  // Get all active keys
  const activeKeys = await db.getActiveKeys();
  
  // If no active keys, create a new one
  if (activeKeys.length === 0) {
    return await createNewKey();
  }
  
  // Get the most recent key
  const latestKey = activeKeys[0];
  
  // Check if key is expired
  const now = new Date();
  if (new Date(latestKey.expiresAt) < now) {
    // Create a new key
    return await createNewKey();
  }
  
  return latestKey;
}

/**
 * Get a key by its ID
 * @param {string} keyId - The key ID
 * @returns {Promise<Object|null>} The key, or null if not found
 */
async function getKeyById(keyId) {
  // Check database first
  const key = await db.getKeyById(keyId);
  
  if (key) {
    return key;
  }
  
  // If not found in database, try to load from filesystem
  try {
    const keyPath = path.join(config.crypto.keyStoragePath, `${keyId}.json`);
    const keyData = await fs.readFile(keyPath, 'utf8');
    return JSON.parse(keyData);
  } catch (error) {
    // Key not found
    return null;
  }
}

/**
 * Rotates keys by deactivating expired keys and creating a new key if needed
 * @returns {Promise<void>}
 */
async function rotateKeys() {
  // Get all active keys
  const activeKeys = await db.getActiveKeys();
  
  // Check for expired keys
  const now = new Date();
  let needNewKey = activeKeys.length === 0;
  
  for (const key of activeKeys) {
    const expiresAt = new Date(key.expiresAt);
    
    if (expiresAt < now) {
      // Deactivate expired key
      await db.deactivateKey(key.id);
      console.log(`Deactivated expired key: ${key.id}`);
      needNewKey = true;
    }
  }
  
  // Create a new key if needed
  if (needNewKey) {
    await createNewKey();
  }
  
  // Clean up old key files
  await cleanupOldKeyFiles();
}

/**
 * Clean up old key files that exceed retention period
 * @returns {Promise<void>}
 */
async function cleanupOldKeyFiles() {
  try {
    const retentionDate = new Date();
    retentionDate.setDate(retentionDate.getDate() - config.crypto.keyRetentionDays);
    
    const files = await fs.readdir(config.crypto.keyStoragePath);
    
    for (const file of files) {
      if (!file.endsWith('.json')) continue;
      
      const filePath = path.join(config.crypto.keyStoragePath, file);
      const stats = await fs.stat(filePath);
      
      if (stats.mtime < retentionDate) {
        await fs.unlink(filePath);
        console.log(`Removed old key file: ${file}`);
      }
    }
  } catch (error) {
    console.error('Error cleaning up old key files:', error);
  }
}

/**
 * Initialize the key manager by ensuring at least one active key exists
 * @returns {Promise<void>}
 */
async function init() {
  // Ensure keys directory exists
  await ensureKeyDirectoryExists();
  
  // Rotate keys (this will create a new key if needed)
  await rotateKeys();
  
  console.log('Key manager initialized');
}

// Export functions
module.exports = {
  generateKeyPair,
  createNewKey,
  getActiveKey,
  getKeyById,
  rotateKeys,
  init
};