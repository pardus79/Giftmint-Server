/**
 * Key Manager for Chaumian e-cash
 */

const fs = require('fs').promises;
const path = require('path');
const forge = require('node-forge');
const { v4: uuidv4 } = require('uuid');
const config = require('../config/config');
const { getDb } = require('../db/database');
const pino = require('pino');

// Initialize logger
const logger = pino({
  level: config.log.level,
  transport: {
    target: 'pino-pretty',
    options: {
      colorize: true
    }
  }
});

// Current active key ID
let activeKeyId = null;

/**
 * Initialize key manager
 */
async function init() {
  try {
    // Load existing keys from database
    const db = getDb();
    const keys = await db('mint_keys')
      .where('is_active', true)
      .where('expires_at', '>', new Date())
      .orderBy('created_at', 'desc');
    
    // If no valid key exists, create a new one
    if (!keys || keys.length === 0) {
      logger.info('No valid keys found, creating a new key pair');
      const keyId = await createNewKeyPair();
      activeKeyId = keyId;
    } else {
      // Use the most recent key
      activeKeyId = keys[0].id;
      logger.info({ keyId: activeKeyId }, 'Using existing key');
    }
    
    // Schedule key rotation
    scheduleKeyRotation();
    
    return activeKeyId;
  } catch (error) {
    logger.error(error, 'Failed to initialize key manager');
    throw error;
  }
}

/**
 * Create a new key pair
 * 
 * @returns {string} Key ID
 */
async function createNewKeyPair() {
  try {
    // Generate RSA key pair
    const keyPair = forge.pki.rsa.generateKeyPair({ bits: 2048 });
    
    // Convert keys to PEM format
    const privateKey = forge.pki.privateKeyToPem(keyPair.privateKey);
    const publicKey = forge.pki.publicKeyToPem(keyPair.publicKey);
    
    // Generate unique key ID
    const keyId = uuidv4();
    
    // Calculate expiry date
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + config.crypto.keyRotationInterval);
    
    // Store key in database
    const db = getDb();
    await db('mint_keys').insert({
      id: keyId,
      public_key: publicKey,
      private_key: privateKey,
      created_at: new Date(),
      expires_at: expiryDate,
      is_active: true
    });
    
    logger.info({ keyId }, 'Created new key pair');
    
    return keyId;
  } catch (error) {
    logger.error(error, 'Failed to create new key pair');
    throw error;
  }
}

/**
 * Schedule key rotation
 */
function scheduleKeyRotation() {
  // Schedule key rotation at half the key rotation interval
  const rotationInterval = config.crypto.keyRotationInterval * 500; // Half interval in milliseconds
  
  setTimeout(async () => {
    try {
      logger.info('Rotating keys');
      await rotateKeys();
      scheduleKeyRotation();
    } catch (error) {
      logger.error(error, 'Failed to rotate keys');
      scheduleKeyRotation();
    }
  }, rotationInterval);
}

/**
 * Rotate keys - create a new key pair and mark it as active
 */
async function rotateKeys() {
  try {
    // Create a new key pair
    const newKeyId = await createNewKeyPair();
    
    // Set as active key
    activeKeyId = newKeyId;
    
    // Keep old keys active until they expire
    logger.info({ keyId: newKeyId }, 'Rotated to new key');
    
    return newKeyId;
  } catch (error) {
    logger.error(error, 'Failed to rotate keys');
    throw error;
  }
}

/**
 * Get active key pair
 * 
 * @returns {Object} Key pair object with id, publicKey, privateKey
 */
async function getActiveKeyPair() {
  try {
    // Ensure we have an active key
    if (!activeKeyId) {
      await init();
    }
    
    // Get key from database
    const db = getDb();
    const key = await db('mint_keys')
      .where('id', activeKeyId)
      .first();
    
    if (!key) {
      throw new Error('Active key not found');
    }
    
    return {
      id: key.id,
      publicKey: key.public_key,
      privateKey: key.private_key
    };
  } catch (error) {
    logger.error(error, 'Failed to get active key pair');
    throw error;
  }
}

/**
 * Get key pair by ID
 * 
 * @param {string} keyId - Key ID
 * @returns {Object} Key pair object with id, publicKey, privateKey
 */
async function getKeyPairById(keyId) {
  try {
    const db = getDb();
    const key = await db('mint_keys')
      .where('id', keyId)
      .first();
    
    if (!key) {
      throw new Error(`Key not found: ${keyId}`);
    }
    
    return {
      id: key.id,
      publicKey: key.public_key,
      privateKey: key.private_key
    };
  } catch (error) {
    logger.error(error, 'Failed to get key pair by ID');
    throw error;
  }
}

/**
 * Get active key ID
 * 
 * @returns {string} Active key ID
 */
function getActiveKeyId() {
  if (!activeKeyId) {
    throw new Error('Key manager not initialized');
  }
  return activeKeyId;
}

module.exports = {
  init,
  getActiveKeyPair,
  getKeyPairById,
  getActiveKeyId,
  rotateKeys
};