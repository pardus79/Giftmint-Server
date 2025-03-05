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
        pool: { 
          min: 2,
          max: 20,
          acquireTimeoutMillis: 60000,
          createTimeoutMillis: 30000,
          idleTimeoutMillis: 30000,
          reapIntervalMillis: 1000,
          createRetryIntervalMillis: 100
        }
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
        pool: { 
          min: 2,
          max: 20,
          acquireTimeoutMillis: 60000,
          createTimeoutMillis: 30000,
          idleTimeoutMillis: 30000,
          reapIntervalMillis: 1000,
          createRetryIntervalMillis: 100
        }
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
  
  // Create redeemed_tokens table that only stores redeemed tokens (for double-spend prevention)
  const hasRedeemedTokensTable = await db.schema.hasTable('redeemed_tokens');
  if (!hasRedeemedTokensTable) {
    await db.schema.createTable('redeemed_tokens', function(table) {
      table.string('id').primary(); // Token ID
      table.string('denomination_id').notNullable(); // Link to which denomination (value) this token has
      table.string('key_id').notNullable(); // Which specific key signed this token
      table.timestamp('redeemed_at').defaultTo(db.fn.now());
      table.index(['key_id']);
      table.index(['denomination_id']);
      table.foreign('key_id').references('mint_keys.id');
      table.foreign('denomination_id').references('denominations.id');
    });
    logger.info('Created redeemed_tokens table');
  }
  
  // Create token_stats table for tracking aggregate stats without storing individual tokens
  const hasStatsTable = await db.schema.hasTable('token_stats');
  if (!hasStatsTable) {
    await db.schema.createTable('token_stats', function(table) {
      table.string('denomination_id').primary();
      table.integer('minted_count').defaultTo(0);
      table.integer('redeemed_count').defaultTo(0);
      table.timestamp('last_updated').defaultTo(db.fn.now());
      table.foreign('denomination_id').references('denominations.id');
    });
    logger.info('Created token_stats table');
  }
  
  // Create batch stats table for tracking batch totals
  const hasBatchStatsTable = await db.schema.hasTable('batch_stats');
  if (!hasBatchStatsTable) {
    await db.schema.createTable('batch_stats', function(table) {
      table.string('batch_id').primary();
      table.string('currency').notNullable();
      table.decimal('total_value', 15, 8).defaultTo(0);
      table.decimal('redeemed_value', 15, 8).defaultTo(0);
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.timestamp('last_updated').defaultTo(db.fn.now());
      table.index(['currency']);
    });
    logger.info('Created batch_stats table');
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
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.index(['original_token_id']);
      table.foreign('original_denomination_id').references('denominations.id');
      table.foreign('redeemed_denomination_id').references('denominations.id');
    });
    logger.info('Created split_redemptions table');
  }
  
  // Create table for change tokens from splits (for multiple change tokens)
  const hasChangeTokensTable = await db.schema.hasTable('change_tokens');
  if (!hasChangeTokensTable) {
    await db.schema.createTable('change_tokens', function(table) {
      table.increments('id').primary();
      table.string('split_id').notNullable(); // References split_redemptions.id
      table.string('token_id').notNullable(); // The change token that was created
      table.string('denomination_id').notNullable(); // The denomination of the change token
      table.timestamp('created_at').defaultTo(db.fn.now());
      table.index(['split_id']);
      table.index(['token_id']);
      table.foreign('split_id').references('split_redemptions.id');
      table.foreign('denomination_id').references('denominations.id');
    });
    logger.info('Created change_tokens table');
  }
  
  // If the old tokens table exists, migrate data to redeemed_tokens and drop it
  const hasTokenTable = await db.schema.hasTable('tokens');
  if (hasTokenTable) {
    try {
      logger.info('Migrating redeemed tokens from old tokens table...');
      
      // Copy redeemed tokens to the new table
      const redeemedTokens = await db('tokens').where('status', 'redeemed');
      
      if (redeemedTokens.length > 0) {
        // Map old format to new format
        const migratedTokens = redeemedTokens.map(token => ({
          id: token.id,
          denomination_id: token.denomination_id,
          key_id: token.key_id,
          redeemed_at: token.redeemed_at || db.fn.now()
        }));
        
        // Insert into new table
        await db('redeemed_tokens').insert(migratedTokens);
        logger.info(`Migrated ${migratedTokens.length} redeemed tokens`);
        
        // Update token stats
        for (const token of redeemedTokens) {
          await db('token_stats')
            .where('denomination_id', token.denomination_id)
            .increment('redeemed_count', 1)
            .catch(() => {
              // Insert if not exists
              return db('token_stats').insert({
                denomination_id: token.denomination_id,
                minted_count: 0,
                redeemed_count: 1
              });
            });
        }
      } else {
        logger.info('No redeemed tokens to migrate');
      }
      
      // Count how many tokens were created for stats
      const activeTokens = await db('tokens').where('status', 'active');
      if (activeTokens.length > 0) {
        // Group by denomination
        const denominationCounts = {};
        for (const token of activeTokens) {
          if (!denominationCounts[token.denomination_id]) {
            denominationCounts[token.denomination_id] = 0;
          }
          denominationCounts[token.denomination_id]++;
        }
        
        // Update stats
        for (const [denomId, count] of Object.entries(denominationCounts)) {
          await db('token_stats')
            .where('denomination_id', denomId)
            .increment('minted_count', count)
            .catch(() => {
              // Insert if not exists
              return db('token_stats').insert({
                denomination_id: denomId,
                minted_count: count,
                redeemed_count: 0
              });
            });
        }
        
        logger.info(`Migrated stats for ${activeTokens.length} active tokens`);
      }
      
      // Create a backup table of the old data before dropping
      await db.schema.createTable('tokens_backup', function(table) {
        table.string('id').primary();
        table.string('denomination_id').notNullable();
        table.string('key_id').notNullable();
        table.text('blinded_token').notNullable();
        table.text('signed_token');
        table.string('status').defaultTo('pending');
        table.timestamp('created_at').defaultTo(db.fn.now());
        table.timestamp('updated_at').defaultTo(db.fn.now());
        table.timestamp('expires_at');
        table.timestamp('redeemed_at');
      });
      
      // Copy all data to backup
      await db.raw('INSERT INTO tokens_backup SELECT * FROM tokens');
      logger.info('Created backup of tokens table');
      
      // Drop the old table
      await db.schema.dropTable('tokens');
      logger.info('Dropped old tokens table');
    } catch (error) {
      logger.error(error, 'Failed to migrate tokens table');
      // Don't throw - continue with other tables
    }
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