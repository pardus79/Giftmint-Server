'use strict';

const knex = require('knex');
const config = require('../config/config');
const crypto = require('crypto');

let db;
let currentTransaction = null;

/**
 * Initializes the database connection and creates tables if they don't exist
 */
async function init() {
  db = knex(config.database);
  
  // Create tables if they don't exist
  await createTables();
  
  console.log('Database initialized');
  
  return db;
}

/**
 * Create the necessary database tables if they don't exist
 */
async function createTables() {
  // Check if 'redeemed_tokens' table exists
  const hasRedeemedTokensTable = await db.schema.hasTable('redeemed_tokens');
  
  if (!hasRedeemedTokensTable) {
    await db.schema.createTable('redeemed_tokens', table => {
      table.string('id').primary().notNullable();
      table.integer('denomination').notNullable();
      table.string('key_id').notNullable();
      table.timestamp('redeemed_at').defaultTo(db.fn.now());
      table.index(['key_id']);
    });
    
    console.log('Created redeemed_tokens table');
  }
  
  // Check if 'keys' table exists
  const hasKeysTable = await db.schema.hasTable('keys');
  
  if (!hasKeysTable) {
    await db.schema.createTable('keys', table => {
      table.string('id').primary().notNullable();
      table.string('public_key').notNullable();
      table.string('private_key').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('expires_at').nullable();
      table.boolean('active').defaultTo(true);
    });
    
    console.log('Created keys table');
  }
  
  // Check if 'token_stats' table exists
  const hasTokenStatsTable = await db.schema.hasTable('token_stats');
  
  if (!hasTokenStatsTable) {
    await db.schema.createTable('token_stats', table => {
      table.increments('id').primary();
      table.integer('denomination').notNullable();
      table.integer('minted_count').defaultTo(0);
      table.integer('redeemed_count').defaultTo(0);
      table.unique(['denomination']);
    });
    
    // Initialize with configured denominations
    const inserts = config.denominations.map(denomination => ({
      denomination,
      minted_count: 0,
      redeemed_count: 0
    }));
    
    await db('token_stats').insert(inserts);
    
    console.log('Created token_stats table');
  }
}

/**
 * Shuts down the database connection
 */
async function shutdown() {
  if (db) {
    await db.destroy();
    console.log('Database connection closed');
  }
}

/**
 * Checks if a token has been redeemed
 * @param {string} tokenId - The token ID
 * @returns {Promise<boolean>} - Whether the token has been redeemed
 */
async function isTokenRedeemed(tokenId) {
  const result = await db('redeemed_tokens')
    .where('id', tokenId)
    .first();
  
  return !!result;
}

/**
 * Marks a token as redeemed
 * @param {string} tokenId - The token ID
 * @param {number} denomination - The token denomination
 * @param {string} keyId - The key ID
 */
async function markTokenAsRedeemed(tokenId, denomination, keyId) {
  await db('redeemed_tokens').insert({
    id: tokenId,
    denomination,
    key_id: keyId,
    redeemed_at: new Date()
  });
  
  // Update statistics
  await db('token_stats')
    .where('denomination', denomination)
    .increment('redeemed_count', 1);
}

/**
 * Gets token statistics
 * @returns {Promise<Array>} - Token statistics
 */
async function getTokenStats() {
  return db('token_stats')
    .select('denomination', 'minted_count', 'redeemed_count')
    .orderBy('denomination');
}

/**
 * Increments the minted count for a denomination
 * @param {number} denomination - The token denomination
 * @param {number} count - The count to increment by
 */
async function incrementMintedCount(denomination, count = 1) {
  await db('token_stats')
    .where('denomination', denomination)
    .increment('minted_count', count);
}

/**
 * Store a new key
 * @param {Object} key - The key object
 * @param {string} key.id - The key ID
 * @param {string} key.publicKey - The public key
 * @param {string} key.privateKey - The private key
 * @param {Date} key.expiresAt - The expiration date
 */
async function storeKey(key) {
  await db('keys').insert({
    id: key.id,
    public_key: key.publicKey,
    private_key: key.privateKey,
    created_at: new Date(),
    expires_at: key.expiresAt,
    active: true
  });
}

/**
 * Get a key by ID
 * @param {string} keyId - The key ID
 * @returns {Promise<Object|null>} - The key object or null if not found
 */
async function getKeyById(keyId) {
  const key = await db('keys')
    .where('id', keyId)
    .first();
  
  if (!key) {
    return null;
  }
  
  return {
    id: key.id,
    publicKey: key.public_key,
    privateKey: key.private_key,
    createdAt: key.created_at,
    expiresAt: key.expires_at,
    active: key.active
  };
}

/**
 * Get all active keys
 * @returns {Promise<Array>} - Array of active keys
 */
async function getActiveKeys() {
  const keys = await db('keys')
    .where('active', true)
    .orderBy('created_at', 'desc');
  
  return keys.map(key => ({
    id: key.id,
    publicKey: key.public_key,
    privateKey: key.private_key,
    createdAt: key.created_at,
    expiresAt: key.expires_at,
    active: key.active
  }));
}

/**
 * Deactivate a key
 * @param {string} keyId - The key ID
 */
async function deactivateKey(keyId) {
  await db('keys')
    .where('id', keyId)
    .update({
      active: false
    });
}

/**
 * Start a database transaction
 */
async function beginTransaction() {
  if (currentTransaction) {
    throw new Error('Transaction already in progress');
  }
  
  currentTransaction = await db.transaction();
  return currentTransaction;
}

/**
 * Commit the current transaction
 */
async function commitTransaction() {
  if (!currentTransaction) {
    throw new Error('No transaction in progress');
  }
  
  await currentTransaction.commit();
  currentTransaction = null;
}

/**
 * Rollback the current transaction
 */
async function rollbackTransaction() {
  if (!currentTransaction) {
    throw new Error('No transaction in progress');
  }
  
  await currentTransaction.rollback();
  currentTransaction = null;
}

/**
 * Get the current transaction
 * @returns {Object|null} - The current transaction or null if no transaction is in progress
 */
function getTransaction() {
  return currentTransaction;
}

module.exports = {
  init,
  shutdown,
  isTokenRedeemed,
  markTokenAsRedeemed,
  getTokenStats,
  incrementMintedCount,
  storeKey,
  getKeyById,
  getActiveKeys,
  deactivateKey,
  beginTransaction,
  commitTransaction,
  rollbackTransaction,
  getTransaction
};