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
 * Create a new token
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createToken(req, res) {
  try {
    const { amount, currency, batch_id } = req.body;
    
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
    
    // Get active key pair
    const keyPair = await keyManager.getActiveKeyPair();
    
    // Create token request
    const tokenRequest = blindSignature.createTokenRequest(
      parseFloat(amount),
      currency,
      keyPair.publicKey,
      batch_id || ''
    );
    
    // Store token in database
    const db = getDb();
    await db('tokens').insert({
      id: tokenRequest.id,
      amount: new Decimal(amount).toNumber(),
      currency: currency,
      key_id: keyPair.id,
      blinded_token: tokenRequest.blindedToken,
      status: 'pending',
      batch_id: batch_id || null,
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
    // Ensure tokenRequest has hashAlgo property if the original didn't include it
    if (!tokenRequest.hashAlgo) {
      tokenRequest.hashAlgo = 'sha256'; // Default for backwards compatibility
    }
    
    const finishedToken = blindSignature.processSignedToken(
      tokenRequest,
      signature.toString('base64'),
      keyPair.publicKey
    );
    
    // Return token
    res.status(200).json({
      success: true,
      token: JSON.stringify({
        data: finishedToken.data,
        signature: finishedToken.signature,
        key_id: keyPair.id
      })
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
    
    // Return token data
    res.status(200).json({
      success: true,
      amount: tokenData.amount,
      currency: tokenData.currency,
      value: tokenData.amount
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
    const { token, amount } = req.body;
    
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
      
      // If token isn't in the database yet, add it
      if (!storedToken) {
        await trx('tokens').insert({
          id: tokenData.id,
          amount: new Decimal(tokenData.amount).toNumber(),
          currency: tokenData.currency,
          key_id: key_id,
          blinded_token: '',
          signed_token: signature,
          status: 'pending',
          batch_id: tokenData.batchId || null,
          created_at: new Date(tokenData.createdAt),
          updated_at: new Date(),
          expires_at: new Date(Date.now() + config.crypto.tokenExpiry * 1000)
        });
      }
      
      // Calculate redemption amount
      const tokenAmount = new Decimal(tokenData.amount);
      let redemptionAmount = tokenAmount;
      let changeAmount = new Decimal(0);
      let changeToken = null;
      
      // Handle partial redemption
      if (amount && parseFloat(amount) > 0 && parseFloat(amount) < tokenAmount.toNumber()) {
        redemptionAmount = new Decimal(amount);
        changeAmount = tokenAmount.minus(redemptionAmount);
        
        // Create change token
        const activeKeyPair = await keyManager.getActiveKeyPair();
        
        const changeTokenRequest = blindSignature.createTokenRequest(
          changeAmount.toNumber(),
          tokenData.currency,
          activeKeyPair.publicKey,
          tokenData.batchId || ''
        );
        
        // Store change token in database
        await trx('tokens').insert({
          id: changeTokenRequest.id,
          amount: changeAmount.toNumber(),
          currency: tokenData.currency,
          key_id: activeKeyPair.id,
          blinded_token: changeTokenRequest.blindedToken,
          status: 'pending',
          batch_id: tokenData.batchId || null,
          created_at: new Date(),
          updated_at: new Date(),
          expires_at: new Date(Date.now() + config.crypto.tokenExpiry * 1000)
        });
        
        // Sign the blinded token
        const blindedTokenBuffer = Buffer.from(changeTokenRequest.blindedToken, 'base64');
        const changeSignature = blindSignature.signBlindedMessage(blindedTokenBuffer, activeKeyPair.privateKey);
        
        // Update token status in database
        await trx('tokens')
          .where('id', changeTokenRequest.id)
          .update({
            signed_token: changeSignature.toString('base64'),
            status: 'active',
            updated_at: new Date()
          });
        
        // Process the signed token
        // Ensure tokenRequest has hashAlgo property if the original didn't include it
        if (!changeTokenRequest.hashAlgo) {
          changeTokenRequest.hashAlgo = 'sha256'; // Default for backwards compatibility
        }
        
        const finishedChangeToken = blindSignature.processSignedToken(
          changeTokenRequest,
          changeSignature.toString('base64'),
          activeKeyPair.publicKey
        );
        
        // Format change token
        changeToken = JSON.stringify({
          data: finishedChangeToken.data,
          signature: finishedChangeToken.signature,
          key_id: activeKeyPair.id
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
        amount: redemptionAmount.toNumber(),
        currency: tokenData.currency,
        status: changeToken ? 'partial' : 'completed',
        remaining_amount: changeAmount.toNumber(),
        change_token_id: changeToken ? JSON.parse(JSON.parse(changeToken).data).id : null,
        created_at: new Date()
      });
      
      // Commit the transaction
      await trx.commit();
      
      // Return redemption data
      const response = {
        success: true,
        amount: redemptionAmount.toString(),
        currency: tokenData.currency
      };
      
      if (changeToken) {
        response.change_token = changeToken;
        response.change_amount = changeAmount.toString();
      }
      
      res.status(200).json(response);
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

module.exports = {
  createToken,
  verifyToken,
  redeemToken,
  remintToken,
  bulkCreateTokens,
  getOutstandingValue
};