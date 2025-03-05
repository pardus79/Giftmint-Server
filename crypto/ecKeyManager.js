/**
 * Elliptic Curve Key Manager for private e-cash gift certificates
 * 
 * This module manages the cryptographic keys used for gift certificate generation.
 * This is a private implementation not compatible with external systems.
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const secp256k1 = require('secp256k1');
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

// Current active keyset ID
let activeKeysetId = null;

/**
 * Initialize key manager and create default keysets
 */
async function init() {
  try {
    const db = getDb();
    
    // Create default keysets if none exist
    const keysets = await db('ec_keysets').where('is_active', true);
    
    if (!keysets || keysets.length === 0) {
      logger.info('No EC keysets found, creating defaults');
      await createDefaultKeysets();
    }
    
    // Get all active keysets
    const activeKeysets = await db('ec_keysets').where('is_active', true);
    
    // Load existing keys
    const keys = await db('ec_keys')
      .where('is_active', true)
      .where('expires_at', '>', new Date())
      .orderBy('created_at', 'desc');
    
    // Check if we need to create keys for any keyset
    for (const keyset of activeKeysets) {
      const keysetKeys = keys.filter(key => key.keyset_id === keyset.id);
      
      if (keysetKeys.length === 0) {
        logger.info(`No valid keys found for keyset ${keyset.id}, creating a new key pair`);
        await createNewKeyPair(keyset.id);
      } else {
        // Use the most recent key for this keyset
        logger.info({ keyId: keysetKeys[0].id }, `Using existing key for keyset ${keyset.id}`);
      }
    }
    
    // Set the active keyset to the first active one
    if (activeKeysets.length > 0) {
      activeKeysetId = activeKeysets[0].id;
      const activeKeysetKeys = keys.filter(key => key.keyset_id === activeKeysetId);
      
      if (activeKeysetKeys.length === 0) {
        // Create a new key pair for the active keyset
        await createNewKeyPair(activeKeysetId);
      }
    } else {
      // This should not happen as we should have created keysets above
      throw new Error('No active keysets found after initialization');
    }
    
    // Schedule key rotation
    scheduleKeyRotation();
    
    return activeKeysetId;
  } catch (error) {
    logger.error({ error }, 'Failed to initialize EC key manager');
    throw error;
  }
}

/**
 * Create default keysets
 */
async function createDefaultKeysets() {
  const db = getDb();
  
  // Define default keysets - Unlike RSA, we don't need different keysets for different values
  // We'll use power-of-2 keyset values to make change-making easy for gift certificates
  const defaultKeysets = [
    { id: uuidv4(), value: 1, currency: 'SATS', description: '1 Satoshi' },
    { id: uuidv4(), value: 2, currency: 'SATS', description: '2 Satoshis' },
    { id: uuidv4(), value: 4, currency: 'SATS', description: '4 Satoshis' },
    { id: uuidv4(), value: 8, currency: 'SATS', description: '8 Satoshis' },
    { id: uuidv4(), value: 16, currency: 'SATS', description: '16 Satoshis' },
    { id: uuidv4(), value: 32, currency: 'SATS', description: '32 Satoshis' },
    { id: uuidv4(), value: 64, currency: 'SATS', description: '64 Satoshis' },
    { id: uuidv4(), value: 128, currency: 'SATS', description: '128 Satoshis' },
    { id: uuidv4(), value: 256, currency: 'SATS', description: '256 Satoshis' },
    { id: uuidv4(), value: 512, currency: 'SATS', description: '512 Satoshis' },
    { id: uuidv4(), value: 1024, currency: 'SATS', description: '1,024 Satoshis' },
    { id: uuidv4(), value: 2048, currency: 'SATS', description: '2,048 Satoshis' },
    { id: uuidv4(), value: 4096, currency: 'SATS', description: '4,096 Satoshis' },
    { id: uuidv4(), value: 8192, currency: 'SATS', description: '8,192 Satoshis' }
  ];
  
  // Create keysets table if it doesn't exist
  if (!(await db.schema.hasTable('ec_keysets'))) {
    await db.schema.createTable('ec_keysets', table => {
      table.string('id').primary();
      table.integer('value').notNullable();
      table.string('currency', 10).notNullable();
      table.string('description').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.boolean('is_active').defaultTo(true);
    });
    
    logger.info('Created ec_keysets table');
  }
  
  // Create keys table if it doesn't exist
  if (!(await db.schema.hasTable('ec_keys'))) {
    await db.schema.createTable('ec_keys', table => {
      table.string('id').primary();
      table.string('keyset_id').notNullable();
      table.text('private_key').notNullable();
      table.text('public_key').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('expires_at').notNullable();
      table.boolean('is_active').defaultTo(true);
      
      table.foreign('keyset_id').references('id').inTable('ec_keysets');
    });
    
    logger.info('Created ec_keys table');
  }
  
  // Insert default keysets
  for (const keyset of defaultKeysets) {
    await db('ec_keysets').insert({
      id: keyset.id,
      value: keyset.value,
      currency: keyset.currency,
      description: keyset.description,
      created_at: new Date(),
      is_active: true
    });
  }
  
  logger.info('Created default EC keysets');
}

