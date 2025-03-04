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
  const hasDenominationsTable = await db.schema.hasTable('denominations');
  if (!hasDenominationsTable) {
    await db.schema.createTable('denominations', function(table) {
      table.string('id').primary();
      table.decimal('value', 15, 8).notNullable();
      table.string('currency').notNullable();
      table.text('description').nullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.boolean('is_active').defaultTo(true);
    });
    logger.info('Created denominations table');
  }
  
  const hasKeyTable = await db.schema.hasTable('mint_keys');
  if (!hasKeyTable) {
    await db.schema.createTable('mint_keys', function(table) {
      table.string('id').primary();
      table.string('denomination_id').notNullable();
      table.text('public_key').notNullable();
      table.text('private_key').notNullable();
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('expires_at').notNullable();
      table.boolean('is_active').defaultTo(true);
      table.foreign('denomination_id').references('denominations.id');
    });
    logger.info('Created mint_keys table');
  }
  
  const hasTokenTable = await db.schema.hasTable('tokens');
  if (!hasTokenTable) {
    await db.schema.createTable('tokens', function(table) {
      table.string('id').primary();
      table.string('denomination_id').notNullable(); // Link to which denomination (value) this token has
      table.string('key_id').notNullable(); // Which specific key signed this token
      table.text('blinded_token').notNullable();
      table.text('signed_token');
      table.string('status').defaultTo('pending'); // pending, active, redeemed, expired
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('updated_at').defaultTo(db.fn.now());
      table.timestamp('expires_at');
      table.timestamp('redeemed_at');
      table.index(['status']);
      table.index(['key_id']);
      table.index(['denomination_id']);
      table.foreign('key_id').references('mint_keys.id');
      table.foreign('denomination_id').references('denominations.id');
    });
    logger.info('Created tokens table');
  }
  
  const hasRedemptionTable = await db.schema.hasTable('redemptions');
  if (!hasRedemptionTable) {
    await db.schema.createTable('redemptions', function(table) {
      table.increments('id').primary();
      table.string('token_id').notNullable();
      table.string('denomination_id').notNullable(); // Which denomination was redeemed
      table.string('status').defaultTo('completed'); // completed, split
      table.string('change_token_id'); // If split redemption, ID of the change token
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.index(['token_id']);
      table.index(['denomination_id']);
      table.foreign('token_id').references('tokens.id');
      table.foreign('denomination_id').references('denominations.id');
    });
    logger.info('Created redemptions table');
  }
  
  // Create the split redemptions table
  const hasSplitRedemptionTable = await db.schema.hasTable('split_redemptions');
  if (!hasSplitRedemptionTable) {
    await db.schema.createTable('split_redemptions', function(table) {
      table.increments('id').primary();
      table.string('original_token_id').notNullable();
      table.string('original_denomination_id').notNullable();
      table.string('redeemed_denomination_id').notNullable(); // Smaller denomination that was actually redeemed
      table.string('change_token_id').notNullable(); // The change token that was created
      table.string('change_denomination_id').notNullable(); // The denomination of the change token
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.index(['original_token_id']);
      table.index(['change_token_id']);
      table.foreign('original_token_id').references('tokens.id');
      table.foreign('change_token_id').references('tokens.id');
      table.foreign('original_denomination_id').references('denominations.id');
      table.foreign('redeemed_denomination_id').references('denominations.id');
      table.foreign('change_denomination_id').references('denominations.id');
    });
    logger.info('Created split_redemptions table');
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