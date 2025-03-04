/**
 * Database module for Giftmint mint
 */

const knex = require('knex');
const path = require('path');
const fs = require('fs');
const config = require('../config/config');
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

// Database connection
let db = null;

/**
 * Initialize database connection
 */
async function init() {
  try {
    // Configure knex based on database type
    const dbConfig = getDbConfig();
    
    // Create database directory if using SQLite
    if (config.database.type === 'sqlite') {
      const dbDir = path.dirname(config.database.filename);
      if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
      }
    }
    
    // Create database connection
    db = knex(dbConfig);
    
    // Test connection
    await db.raw('SELECT 1');
    logger.info('Database connection established');
    
    // Run migrations
    await createTables();
    logger.info('Database migrations completed');
    
    return db;
  } catch (error) {
    logger.error(error, 'Failed to initialize database');
    throw error;
  }
}

/**
 * Get database configuration based on database type
 * 
 * @returns {Object} Database configuration
 */
function getDbConfig() {
  switch (config.database.type) {
    case 'sqlite':
      return {
        client: 'sqlite3',
        connection: {
          filename: path.resolve(config.database.filename)
        },
        useNullAsDefault: true
      };
    case 'mysql':
      return {
        client: 'mysql',
        connection: {
          host: config.database.host,
          port: config.database.port,
          user: config.database.username,
          password: config.database.password,
          database: config.database.database
        },
        pool: { min: 0, max: 7 }
      };
    case 'postgres':
      return {
        client: 'pg',
        connection: {
          host: config.database.host,
          port: config.database.port,
          user: config.database.username,
          password: config.database.password,
          database: config.database.database
        },
        pool: { min: 0, max: 7 }
      };
    default:
      throw new Error(`Unsupported database type: ${config.database.type}`);
  }
}

/**
 * Create database tables
 */
async function createTables() {
  const hasKeyTable = await db.schema.hasTable('mint_keys');
  if (!hasKeyTable) {
    await db.schema.createTable('mint_keys', function(table) {
      table.string('id').primary();
      table.text('public_key').notNullable();
      table.text('private_key').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('expires_at').notNullable();
      table.boolean('is_active').defaultTo(true);
    });
    logger.info('Created mint_keys table');
  }
  
  const hasTokenTable = await db.schema.hasTable('tokens');
  if (!hasTokenTable) {
    await db.schema.createTable('tokens', function(table) {
      table.string('id').primary();
      table.decimal('amount', 15, 8).notNullable();
      table.string('currency').notNullable();
      table.string('key_id').notNullable();
      table.text('blinded_token').notNullable();
      table.text('signed_token');
      table.string('status').defaultTo('pending'); // pending, active, redeemed, expired
      table.string('batch_id');
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
      table.timestamp('expires_at');
      table.timestamp('redeemed_at');
      table.index(['status', 'batch_id']);
      table.index(['key_id']);
    });
    logger.info('Created tokens table');
  }
  
  const hasRedemptionTable = await db.schema.hasTable('redemptions');
  if (!hasRedemptionTable) {
    await db.schema.createTable('redemptions', function(table) {
      table.increments('id').primary();
      table.string('token_id').notNullable();
      table.decimal('amount', 15, 8).notNullable();
      table.string('currency').notNullable();
      table.string('status').defaultTo('completed'); // completed, partial
      table.decimal('remaining_amount', 15, 8).defaultTo(0);
      table.string('change_token_id');
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.index(['token_id']);
    });
    logger.info('Created redemptions table');
  }
}

/**
 * Close database connection
 */
async function close() {
  if (db) {
    await db.destroy();
    logger.info('Database connection closed');
  }
}

/**
 * Get database connection
 * 
 * @returns {Object} Database connection
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

module.exports = {
  init,
  close,
  getDb
};