/**
 * Create a new EC key pair for a specific keyset
 * 
 * @param {string} keysetId - The keyset ID this key will be used for
 * @returns {string} Key ID
 */
async function createNewKeyPair(keysetId) {
  try {
    // Validate keyset exists
    const db = getDb();
    const keyset = await db('ec_keysets').where('id', keysetId).first();
    
    if (!keyset) {
      throw new Error(`Keyset ${keysetId} not found`);
    }
    
    // Generate a new private key
    let privateKey;
    do {
      privateKey = crypto.randomBytes(32);
    } while (!secp256k1.privateKeyVerify(privateKey));
    
    // Derive the public key
    const publicKey = secp256k1.publicKeyCreate(privateKey);
    
    // Generate unique key ID
    const keyId = uuidv4();
    
    // Calculate expiry date - ensure proper interval calculation (in seconds)
    // Default to 24 hours (86400 seconds) if config value is missing or invalid
    const rotationIntervalSecs = config.crypto && 
                              config.crypto.keyRotationInterval && 
                              typeof config.crypto.keyRotationInterval === 'number' ? 
                              config.crypto.keyRotationInterval : 86400;
                              
    const expiryDate = new Date();
    expiryDate.setSeconds(expiryDate.getSeconds() + rotationIntervalSecs);
    
    logger.debug(`New key will expire at ${expiryDate.toISOString()} (${rotationIntervalSecs} seconds from now)`);
    
    // Store key in database - ensure proper hex encoding
    await db('ec_keys').insert({
      id: keyId,
      keyset_id: keysetId,
      private_key: privateKey.toString('hex'),
      public_key: Buffer.from(publicKey).toString('hex'), // Ensure proper hex encoding
      created_at: new Date(),
      expires_at: expiryDate,
      is_active: true
    });
    
    logger.info({ keyId, keysetId }, 'Created new EC key pair');
    
    return keyId;
  } catch (error) {
    logger.error({ error }, 'Failed to create new EC key pair');
    throw error;
  }
}

/**
 * Schedule key rotation
 */
function scheduleKeyRotation() {
  // Convert to milliseconds - ensure long enough interval to avoid excessive rotation
  // The keyRotationInterval is in seconds, so multiply by 1000 to get milliseconds
  const rotationIntervalMs = config.crypto.keyRotationInterval * 1000;
  
  logger.info(`Scheduling next key rotation in ${rotationIntervalMs / 1000} seconds`);
  
  setTimeout(async () => {
    try {
      logger.info('Rotating EC keys');
      await rotateKeys();
      scheduleKeyRotation();
    } catch (error) {
      logger.error({ error }, 'Failed to rotate EC keys');
      // On error, still reschedule but with a longer delay (60 seconds)
      setTimeout(() => scheduleKeyRotation(), 60000);
    }
  }, rotationIntervalMs);
}

