/**
 * Token Controller for Giftmint mint
 */

const { v4: uuidv4 } = require('uuid');
const Decimal = require('decimal.js');
const pino = require('pino');

const config = require('../config/config');
const { getDb } = require('../db/database');
const keyManager = require('../crypto/keyManager');
const blindSignature = require('../crypto/blindSignature');

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

/**
 * List available denominations
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function listDenominations(req, res) {
  try {
    const db = getDb();
    
    // Get all active denominations
    const denominations = await db('denominations')
      .where('is_active', true)
      .orderBy('value', 'asc');
    
    res.status(200).json({
      success: true,
      denominations: denominations
    });
  } catch (error) {
    logger.error({ error }, 'Failed to list denominations');
    res.status(500).json({
      success: false,
      message: 'Failed to list denominations',
      error: error.message
    });
  }
}

/**
 * Create a new token
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createToken(req, res) {
  try {
    const { denomination_id, denomination_value } = req.body;
    
    let keyPair;
    let denomination;
    
    // Get key pair based on either denomination_id or denomination_value
    if (denomination_id) {
      // Get key pair for specific denomination ID
      keyPair = await keyManager.getKeyPairForDenomination(denomination_id);
      denomination = await keyManager.getDenomination(keyPair.denominationId);
    } else if (denomination_value) {
      // Try to find denomination by value
      keyPair = await keyManager.getKeyPairForDenomination(denomination_value);
      denomination = await keyManager.getDenomination(keyPair.denominationId);
    } else {
      // Get default (smallest) denomination key pair
      keyPair = await keyManager.getActiveKeyPair();
      denomination = await keyManager.getDenomination(keyPair.denominationId);
    }
    
    // Create token request (properly blind, with no metadata)
    const tokenRequest = blindSignature.createTokenRequest(
      keyPair.denominationId,
      keyPair.publicKey
    );
    
    // Store token in database (no amount/currency in token itself, just the denomination link)
    const db = getDb();
    await db('tokens').insert({
      id: tokenRequest.id,
      denomination_id: keyPair.denominationId,
      key_id: keyPair.id,
      blinded_token: tokenRequest.blindedToken,
      status: 'pending',
      created_at: new Date(),
      updated_at: new Date(),
      expires_at: new Date(Date.now() + config.crypto.tokenExpiry * 1000)
    });
    
    // Sign the blinded token
    const blindedTokenBuffer = Buffer.from(tokenRequest.blindedToken, 'base64');
    const signature = blindSignature.signBlindedMessage(blindedTokenBuffer, keyPair.privateKey);
    
    // Update token status in database
    await db('tokens')
      .where('id', tokenRequest.id)
      .update({
        signed_token: signature.toString('base64'),
        status: 'active',
        updated_at: new Date()
      });
    
    // Process the signed token
    if (!tokenRequest.hashAlgo) {
      tokenRequest.hashAlgo = 'sha256'; // Default for backwards compatibility
    }
    
    const finishedToken = blindSignature.processSignedToken(
      tokenRequest,
      signature.toString('base64'),
      keyPair.publicKey
    );
    
    // Return token (in true Chaumian fashion, just the blind signature with no metadata)
    res.status(200).json({
      success: true,
      token: JSON.stringify({
        data: finishedToken.data,
        signature: finishedToken.signature,
        key_id: keyPair.id
      }),
      // Send denomination info separately, not embedded in the token
      denomination: {
        id: denomination.id,
        value: denomination.value,
        currency: denomination.currency,
        description: denomination.description
      }
    });
  } catch (error) {
    logger.error({ error }, 'Failed to create token');
    res.status(500).json({
      success: false,
      message: 'Failed to create token',
      error: error.message
    });
  }
}

/**
 * Verify a token
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function verifyToken(req, res) {
  try {
    const { token } = req.body;
    
    // Validate input
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }
    
    // Parse token
    let parsedToken;
    try {
      parsedToken = JSON.parse(token);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token format'
      });
    }
    
    // Extract token components
    const { data, signature, key_id } = parsedToken;
    
    if (!data || !signature || !key_id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token structure'
      });
    }
    
    // Parse token data
    let tokenData;
    try {
      tokenData = JSON.parse(data);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token data'
      });
    }
    
    // Get key pair by ID
    const keyPair = await keyManager.getKeyPairById(key_id);
    
    // Get denomination info
    const denomination = await keyManager.getDenomination(keyPair.denominationId);
    
    // Recreate the token hash
    const tokenHash = require('crypto')
      .createHash('sha256')
      .update(Buffer.from(data, 'utf8'))
      .digest();
    
    // Verify signature
    const isValid = blindSignature.verifySignature(
      tokenHash,
      Buffer.from(signature, 'base64'),
      keyPair.publicKey
    );
    
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token signature'
      });
    }
    
    // Check if token has been redeemed
    const db = getDb();
    const storedToken = await db('tokens')
      .where('id', tokenData.id)
      .first();
    
    if (storedToken && storedToken.status === 'redeemed') {
      return res.status(400).json({
        success: false,
        message: 'Token has already been redeemed'
      });
    }
    
    // Return token verification with denomination details
    // (Denomination info is returned separately, not embedded in the token)
    res.status(200).json({
      success: true,
      valid: true,
      token_id: tokenData.id,
      denomination: {
        id: denomination.id,
        value: denomination.value,
        currency: denomination.currency,
        description: denomination.description
      }
    });
  } catch (error) {
    logger.error({ error }, 'Failed to verify token');
    res.status(500).json({
      success: false,
      message: 'Failed to verify token',
      error: error.message
    });
  }
}

/**
 * Redeem a token
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function redeemToken(req, res) {
  try {
    const { token } = req.body;
    
    // Validate input
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }
    
    // Parse token
    let parsedToken;
    try {
      parsedToken = JSON.parse(token);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token format'
      });
    }
    
    // Extract token components
    const { data, signature, key_id } = parsedToken;
    
    if (!data || !signature || !key_id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token structure'
      });
    }
    
    // Parse token data
    let tokenData;
    try {
      tokenData = JSON.parse(data);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token data'
      });
    }
    
    // Get key pair by ID
    const keyPair = await keyManager.getKeyPairById(key_id);
    
    // Get denomination info
    const denomination = await keyManager.getDenomination(keyPair.denominationId);
    
    // Recreate the token hash
    const tokenHash = require('crypto')
      .createHash('sha256')
      .update(Buffer.from(data, 'utf8'))
      .digest();
    
    // Verify signature
    const isValid = blindSignature.verifySignature(
      tokenHash,
      Buffer.from(signature, 'base64'),
      keyPair.publicKey
    );
    
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token signature'
      });
    }
    
    // Start a database transaction
    const db = getDb();
    const trx = await db.transaction();
    
    try {
      // Check if token has been redeemed
      const storedToken = await trx('tokens')
        .where('id', tokenData.id)
        .first();
      
      if (storedToken && storedToken.status === 'redeemed') {
        await trx.rollback();
        return res.status(400).json({
          success: false,
          message: 'Token has already been redeemed'
        });
      }
      
      // If token isn't in the database yet, add it
      if (!storedToken) {
        await trx('tokens').insert({
          id: tokenData.id,
          denomination_id: keyPair.denominationId,
          key_id: key_id,
          blinded_token: '',
          signed_token: signature,
          status: 'pending',
          created_at: new Date(),
          updated_at: new Date(),
          expires_at: new Date(Date.now() + config.crypto.tokenExpiry * 1000)
        });
      }
      
      // Mark token as redeemed
      await trx('tokens')
        .where('id', tokenData.id)
        .update({
          status: 'redeemed',
          redeemed_at: new Date(),
          updated_at: new Date()
        });
      
      // Record the redemption
      await trx('redemptions').insert({
        token_id: tokenData.id,
        denomination_id: keyPair.denominationId,
        status: 'completed',
        created_at: new Date()
      });
      
      // Commit the transaction
      await trx.commit();
      
      // Return redemption data with denomination info
      res.status(200).json({
        success: true,
        token_id: tokenData.id,
        denomination: {
          id: denomination.id,
          value: denomination.value,
          currency: denomination.currency,
          description: denomination.description
        },
        status: 'redeemed'
      });
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  } catch (error) {
    logger.error({ error }, 'Failed to redeem token');
    res.status(500).json({
      success: false,
      message: 'Failed to redeem token',
      error: error.message
    });
  }
}

/**
 * Remint a token
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function remintToken(req, res) {
  try {
    const { token } = req.body;
    
    // Validate input
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }
    
    // Parse token
    let parsedToken;
    try {
      parsedToken = JSON.parse(token);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token format'
      });
    }
    
    // Extract token components
    const { data, signature, key_id } = parsedToken;
    
    if (!data || !signature || !key_id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token structure'
      });
    }
    
    // Parse token data
    let tokenData;
    try {
      tokenData = JSON.parse(data);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token data'
      });
    }
    
    // Get key pair by ID
    const keyPair = await keyManager.getKeyPairById(key_id);
    
    // Recreate the token hash
    const tokenHash = require('crypto')
      .createHash('sha256')
      .update(Buffer.from(data, 'utf8'))
      .digest();
    
    // Verify signature
    const isValid = blindSignature.verifySignature(
      tokenHash,
      Buffer.from(signature, 'base64'),
      keyPair.publicKey
    );
    
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token signature'
      });
    }
    
    // Start a database transaction
    const db = getDb();
    const trx = await db.transaction();
    
    try {
      // Check if token has been redeemed
      const storedToken = await trx('tokens')
        .where('id', tokenData.id)
        .first();
      
      if (storedToken && storedToken.status === 'redeemed') {
        await trx.rollback();
        return res.status(400).json({
          success: false,
          message: 'Token has already been redeemed'
        });
      }
      
      // Create a new token with the same amount
      const activeKeyPair = await keyManager.getActiveKeyPair();
      
      const newTokenRequest = blindSignature.createTokenRequest(
        new Decimal(tokenData.amount).toNumber(),
        tokenData.currency,
        activeKeyPair.publicKey,
        tokenData.batchId || ''
      );
      
      // Store new token in database
      await trx('tokens').insert({
        id: newTokenRequest.id,
        amount: new Decimal(tokenData.amount).toNumber(),
        currency: tokenData.currency,
        key_id: activeKeyPair.id,
        blinded_token: newTokenRequest.blindedToken,
        status: 'pending',
        batch_id: tokenData.batchId || null,
        created_at: new Date(),
        updated_at: new Date(),
        expires_at: new Date(Date.now() + config.crypto.tokenExpiry * 1000)
      });
      
      // Sign the blinded token
      const blindedTokenBuffer = Buffer.from(newTokenRequest.blindedToken, 'base64');
      const newSignature = blindSignature.signBlindedMessage(blindedTokenBuffer, activeKeyPair.privateKey);
      
      // Update token status in database
      await trx('tokens')
        .where('id', newTokenRequest.id)
        .update({
          signed_token: newSignature.toString('base64'),
          status: 'active',
          updated_at: new Date()
        });
      
      // Process the signed token
      // Ensure tokenRequest has hashAlgo property if the original didn't include it
      if (!newTokenRequest.hashAlgo) {
        newTokenRequest.hashAlgo = 'sha256'; // Default for backwards compatibility
      }
      
      const finishedNewToken = blindSignature.processSignedToken(
        newTokenRequest,
        newSignature.toString('base64'),
        activeKeyPair.publicKey
      );
      
      // Mark old token as redeemed
      if (storedToken) {
        await trx('tokens')
          .where('id', tokenData.id)
          .update({
            status: 'redeemed',
            redeemed_at: new Date(),
            updated_at: new Date()
          });
      } else {
        // If old token wasn't in the database, add it as redeemed
        await trx('tokens').insert({
          id: tokenData.id,
          amount: new Decimal(tokenData.amount).toNumber(),
          currency: tokenData.currency,
          key_id: key_id,
          blinded_token: '',
          signed_token: signature,
          status: 'redeemed',
          batch_id: tokenData.batchId || null,
          created_at: new Date(tokenData.createdAt),
          updated_at: new Date(),
          redeemed_at: new Date(),
          expires_at: new Date(Date.now() + config.crypto.tokenExpiry * 1000)
        });
      }
      
      // Record the remint as a redemption
      await trx('redemptions').insert({
        token_id: tokenData.id,
        amount: new Decimal(tokenData.amount).toNumber(),
        currency: tokenData.currency,
        status: 'completed',
        remaining_amount: 0,
        change_token_id: newTokenRequest.id,
        created_at: new Date()
      });
      
      // Commit the transaction
      await trx.commit();
      
      // Format new token
      const newToken = JSON.stringify({
        data: finishedNewToken.data,
        signature: finishedNewToken.signature,
        key_id: activeKeyPair.id
      });
      
      // Return new token
      res.status(200).json({
        success: true,
        new_token: newToken,
        amount: tokenData.amount,
        currency: tokenData.currency
      });
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  } catch (error) {
    logger.error({ error }, 'Failed to remint token');
    res.status(500).json({
      success: false,
      message: 'Failed to remint token',
      error: error.message
    });
  }
}

/**
 * Bulk create tokens
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function bulkCreateTokens(req, res) {
  try {
    const { amount, currency, quantity, batch_id } = req.body;
    
    // Validate inputs
    if (!amount || isNaN(amount) || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Invalid amount'
      });
    }
    
    if (!currency) {
      return res.status(400).json({
        success: false,
        message: 'Currency is required'
      });
    }
    
    if (!quantity || isNaN(quantity) || quantity <= 0 || quantity > 100) {
      return res.status(400).json({
        success: false,
        message: 'Invalid quantity (must be between 1 and 100)'
      });
    }
    
    // Generate batch ID if not provided
    const batchId = batch_id || `bulk_${Date.now()}_${Math.floor(Math.random() * 10000)}`;
    
    // Get active key pair
    const keyPair = await keyManager.getActiveKeyPair();
    
    // Create tokens
    const tokens = [];
    const db = getDb();
    
    // Use a transaction
    const trx = await db.transaction();
    
    try {
      for (let i = 0; i < quantity; i++) {
        // Create token request
        const tokenRequest = blindSignature.createTokenRequest(
          parseFloat(amount),
          currency,
          keyPair.publicKey,
          batchId
        );
        
        // Store token in database
        await trx('tokens').insert({
          id: tokenRequest.id,
          amount: new Decimal(amount).toNumber(),
          currency: currency,
          key_id: keyPair.id,
          blinded_token: tokenRequest.blindedToken,
          status: 'pending',
          batch_id: batchId,
          created_at: new Date(),
          updated_at: new Date(),
          expires_at: new Date(Date.now() + config.crypto.tokenExpiry * 1000)
        });
        
        // Sign the blinded token
        const blindedTokenBuffer = Buffer.from(tokenRequest.blindedToken, 'base64');
        const signature = blindSignature.signBlindedMessage(blindedTokenBuffer, keyPair.privateKey);
        
        // Update token status in database
        await trx('tokens')
          .where('id', tokenRequest.id)
          .update({
            signed_token: signature.toString('base64'),
            status: 'active',
            updated_at: new Date()
          });
        
        // Process the signed token
        // Ensure tokenRequest has hashAlgo property if the original didn't include it
        if (!tokenRequest.hashAlgo) {
          tokenRequest.hashAlgo = 'sha256'; // Default for backwards compatibility
        }
        
        const finishedToken = blindSignature.processSignedToken(
          tokenRequest,
          signature.toString('base64'),
          keyPair.publicKey
        );
        
        // Add to tokens array
        tokens.push(JSON.stringify({
          data: finishedToken.data,
          signature: finishedToken.signature,
          key_id: keyPair.id
        }));
      }
      
      // Commit the transaction
      await trx.commit();
      
      // Return tokens
      res.status(200).json({
        success: true,
        tokens: tokens,
        batch_id: batchId,
        amount: amount,
        currency: currency,
        quantity: quantity
      });
    } catch (error) {
      // Rollback the transaction
      await trx.rollback();
      throw error;
    }
  } catch (error) {
    logger.error({ error }, 'Failed to bulk create tokens');
    res.status(500).json({
      success: false,
      message: 'Failed to bulk create tokens',
      error: error.message
    });
  }
}

/**
 * Get total outstanding value
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getOutstandingValue(req, res) {
  try {
    const { batch_id, currency } = req.body;
    
    // Get the total value of all active tokens
    const db = getDb();
    let query = db('tokens')
      .where('status', 'active');
    
    // Filter by batch ID if provided
    if (batch_id) {
      query = query.where('batch_id', batch_id);
    }
    
    // Filter by currency if provided
    if (currency) {
      query = query.where('currency', currency);
    }
    
    // Sum the amounts
    const result = await query
      .sum('amount as total')
      .first();
    
    const total = result.total || 0;
    
    // Return the total value
    res.status(200).json({
      success: true,
      value: total,
      batch_id: batch_id || null,
      currency: currency || null
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get outstanding value');
    res.status(500).json({
      success: false,
      message: 'Failed to get outstanding value',
      error: error.message
    });
  }
}

/**
 * Split a token
 * 
 * This function takes a token of one denomination and splits it into multiple tokens of smaller denominations.
 * It's the Chaumian e-cash version of making change.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function splitToken(req, res) {
  try {
    const { token, redeem_denomination_id, redeem_amount } = req.body;
    
    // Validate inputs
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }
    
    if (!redeem_denomination_id && !redeem_amount) {
      return res.status(400).json({
        success: false,
        message: 'Either redeem_denomination_id or redeem_amount is required'
      });
    }
    
    // Parse token
    let parsedToken;
    try {
      parsedToken = JSON.parse(token);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token format'
      });
    }
    
    // Extract token components
    const { data, signature, key_id } = parsedToken;
    
    if (!data || !signature || !key_id) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token structure'
      });
    }
    
    // Parse token data
    let tokenData;
    try {
      tokenData = JSON.parse(data);
    } catch (e) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token data'
      });
    }
    
    // Get key pair by ID
    const keyPair = await keyManager.getKeyPairById(key_id);
    
    // Get denomination info
    const originalDenomination = await keyManager.getDenomination(keyPair.denominationId);
    
    // Verify token
    const tokenHash = require('crypto')
      .createHash('sha256')
      .update(Buffer.from(data, 'utf8'))
      .digest();
    
    const isValid = blindSignature.verifySignature(
      tokenHash,
      Buffer.from(signature, 'base64'),
      keyPair.publicKey
    );
    
    if (!isValid) {
      return res.status(400).json({
        success: false,
        message: 'Invalid token signature'
      });
    }
    
    // Get redeem denomination info (if provided)
    let redeemDenomination = null;
    let redeemValue = 0;
    
    if (redeem_denomination_id) {
      redeemDenomination = await keyManager.getDenomination(redeem_denomination_id);
      redeemValue = redeemDenomination.value;
    } else if (redeem_amount) {
      redeemValue = parseInt(redeem_amount, 10);
      
      // Find the closest denomination less than or equal to the redeem amount
      const db = getDb();
      redeemDenomination = await db('denominations')
        .where('value', '<=', redeemValue)
        .where('currency', originalDenomination.currency)
        .where('is_active', true)
        .orderBy('value', 'desc')
        .first();
        
      if (!redeemDenomination) {
        return res.status(400).json({
          success: false,
          message: `No denomination available for redeem amount ${redeemValue}`
        });
      }
    }
    
    // Check redeemed value is smaller than original
    if (redeemValue >= originalDenomination.value) {
      return res.status(400).json({
        success: false,
        message: 'Redeem amount must be smaller than original token value'
      });
    }
    
    // Calculate change amount
    const changeAmount = originalDenomination.value - redeemValue;
    
    // Get all active denominations
    const db = getDb();
    const allDenominations = await db('denominations')
      .where('currency', originalDenomination.currency)
      .where('is_active', true)
      .orderBy('value', 'desc');
    
    // Import the change maker utility
    const changeMaker = require('../utils/changeMaker');
    
    // Calculate denominations for change
    let changeDenominations;
    try {
      // For power of 2 denominations, use binary change maker for optimal results
      changeDenominations = changeMaker.makeChangeBinary(changeAmount, allDenominations);
    } catch (error) {
      return res.status(400).json({
        success: false,
        message: `Cannot make exact change for ${changeAmount} ${originalDenomination.currency}`
      });
    }
    
    // Start a transaction
    const trx = await db.transaction();
    
    try {
      // Check if token has been redeemed
      const storedToken = await trx('tokens')
        .where('id', tokenData.id)
        .first();
      
      if (storedToken && storedToken.status === 'redeemed') {
        await trx.rollback();
        return res.status(400).json({
          success: false,
          message: 'Token has already been redeemed'
        });
      }
      
      // If token isn't in the database yet, add it
      if (!storedToken) {
        await trx('tokens').insert({
          id: tokenData.id,
          denomination_id: keyPair.denominationId,
          key_id: key_id,
          blinded_token: '',
          signed_token: signature,
          status: 'pending',
          created_at: new Date(),
          updated_at: new Date(),
          expires_at: new Date(Date.now() + config.crypto.tokenExpiry * 1000)
        });
      }
      
      // Mark original token as redeemed
      await trx('tokens')
        .where('id', tokenData.id)
        .update({
          status: 'redeemed',
          redeemed_at: new Date(),
          updated_at: new Date()
        });
      
      // Create split redemption record
      const [splitId] = await trx('split_redemptions')
        .insert({
          original_token_id: tokenData.id,
          original_denomination_id: keyPair.denominationId,
          redeemed_denomination_id: redeemDenomination.id,
          created_at: new Date()
        })
        .returning('id');
      
      // Create change tokens
      const changeTokens = [];
      const changeInfo = [];
      
      for (const changeDenom of changeDenominations) {
        // Get key for this denomination
        const changeKeyPair = await keyManager.getKeyPairForDenomination(changeDenom.id);
        
        // Create token request
        const changeTokenRequest = blindSignature.createTokenRequest(
          changeDenom.id,
          changeKeyPair.publicKey
        );
        
        // Store change token in database
        await trx('tokens').insert({
          id: changeTokenRequest.id,
          denomination_id: changeDenom.id,
          key_id: changeKeyPair.id,
          blinded_token: changeTokenRequest.blindedToken,
          status: 'pending',
          created_at: new Date(),
          updated_at: new Date(),
          expires_at: new Date(Date.now() + config.crypto.tokenExpiry * 1000)
        });
        
        // Sign the blinded token
        const blindedTokenBuffer = Buffer.from(changeTokenRequest.blindedToken, 'base64');
        const changeSignature = blindSignature.signBlindedMessage(blindedTokenBuffer, changeKeyPair.privateKey);
        
        // Update token status in database
        await trx('tokens')
          .where('id', changeTokenRequest.id)
          .update({
            signed_token: changeSignature.toString('base64'),
            status: 'active',
            updated_at: new Date()
          });
        
        // Process the signed token
        if (!changeTokenRequest.hashAlgo) {
          changeTokenRequest.hashAlgo = 'sha256';
        }
        
        const finishedChangeToken = blindSignature.processSignedToken(
          changeTokenRequest,
          changeSignature.toString('base64'),
          changeKeyPair.publicKey
        );
        
        // Track the change token in the change_tokens table
        await trx('change_tokens').insert({
          split_id: splitId,
          token_id: changeTokenRequest.id,
          denomination_id: changeDenom.id,
          created_at: new Date()
        });
        
        // Format change token for response
        const formattedToken = JSON.stringify({
          data: finishedChangeToken.data,
          signature: finishedChangeToken.signature,
          key_id: changeKeyPair.id
        });
        
        changeTokens.push(formattedToken);
        changeInfo.push({
          denomination_id: changeDenom.id,
          value: changeDenom.value,
          currency: changeDenom.currency,
          description: changeDenom.description
        });
      }
      
      // Create redemption record
      await trx('redemptions').insert({
        token_id: tokenData.id,
        denomination_id: keyPair.denominationId,
        status: 'split',
        change_token_id: null, // We're using the change_tokens table now
        created_at: new Date()
      });
      
      // Commit the transaction
      await trx.commit();
      
      // Return split result
      res.status(200).json({
        success: true,
        original_token_id: tokenData.id,
        original_value: originalDenomination.value,
        redeemed: {
          denomination_id: redeemDenomination.id,
          value: redeemDenomination.value,
          currency: redeemDenomination.currency,
          description: redeemDenomination.description
        },
        change_tokens: changeTokens,
        change_info: changeInfo,
        total_change_value: changeAmount
      });
    } catch (error) {
      await trx.rollback();
      throw error;
    }
  } catch (error) {
    logger.error({ error }, 'Failed to split token');
    res.status(500).json({
      success: false,
      message: 'Failed to split token',
      error: error.message
    });
  }
}

/**
 * Get outstanding value by denomination
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getOutstandingByDenomination(req, res) {
  try {
    const { currency } = req.body;
    
    // Get active denominations
    const db = getDb();
    const denominations = await db('denominations')
      .where('is_active', true)
      .where(builder => {
        if (currency) {
          builder.where('currency', currency);
        }
      })
      .orderBy('value', 'asc');
    
    // Get count of active tokens for each denomination
    const results = [];
    
    for (const denom of denominations) {
      const count = await db('tokens')
        .where('denomination_id', denom.id)
        .where('status', 'active')
        .count('id as count')
        .first();
      
      results.push({
        denomination_id: denom.id,
        value: denom.value,
        currency: denom.currency,
        description: denom.description,
        count: parseInt(count.count || 0),
        total_value: denom.value * parseInt(count.count || 0)
      });
    }
    
    // Calculate total
    const total = results.reduce((sum, item) => sum + item.total_value, 0);
    
    // Return results
    res.status(200).json({
      success: true,
      denominations: results,
      total: total,
      currency: currency || 'all'
    });
  } catch (error) {
    logger.error({ error }, 'Failed to get outstanding value by denomination');
    res.status(500).json({
      success: false,
      message: 'Failed to get outstanding value by denomination',
      error: error.message
    });
  }
}

module.exports = {
  listDenominations,
  createToken,
  verifyToken,
  redeemToken,
  remintToken,
  splitToken,
  bulkCreateTokens,
  getOutstandingValue,
  getOutstandingByDenomination
};