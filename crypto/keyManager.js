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
 * Initialize key manager and create default denominations
 */
async function init() {
  try {
    const db = getDb();
    
    // Create default denominations if none exist
    const denominations = await db('denominations').where('is_active', true);
    
    if (!denominations || denominations.length === 0) {
      logger.info('No denominations found, creating defaults');
      await createDefaultDenominations();
    }
    
    // Get all active denominations
    const activeDenominations = await db('denominations').where('is_active', true);
    
    // Load existing keys from database
    const keys = await db('mint_keys')
      .where('is_active', true)
      .where('expires_at', '>', new Date())
      .orderBy('created_at', 'desc');
    
    // Check if we need to create keys for any denomination
    for (const denom of activeDenominations) {
      const denomKeys = keys.filter(key => key.denomination_id === denom.id);
      
      if (denomKeys.length === 0) {
        logger.info(`No valid keys found for denomination ${denom.id}, creating a new key pair`);
        await createNewKeyPair(denom.id);
      } else {
        // Use the most recent key for this denomination
        logger.info({ keyId: denomKeys[0].id }, `Using existing key for denomination ${denom.id}`);
      }
    }
    
    // Set the active key for the smallest denomination
    const smallestDenom = activeDenominations.sort((a, b) => a.value - b.value)[0];
    const smallestDenomKeys = keys.filter(key => key.denomination_id === smallestDenom.id);
    
    if (smallestDenomKeys.length > 0) {
      activeKeyId = smallestDenomKeys[0].id;
    } else {
      // This should not happen as we should have created keys above, but just in case
      const newKeyId = await createNewKeyPair(smallestDenom.id);
      activeKeyId = newKeyId;
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
 * Create default denominations
 */
async function createDefaultDenominations() {
  const db = getDb();
  
  // Define default denominations
  const defaultDenominations = [
    { id: uuidv4(), value: 1, currency: 'SATS', description: '1 Satoshi' },
    { id: uuidv4(), value: 10, currency: 'SATS', description: '10 Satoshis' },
    { id: uuidv4(), value: 100, currency: 'SATS', description: '100 Satoshis' },
    { id: uuidv4(), value: 1000, currency: 'SATS', description: '1,000 Satoshis' },
    { id: uuidv4(), value: 10000, currency: 'SATS', description: '10,000 Satoshis' },
    { id: uuidv4(), value: 100000, currency: 'SATS', description: '100,000 Satoshis' },
    { id: uuidv4(), value: 1000000, currency: 'SATS', description: '1,000,000 Satoshis' }
  ];
  
  // Insert default denominations
  for (const denom of defaultDenominations) {
    await db('denominations').insert({
      id: denom.id,
      value: denom.value,
      currency: denom.currency,
      description: denom.description,
      created_at: new Date(),
      is_active: true
    });
  }
  
  logger.info('Created default denominations');
}

/**
 * Create a new key pair for a specific denomination
 * 
 * @param {string} denominationId - The denomination ID this key will be used for
 * @returns {string} Key ID
 */
async function createNewKeyPair(denominationId) {
  try {
    // Validate denomination exists
    const db = getDb();
    const denomination = await db('denominations').where('id', denominationId).first();
    
    if (!denomination) {
      throw new Error(`Denomination ${denominationId} not found`);
    }
    
    // Generate a larger RSA key pair to ensure it can handle our hashes
    const keyPair = forge.pki.rsa.generateKeyPair({ bits: 3072 });
    
    // Convert keys to PEM format
    const privateKey = forge.pki.privateKeyToPem(keyPair.privateKey);
    const publicKey = forge.pki.publicKeyToPem(keyPair.publicKey);
    
    // Generate unique key ID
    const keyId = uuidv4();
    
    // Calculate expiry date
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + config.crypto.keyRotationInterval);
    
    // Store key in database
    await db('mint_keys').insert({
      id: keyId,
      denomination_id: denominationId,
      public_key: publicKey,
      private_key: privateKey,
      created_at: new Date(),
      expires_at: expiryDate,
      is_active: true
    });
    
    logger.info({ keyId, denominationId }, 'Created new key pair');
    
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
 * Rotate keys - create new key pairs for all denominations
 */
async function rotateKeys() {
  try {
    const db = getDb();
    
    // Get all active denominations
    const activeDenominations = await db('denominations').where('is_active', true);
    
    // Create new key pairs for each denomination
    for (const denom of activeDenominations) {
      const newKeyId = await createNewKeyPair(denom.id);
      logger.info({ keyId: newKeyId, denominationId: denom.id }, 'Created new key pair for denomination');
      
      // If this is the smallest denomination, update the active key
      if (activeDenominations.indexOf(denom) === 0) {
        activeKeyId = newKeyId;
      }
    }
    
    // Keep old keys active until they expire
    logger.info('Rotated keys for all denominations');
    
    return activeKeyId;
  } catch (error) {
    logger.error(error, 'Failed to rotate keys');
    throw error;
  }
}

/**
 * Get active key pair
 * 
 * @returns {Object} Key pair object with id, publicKey, privateKey, denominationId
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
      privateKey: key.private_key,
      denominationId: key.denomination_id
    };
  } catch (error) {
    logger.error(error, 'Failed to get active key pair');
    throw error;
  }
}

/**
 * Get key pair for specific denomination
 * 
 * @param {string|number} denomination - Either the denomination ID or the value (amount)
 * @param {string} [currency='SATS'] - The currency of the denomination
 * @returns {Object} Key pair object with id, publicKey, privateKey, denominationId
 */
async function getKeyPairForDenomination(denomination, currency = 'SATS') {
  try {
    const db = getDb();
    
    let denominationId;
    
    // Check if denomination is an ID or a value
    if (typeof denomination === 'string' && denomination.length > 10) {
      // It's probably an ID
      denominationId = denomination;
    } else {
      // It's probably a value, find the denomination with this value
      const denomRecord = await db('denominations')
        .where('value', denomination)
        .where('currency', currency)
        .where('is_active', true)
        .first();
      
      if (!denomRecord) {
        throw new Error(`No active denomination found for value ${denomination} ${currency}`);
      }
      
      denominationId = denomRecord.id;
    }
    
    // Get the most recent key for this denomination
    const key = await db('mint_keys')
      .where('denomination_id', denominationId)
      .where('is_active', true)
      .where('expires_at', '>', new Date())
      .orderBy('created_at', 'desc')
      .first();
    
    if (!key) {
      // Create a new key for this denomination
      const newKeyId = await createNewKeyPair(denominationId);
      
      // Get the newly created key
      const newKey = await db('mint_keys')
        .where('id', newKeyId)
        .first();
        
      return {
        id: newKey.id,
        publicKey: newKey.public_key,
        privateKey: newKey.private_key,
        denominationId: newKey.denomination_id
      };
    }
    
    return {
      id: key.id,
      publicKey: key.public_key,
      privateKey: key.private_key,
      denominationId: key.denomination_id
    };
  } catch (error) {
    logger.error(error, 'Failed to get key pair for denomination');
    throw error;
  }
}

/**
 * Get key pair by ID
 * 
 * @param {string} keyId - Key ID
 * @returns {Object} Key pair object with id, publicKey, privateKey, denominationId
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
      privateKey: key.private_key,
      denominationId: key.denomination_id
    };
  } catch (error) {
    logger.error(error, 'Failed to get key pair by ID');
    throw error;
  }
}

/**
 * Get denomination information
 * 
 * @param {string} denominationId - Denomination ID
 * @returns {Object} Denomination object with id, value, currency
 */
async function getDenomination(denominationId) {
  try {
    const db = getDb();
    const denom = await db('denominations')
      .where('id', denominationId)
      .first();
    
    if (!denom) {
      throw new Error(`Denomination not found: ${denominationId}`);
    }
    
    return {
      id: denom.id,
      value: denom.value,
      currency: denom.currency,
      description: denom.description
    };
  } catch (error) {
    logger.error(error, 'Failed to get denomination');
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
  getKeyPairForDenomination,
  getDenomination,
  getActiveKeyId,
  rotateKeys
};