/**
 * Rotate keys - create new key pairs for keysets that need them
 */
async function rotateKeys() {
  try {
    const db = getDb();
    
    // Get all active keysets
    const activeKeysets = await db('ec_keysets').where('is_active', true);
    
    // Count for rotation summary
    let keysetsRotated = 0;
    let keysetsSkipped = 0;
    
    // Create new key pairs only for keysets with soon-to-expire keys or no keys
    for (const keyset of activeKeysets) {
      // Check if there are any active, non-expired keys for this keyset
      const existingKeys = await db('ec_keys')
        .where('keyset_id', keyset.id)
        .where('is_active', true)
        .where('expires_at', '>', new Date())
        .orderBy('created_at', 'desc');
        
      // Calculate the threshold date for rotation (80% of the way to expiry)
      const now = new Date();
      const rotationThreshold = new Date();
      // Add 20% of the rotation interval to now to get the threshold
      rotationThreshold.setSeconds(now.getSeconds() + (config.crypto.keyRotationInterval * 0.2));
      
      // Only rotate if we have no keys or the newest key is approaching expiry
      if (existingKeys.length === 0 || new Date(existingKeys[0].expires_at) < rotationThreshold) {
        await createNewKeyPair(keyset.id);
        keysetsRotated++;
      } else {
        // Skip this keyset, it has a valid key with plenty of time left
        keysetsSkipped++;
      }
    }
    
    logger.info(`Key rotation complete: ${keysetsRotated} keysets rotated, ${keysetsSkipped} keysets skipped`);
    
    return activeKeysetId;
  } catch (error) {
    logger.error({ error }, 'Failed to rotate EC keys');
    throw error;
  }
}

/**
 * Get active key pair
 * 
 * @returns {Object} Key pair object with id, publicKey, privateKey, keysetId
 */
async function getActiveKeyPair() {
  try {
    // Ensure we have an active keyset
    if (!activeKeysetId) {
      await init();
    }
    
    // Get most recent key for active keyset
    const db = getDb();
    const key = await db('ec_keys')
      .where('keyset_id', activeKeysetId)
      .where('is_active', true)
      .where('expires_at', '>', new Date())
      .orderBy('created_at', 'desc')
      .first();
    
    if (!key) {
      // Create a new key for the active keyset
      const newKeyId = await createNewKeyPair(activeKeysetId);
      const newKey = await db('ec_keys').where('id', newKeyId).first();
      
      return {
        id: newKey.id,
        publicKey: newKey.public_key,
        privateKey: newKey.private_key,
        keysetId: newKey.keyset_id
      };
    }
    
    return {
      id: key.id,
      publicKey: key.public_key,
      privateKey: key.private_key,
      keysetId: key.keyset_id
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get active EC key pair');
    throw error;
  }
}

/**
 * Get active keyset ID
 * 
 * @returns {string} Active keyset ID
 */
function getActiveKeysetId() {
  if (!activeKeysetId) {
    throw new Error('EC key manager not initialized');
  }
  return activeKeysetId;
}

/**
 * Get key pair for specific keyset ID
 * 
 * @param {string} keysetId - Keyset ID
 * @returns {Object} Key pair object with id, publicKey, privateKey, keysetId
 */
async function getKeyPairForKeyset(keysetId) {
  try {
    const db = getDb();
    
    // Get the most recent key for this keyset
    const key = await db('ec_keys')
      .where('keyset_id', keysetId)
      .where('is_active', true)
      .where('expires_at', '>', new Date())
      .orderBy('created_at', 'desc')
      .first();
    
    if (!key) {
      // Create a new key for this keyset
      const newKeyId = await createNewKeyPair(keysetId);
      const newKey = await db('ec_keys').where('id', newKeyId).first();
      
      return {
        id: newKey.id,
        publicKey: newKey.public_key,
        privateKey: newKey.private_key,
        keysetId: newKey.keyset_id
      };
    }
    
    return {
      id: key.id,
      publicKey: key.public_key,
      privateKey: key.private_key,
      keysetId: key.keyset_id
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get EC key pair for keyset');
    throw error;
  }
}

/**
 * Get keyset by ID
 * 
 * @param {string} keysetId - Keyset ID
 * @returns {Object} Keyset object with id, value, currency, description
 */
async function getKeyset(keysetId) {
  try {
    const db = getDb();
    const keyset = await db('ec_keysets').where('id', keysetId).first();
    
    if (!keyset) {
      throw new Error(`Keyset not found: ${keysetId}`);
    }
    
    return {
      id: keyset.id,
      value: keyset.value,
      currency: keyset.currency,
      description: keyset.description
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get EC keyset');
    throw error;
  }
}

/**
 * Get key pair by ID
 * 
 * @param {string} keyId - Key ID
 * @returns {Object} Key pair object with id, publicKey, privateKey, keysetId
 */
async function getKeyPairById(keyId) {
  try {
    const db = getDb();
    const key = await db('ec_keys').where('id', keyId).first();
    
    if (!key) {
      throw new Error(`EC key not found: ${keyId}`);
    }
    
    return {
      id: key.id,
      publicKey: key.public_key,
      privateKey: key.private_key,
      keysetId: key.keyset_id
    };
  } catch (error) {
    logger.error({ error }, 'Failed to get EC key pair by ID');
    throw error;
  }
}

/**
 * Get all active keysets
 * 
 * @returns {Promise<Array>} Array of keyset objects
 */
async function getAllActiveKeysets() {
  try {
    const db = getDb();
    const keysets = await db('ec_keysets').where('is_active', true);
    
    return keysets.map(keyset => ({
      id: keyset.id,
      value: keyset.value,
      currency: keyset.currency,
      description: keyset.description
    }));
  } catch (error) {
    logger.error({ error }, 'Failed to get all active EC keysets');
    throw error;
  }
}

/**
 * Get keys for specific values
 * 
 * @param {Array<number>} values - Array of denomination values
 * @param {string} [currency='SATS'] - Currency
 * @returns {Promise<Array>} Array of key pairs for each value
 */
async function getKeysForValues(values, currency = 'SATS') {
  try {
    const db = getDb();
    const keyPairs = [];
    
    for (const value of values) {
      // Find keyset with this value
      const keyset = await db('ec_keysets')
        .where('value', value)
        .where('currency', currency)
        .where('is_active', true)
        .first();
      
      if (!keyset) {
        throw new Error(`No active keyset found for value ${value} ${currency}`);
      }
      
      // Get key for this keyset
      const key = await db('ec_keys')
        .where('keyset_id', keyset.id)
        .where('is_active', true)
        .where('expires_at', '>', new Date())
        .orderBy('created_at', 'desc')
        .first();
      
      if (!key) {
        // Create a new key
        const newKeyId = await createNewKeyPair(keyset.id);
        const newKey = await db('ec_keys').where('id', newKeyId).first();
        
        keyPairs.push({
          id: newKey.id,
          publicKey: newKey.public_key,
          privateKey: newKey.private_key,
          keysetId: newKey.keyset_id,
          value: keyset.value
        });
      } else {
        keyPairs.push({
          id: key.id,
          publicKey: key.public_key,
          privateKey: key.private_key,
          keysetId: key.keyset_id,
          value: keyset.value
        });
      }
    }
    
    return keyPairs;
  } catch (error) {
    logger.error({ error }, 'Failed to get EC keys for values');
    throw error;
  }
}

module.exports = {
  init,
  getActiveKeyPair,
  getKeyPairById,
  getKeyPairForKeyset,
  getKeyset,
  getActiveKeysetId,
  rotateKeys,
  getAllActiveKeysets,
  getKeysForValues
};