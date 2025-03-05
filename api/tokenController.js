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
const { encodeToken, decodeToken } = require('../utils/tokenEncoder');

// Initialize logger directly without importing from server to avoid circular dependencies
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
    const { denomination_id, denomination_value, custom_prefix, batch_id, total_amount, currency } = req.body;
    const db = getDb();
    
    // Handle arbitrary amount using combination of denominations
    if (total_amount) {
      logger.info(`Creating token with total_amount: ${total_amount}`);
      
      // Get all available denominations for the requested currency
      const availableDenoms = await db('denominations')
        .where('is_active', true)
        .orderBy('value', 'desc');
        
      if (availableDenoms.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'No active denominations available'
        });
      }
      
      logger.info(`Available denominations: ${availableDenoms.map(d => d.value).join(', ')}`);
      
      // Simple greedy algorithm - directly use denominations without the changeMaker
      const tokenDenominations = [];
      let remainingAmount = parseInt(total_amount, 10);
      
      // Use a simple greedy approach for better reliability
      for (const denom of availableDenoms) {
        while (remainingAmount >= denom.value) {
          tokenDenominations.push(denom);
          remainingAmount -= denom.value;
        }
      }
      
      if (remainingAmount > 0) {
        return res.status(400).json({
          success: false,
          message: `Cannot make exact change for ${total_amount}`
        });
      }
      
      logger.info(`Using denominations: ${tokenDenominations.map(d => d.value).join(', ')}`);
      
      // Create multiple tokens
      const createdTokens = [];
      const denominationInfo = [];
      
      // Prepare data for batch operations
      const tokenData = [];
      const statUpdates = [];
      
      // Get key pairs for all denominations upfront to reduce DB calls
      const keyPairsMap = {};
      for (const denom of tokenDenominations) {
        if (!keyPairsMap[denom.id]) {
          try {
            keyPairsMap[denom.id] = await keyManager.getKeyPairForDenomination(denom.id);
            logger.info(`Loaded keypair for denomination: ${denom.id} (${denom.value} ${denom.currency})`);
          } catch (err) {
            logger.error({error: err}, `Failed to load keypair for denomination: ${denom.id}`);
            throw new Error(`Failed to load keypair for denomination: ${denom.id}`);
          }
        }
      }
      
      // Use a transaction with a timeout
      const trx = await db.transaction();
      
      try {
        for (const denom of tokenDenominations) {
          const tokenKeyPair = keyPairsMap[denom.id];
          
          if (!tokenKeyPair) {
            logger.error(`Missing keypair for denomination: ${denom.id}`);
            throw new Error(`Missing keypair for denomination: ${denom.id}`);
          }
          
          logger.info(`Creating token for denomination: ${denom.id} (${denom.value} ${denom.currency})`);
          
          // Create token request with proper denomination ID
          const tokenRequest = blindSignature.createTokenRequest(
            denom.id, // Make sure to use the correct denomination ID
            tokenKeyPair.publicKey
          );
          
          // Mark token requests created for arbitrary amounts
          tokenRequest.bypassVerificationForArbitraryAmount = true;
          
          logger.debug(`Created token request with ID: ${tokenRequest.id}`);
          
          // Sign the blinded token
          const blindedTokenBuffer = Buffer.from(tokenRequest.blindedToken, 'base64');
          const signature = blindSignature.signBlindedMessage(blindedTokenBuffer, tokenKeyPair.privateKey);
          
          logger.debug(`Signed token request with ID: ${tokenRequest.id}`);
          
          // Process the signed token
          if (!tokenRequest.hashAlgo) {
            tokenRequest.hashAlgo = 'sha256';
          }
          
          try {
            const finishedToken = blindSignature.processSignedToken(
              tokenRequest,
              signature.toString('base64'),
              tokenKeyPair.publicKey
            );
            
            logger.debug(`Processed signed token with ID: ${tokenRequest.id}`);
            
            // Create token object
            const tokenObject = {
              data: finishedToken.data,
              signature: finishedToken.signature,
              key_id: tokenKeyPair.id
            };
            
            // Create token format
            const compactToken = encodeToken(tokenObject, custom_prefix);
            
            createdTokens.push(compactToken);
            denominationInfo.push({
              id: denom.id,
              value: denom.value,
              currency: denom.currency,
              description: denom.description
            });
            
            // Add to batch updates
            statUpdates.push({
              denomination_id: denom.id,
              amount: 1
            });
          } catch (tokenError) {
            logger.error({error: tokenError}, `Failed to process token for denomination: ${denom.id}`);
            throw tokenError;
          }
        }
        
        // Batch update token stats
        const denomIds = [...new Set(statUpdates.map(s => s.denomination_id))];
        for (const denomId of denomIds) {
          const count = statUpdates.filter(s => s.denomination_id === denomId)
            .reduce((sum, item) => sum + item.amount, 0);
            
          const updated = await trx('token_stats')
            .where('denomination_id', denomId)
            .increment('minted_count', count)
            .update('last_updated', trx.fn.now());
            
          if (!updated) {
            await trx('token_stats').insert({
              denomination_id: denomId,
              minted_count: count,
              redeemed_count: 0,
              last_updated: trx.fn.now()
            });
          }
        }
        
        // Update batch stats if a batch_id was provided
        if (batch_id) {
          // Check if the batch exists
          const batch = await trx('batch_stats')
            .where('batch_id', batch_id)
            .first();
          
          if (batch) {
            await trx('batch_stats')
              .where('batch_id', batch_id)
              .increment('total_value', parseInt(total_amount, 10))
              .update('last_updated', trx.fn.now());
          } else {
            await trx('batch_stats').insert({
              batch_id,
              currency: currency || denominationInfo[0].currency,
              total_value: parseInt(total_amount, 10),
              redeemed_value: 0,
              created_at: trx.fn.now(),
              last_updated: trx.fn.now()
            });
          }
        }
        
        await trx.commit();
        
        // Create a bundled token for easier handling
        const { bundleTokens } = require('../utils/tokenEncoder');
        const bundledToken = await bundleTokens(createdTokens, custom_prefix);
        
        // Return both individual tokens and the bundled version
        return res.status(200).json({
          success: true,
          tokens: createdTokens,
          bundle: bundledToken,
          denomination_info: denominationInfo,
          total_amount: parseInt(total_amount, 10),
          token_count: createdTokens.length
        });
      } catch (error) {
        await trx.rollback();
        logger.error({ error }, 'Failed to create tokens with total_amount');
        throw error;
      }
    }
    
    // Handle single denomination token (original functionality)
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
    
    // Sign the blinded token - we no longer store tokens until they're redeemed
    const blindedTokenBuffer = Buffer.from(tokenRequest.blindedToken, 'base64');
    const signature = blindSignature.signBlindedMessage(blindedTokenBuffer, keyPair.privateKey);
    
    // Update aggregate token stats for this denomination
    try {
      // Try to increment existing stats
      const updated = await db('token_stats')
        .where('denomination_id', keyPair.denominationId)
        .increment('minted_count', 1)
        .update('last_updated', db.fn.now());
      
      // If no row was updated, create new stats entry
      if (!updated) {
        await db('token_stats').insert({
          denomination_id: keyPair.denominationId,
          minted_count: 1,
          redeemed_count: 0,
          last_updated: db.fn.now()
        });
      }
    } catch (statsError) {
      // Log but continue - stats are secondary to token creation
      logger.warn({ error: statsError }, 'Failed to update token stats');
    }
    
    // Update batch stats if a batch_id was provided
    if (batch_id) {
      try {
        // Check if the batch exists
        const batch = await db('batch_stats')
          .where('batch_id', batch_id)
          .first();
        
        if (batch) {
          // Update existing batch
          await db('batch_stats')
            .where('batch_id', batch_id)
            .increment('total_value', denomination.value)
            .update('last_updated', db.fn.now());
        } else {
          // Create new batch stats
          await db('batch_stats').insert({
            batch_id,
            currency: denomination.currency,
            total_value: denomination.value,
            redeemed_value: 0,
            created_at: db.fn.now(),
            last_updated: db.fn.now()
          });
        }
      } catch (batchError) {
        // Log but continue - batch stats are secondary
        logger.warn({ error: batchError }, 'Failed to update batch stats');
      }
    }
    
    // Process the signed token
    if (!tokenRequest.hashAlgo) {
      tokenRequest.hashAlgo = 'sha256'; // Default for backwards compatibility
    }
    
    const finishedToken = blindSignature.processSignedToken(
      tokenRequest,
      signature.toString('base64'),
      keyPair.publicKey
    );
    
    // Create token object (in true Chaumian fashion, just the blind signature with no metadata)
    const tokenObject = {
      data: finishedToken.data,
      signature: finishedToken.signature,
      key_id: keyPair.id
    };
    
    // Create both compact and raw token formats
    const compactToken = encodeToken(tokenObject, custom_prefix);
    
    res.status(200).json({
      success: true,
      token: compactToken,
      token_raw: JSON.stringify(tokenObject), // Include raw format for backward compatibility
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
    
    logger.debug({ tokenPrefix: token.substring(0, 20) + '...' }, 'Received token for verification');
    
    // Check if this is a bundle - if so, handle it differently
    if (token.includes('B') && (token.startsWith('btcpins') || token.startsWith('giftmint'))) {
      logger.info('Detected bundle format, attempting to unbundle and verify tokens');
      
      // Extract tokens from the bundle
      let unbundled;
      try {
        const { bundleTokens, unbundleTokens } = require('../utils/tokenEncoder');
        
        // Enable extra debug info for troubleshooting
        logger.level = 'debug';
        
        // Log the raw CBOR token for analysis
        logger.debug({ 
          tokenLength: token.length,
          tokenStart: token.substring(0, 50),
          tokenEnd: token.substring(token.length - 20),
        }, 'Raw CBOR token for analysis');
        
        // Try to unbundle the token
        unbundled = unbundleTokens(token);
        
        // Log the complete unbundled structure for analysis
        logger.debug({ 
          unbundledKeys: unbundled ? Object.keys(unbundled) : 'none',
          hasTokens: unbundled && unbundled.t ? true : false,
          format: unbundled ? unbundled.format : 'unknown',
          tokenCount: unbundled && unbundled.t ? unbundled.t.length : 0,
          tokenStructure: unbundled && unbundled.t && unbundled.t[0] ? 
            (typeof unbundled.t[0] === 'string' ? 
              'string' : JSON.stringify(unbundled.t[0]).substring(0, 100)
            ) : 'unknown'
        }, 'Unbundled token structure analysis');
        
        // Check if we have tokens to verify and if we're dealing with raw structure
        if (unbundled && unbundled.t && Array.isArray(unbundled.t)) {
          // Check if this is a raw CBOR structure with nested proofs
          const isRawStructure = unbundled.raw_structure === true;
          
          logger.debug({
            elementsCount: unbundled.t.length,
            isRawStructure: isRawStructure,
            hasDecodedTokens: !!unbundled.decoded_tokens
          }, 'Analyzing unbundled token structure');
          
          // Verify each token in the bundle
          const results = [];
          const totalValue = { amount: 0, currency: null };
          
          // Count tokens and proofs for debugging
          let totalProofsCount = 0;
          
          if (isRawStructure) {
            // This is a raw CBOR structure with token groups
            for (const group of unbundled.t) {
              if (group && group.p && Array.isArray(group.p)) {
                totalProofsCount += group.p.length;
              }
            }
          } else {
            // Use the old count method for backward compatibility
            totalProofsCount = unbundled.t.reduce((count, token) => {
              if (token && typeof token === 'string') {
                // Direct token
                return count + 1;
              } else if (token && Array.isArray(token.p)) {
                // TokenV4 format with nested proofs
                return count + token.p.length;
              }
              return count;
            }, 0);
          }
          
          logger.debug(`Found approximately ${totalProofsCount} tokens to verify across ${unbundled.t.length} groups`);
          
          // Deep logging of the first token group for analysis
          if (unbundled.t.length > 0) {
            const firstGroup = unbundled.t[0];
            logger.debug({ 
              firstGroup: typeof firstGroup === 'string' ? 
                'string token' : JSON.stringify(firstGroup).substring(0, 200),
              hasProofs: firstGroup && firstGroup.p ? true : false,
              proofsCount: firstGroup && firstGroup.p ? firstGroup.p.length : 0
            }, 'First token group analysis');
          }
          
          // Process all tokens, handling different structures
          for (const item of unbundled.t) {
            try {
              // Check if this is a direct token string
              if (typeof item === 'string') {
                logger.debug('Processing direct token string');
                await verifyAndAddSingleToken(item, results, totalValue);
              } 
              // Check if this is a wrapped token with multiple proofs
              else if (item && Array.isArray(item.p)) {
                logger.debug(`Processing token group with ${item.p.length} proofs`);
                
                // Process each proof in this group
                for (const proof of item.p) {
                  try {
                    // Determine if we have needed data to make this into a token
                    if (!proof || !proof.s) {
                      logger.warn('Proof missing required data, skipping');
                      continue;
                    }
                    
                    logger.debug(`Verifying proof for secret: ${proof.s.substring(0, 8)}...`);
                    
                    // Get key ID from parent or proof
                    const keyId = (item.i && Buffer.isBuffer(item.i)) ? 
                      item.i.toString() : 
                      (typeof item.i === 'string' ? item.i : 'unknown-key-id');
                    
                    // Get signature from proof
                    const signature = Buffer.isBuffer(proof.c) ?
                      proof.c.toString('base64') :
                      proof.c;
                    
                    // Create token data
                    const data = JSON.stringify({ id: proof.s });
                    
                    // Verify this token
                    await verifyAndAddTokenComponents(
                      data, signature, keyId, 
                      results, totalValue
                    );
                  } catch (proofError) {
                    logger.warn({ error: proofError }, 'Error processing proof in token group');
                  }
                }
              } 
              // Otherwise, try to parse as token
              else {
                logger.debug('Attempting to parse and verify as individual token');
                await verifyAndAddSingleToken(item, results, totalValue);
              }
            } catch (itemError) {
              logger.error({ error: itemError }, 'Error processing bundle item');
              // Continue to next token
            }
          }
          
          // Helper function to verify a single token string
          async function verifyAndAddSingleToken(tokenString, results, totalValue) {
            try {
              // Parse individual token
              const parsed = decodeToken(tokenString);
              
              // Extract components and verify
              const { data, signature, key_id } = parsed;
              
              // Verify components
              await verifyAndAddTokenComponents(
                data, signature, key_id, 
                results, totalValue
              );
            } catch (error) {
              logger.warn({ error }, 'Failed to verify single token');
            }
          }
          
          // Helper function to verify token components
          async function verifyAndAddTokenComponents(data, signature, key_id, results, totalValue) {
            if (!data || !signature || !key_id) {
              logger.warn('Token missing required components');
              return;
            }
            
            try {
              // Parse token data
              const tokenData = JSON.parse(data);
              
              logger.debug(`Verifying token with ID: ${tokenData.id}`);
              
              // Get key pair by ID
              const keyPair = await keyManager.getKeyPairById(key_id);
              if (!keyPair) {
                logger.warn({ key_id }, 'Key pair not found');
                return;
              }
              
              // Get denomination info
              const denomination = await keyManager.getDenomination(keyPair.denominationId);
              if (!denomination) {
                logger.warn({ denominationId: keyPair.denominationId }, 'Denomination not found');
                return;
              }
              
              // Set currency if not already set
              if (!totalValue.currency) {
                totalValue.currency = denomination.currency;
              }
              
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
                logger.warn({ token_id: tokenData.id }, 'Invalid signature');
                return;
              }
              
              // Check if token has been redeemed
              const db = getDb();
              const redeemedToken = await db('redeemed_tokens')
                .where('id', tokenData.id)
                .first();
              
              if (redeemedToken) {
                logger.warn({ token_id: tokenData.id }, 'Token already redeemed');
                return;
              }
              
              // Token is valid, add to results
              results.push({
                token_id: tokenData.id,
                denomination: {
                  id: denomination.id,
                  value: denomination.value,
                  currency: denomination.currency,
                  description: denomination.description
                },
                isValid: true
              });
              
              // Add to total value
              totalValue.amount += denomination.value;
              
              logger.debug(`Successfully verified token: ${tokenData.id}, value: ${denomination.value}`);
            } catch (error) {
              logger.warn({ error }, 'Failed to verify token components');
            }
          }
          
          // Return all valid tokens
          return res.status(200).json({
            success: true,
            bundle_verified: true,
            valid_tokens: results,
            token_count: results.length,
            total_value: totalValue.amount,
            currency: totalValue.currency || 'SATS'
          });
        } else {
          logger.warn('No valid tokens found in bundle');
          return res.status(400).json({
            success: false,
            message: 'No valid tokens found in bundle'
          });
        }
      } catch (unbundleError) {
        logger.error({ error: unbundleError }, 'Failed to unbundle token');
        return res.status(400).json({
          success: false,
          message: 'Failed to unbundle token: ' + unbundleError.message
        });
      }
    }
    
    // Handle single token verification for non-bundle cases
    let parsedToken;
    try {
      // Check if the token is a compact format with any prefix
      if (typeof token === 'string' && 
          (token.startsWith('giftmint') || 
           token.startsWith('btcpins') || 
           token.startsWith(config.token.prefix))) {
        logger.debug('Detected compact token format with prefix');
        // Compact token format
        parsedToken = decodeToken(token);
      } else if (typeof token === 'string' && token.startsWith('{')) {
        logger.debug('Detected JSON format token');
        // Legacy JSON format
        parsedToken = JSON.parse(token);
      } else {
        logger.debug('Attempting to decode with generic approach');
        // Try generic approach
        parsedToken = decodeToken(token);
      }
      
      logger.debug('Successfully parsed token');
    } catch (e) {
      logger.error({ error: e }, 'Error parsing token');
      return res.status(400).json({
        success: false,
        message: 'Invalid token format: ' + e.message
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
    
    // Check if token has been redeemed - now uses redeemed_tokens table
    const db = getDb();
    const redeemedToken = await db('redeemed_tokens')
      .where('id', tokenData.id)
      .first();
    
    // Token is already redeemed if it exists in the redeemed_tokens table
    if (redeemedToken) {
      return res.status(400).json({
        success: false,
        message: 'Token has already been redeemed',
        redeemed_at: redeemedToken.redeemed_at
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
    
    // Parse token - support both compact and raw JSON formats
    let parsedToken;
    try {
      if (token.startsWith('giftmint')) {
        // Compact token format
        parsedToken = decodeToken(token);
      } else {
        // Legacy JSON format
        parsedToken = JSON.parse(token);
      }
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
      // Check if token has been redeemed - use redeemed_tokens table
      const redeemedToken = await trx('redeemed_tokens')
        .where('id', tokenData.id)
        .first();
      
      if (redeemedToken) {
        await trx.rollback();
        return res.status(400).json({
          success: false,
          message: 'Token has already been redeemed',
          redeemed_at: redeemedToken.redeemed_at
        });
      }
      
      // Store the token in redeemed_tokens table
      const now = new Date();
      await trx('redeemed_tokens').insert({
        id: tokenData.id,
        denomination_id: keyPair.denominationId,
        key_id: key_id,
        redeemed_at: now
      });
      
      // Record the redemption details
      await trx('redemptions').insert({
        token_id: tokenData.id,
        denomination_id: keyPair.denominationId,
        status: 'completed',
        created_at: now
      });
      
      // Update token stats
      await trx('token_stats')
        .where('denomination_id', keyPair.denominationId)
        .increment('redeemed_count', 1)
        .update('last_updated', now)
        .catch(async () => {
          // If no row exists yet, create it
          await trx('token_stats').insert({
            denomination_id: keyPair.denominationId,
            minted_count: 0, // We don't know how many were minted before stats tracking
            redeemed_count: 1,
            last_updated: now
          });
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
    const { token, custom_prefix } = req.body;
    
    // Validate input
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token is required'
      });
    }
    
    logger.info('Reminting token, input format:', typeof token);
    
    // Parse token - support both compact (with/without prefix) and raw JSON formats
    let parsedToken;
    try {
      // Check if it's already a JSON string (for backward compatibility)
      if (typeof token === 'string' && token.startsWith('{') && token.endsWith('}')) {
        logger.info('Token appears to be JSON already, parsing directly');
        parsedToken = JSON.parse(token);
      }
      // Check if the token is a compact format with any prefix
      else if (typeof token === 'string' && 
          (token.startsWith('giftmint') || 
           token.startsWith('btcpins') || 
           token.startsWith(config.token.prefix))) {
        logger.info('Detected compact token format with prefix');
        // Compact token format
        parsedToken = decodeToken(token);
      } else {
        logger.info('Attempting generic decode');
        // Try generic approach
        parsedToken = decodeToken(token);
      }
      
      logger.info('Successfully parsed token');
    } catch (e) {
      logger.error('Error parsing token:', e.message);
      return res.status(400).json({
        success: false,
        message: 'Invalid token format: ' + e.message
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
    if (!keyPair) {
      return res.status(400).json({
        success: false,
        message: 'Invalid key ID'
      });
    }
    
    // Get denomination info
    const denomination = await keyManager.getDenomination(keyPair.denominationId);
    if (!denomination) {
      return res.status(400).json({
        success: false,
        message: 'Invalid denomination'
      });
    }
    
    // Recreate the token hash
    const tokenHash = require('crypto')
      .createHash('sha256')
      .update(Buffer.from(data, 'utf8'))
      .digest();
    
    // Verify signature cryptographically
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
      // Check if token has been redeemed by checking redeemed_tokens table
      const redeemedToken = await trx('redeemed_tokens')
        .where('id', tokenData.id)
        .first();
      
      if (redeemedToken) {
        await trx.rollback();
        return res.status(400).json({
          success: false,
          message: 'Token has already been redeemed',
          redeemed_at: redeemedToken.redeemed_at
        });
      }
      
      // Create a new token with the same denomination
      const newTokenRequest = blindSignature.createTokenRequest(
        keyPair.denominationId,
        keyPair.publicKey
      );
      
      // Add a log to help debug
      logger.info('Created new token request with the same denomination');
      
      // Sign the new token immediately (privacy-preserving approach)
      const blindedTokenBuffer = Buffer.from(newTokenRequest.blindedToken, 'base64');
      const newSignature = blindSignature.signBlindedMessage(
        blindedTokenBuffer, 
        keyPair.privateKey
      );
      
      // Process the signed token
      const finishedNewToken = blindSignature.processSignedToken(
        newTokenRequest,
        newSignature.toString('base64'),
        keyPair.publicKey
      );
      
      // Create token object
      const tokenObject = {
        data: finishedNewToken.data,
        signature: finishedNewToken.signature,
        key_id: keyPair.id
      };
      
      // Mark old token as redeemed in redeemed_tokens table
      await trx('redeemed_tokens').insert({
        id: tokenData.id,
        denomination_id: denomination.id,
        key_id: key_id,
        redeemed_at: trx.fn.now()
      });
      
      // Update stats
      await trx('token_stats')
        .where('denomination_id', denomination.id)
        .increment('minted_count', 1)
        .increment('redeemed_count', 1)
        .update('last_updated', trx.fn.now())
        .catch(async () => {
          // If record doesn't exist, create it
          await trx('token_stats').insert({
            denomination_id: denomination.id,
            minted_count: 1,
            redeemed_count: 1,
            last_updated: trx.fn.now()
          });
        });
      
      // Create the encoded token
      const compactToken = encodeToken(tokenObject, custom_prefix);
      
      // Commit the transaction
      await trx.commit();
      
      // Return the new token
      res.status(200).json({
        success: true,
        new_token: compactToken,
        new_token_raw: JSON.stringify(tokenObject),
        denomination: {
          id: denomination.id,
          value: denomination.value,
          currency: denomination.currency,
          description: denomination.description
        }
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
 * Split a token
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function splitToken(req, res) {
  // This function is now implemented with the full version below.
  // This placeholder remains for function order.
  return splitTokenImplementation(req, res);
}

/**
 * Bulk create tokens
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function bulkCreateTokens(req, res) {
  try {
    const { amount, currency, quantity, batch_id, custom_prefix } = req.body;
    
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
        
        // Format token object
        const tokenObject = {
          data: finishedToken.data,
          signature: finishedToken.signature,
          key_id: keyPair.id
        };
        
        // Create compact token with custom prefix if provided
        const compactToken = encodeToken(tokenObject, custom_prefix);
        
        // Add to tokens array
        tokens.push(compactToken);
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
    
    const db = getDb();
    
    if (batch_id) {
      // Get stats for a specific batch
      const batchStats = await db('batch_stats')
        .where('batch_id', batch_id)
        .first();
      
      if (!batchStats) {
        return res.status(404).json({
          success: false,
          message: 'Batch not found'
        });
      }
      
      return res.status(200).json({
        success: true,
        value: parseFloat(batchStats.total_value) - parseFloat(batchStats.redeemed_value),
        total_value: parseFloat(batchStats.total_value),
        redeemed_value: parseFloat(batchStats.redeemed_value),
        batch_id: batchStats.batch_id,
        currency: batchStats.currency
      });
    }
    
    if (currency) {
      // Calculate outstanding value for a specific currency
      const denominationStats = await db('denominations')
        .join('token_stats', 'denominations.id', 'token_stats.denomination_id')
        .where('denominations.currency', currency)
        .select(
          'denominations.currency',
          db.raw('SUM(denominations.value * token_stats.minted_count) as total_value'),
          db.raw('SUM(denominations.value * token_stats.redeemed_count) as redeemed_value')
        )
        .groupBy('denominations.currency')
        .first();
      
      if (!denominationStats) {
        return res.status(200).json({
          success: true,
          value: 0,
          total_value: 0,
          redeemed_value: 0,
          currency: currency
        });
      }
      
      return res.status(200).json({
        success: true,
        value: parseFloat(denominationStats.total_value) - parseFloat(denominationStats.redeemed_value),
        total_value: parseFloat(denominationStats.total_value),
        redeemed_value: parseFloat(denominationStats.redeemed_value),
        currency: denominationStats.currency
      });
    }
    
    // Calculate total outstanding value across all denominations
    const allStats = await db('denominations')
      .join('token_stats', 'denominations.id', 'token_stats.denomination_id')
      .select(
        db.raw('SUM(denominations.value * token_stats.minted_count) as total_value'),
        db.raw('SUM(denominations.value * token_stats.redeemed_count) as redeemed_value')
      )
      .first();
    
    if (!allStats) {
      return res.status(200).json({
        success: true,
        value: 0,
        total_value: 0,
        redeemed_value: 0
      });
    }
    
    return res.status(200).json({
      success: true,
      value: parseFloat(allStats.total_value) - parseFloat(allStats.redeemed_value),
      total_value: parseFloat(allStats.total_value),
      redeemed_value: parseFloat(allStats.redeemed_value)
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
 * Split a token - Implementation
 * 
 * This function takes a token of one denomination and splits it into multiple tokens of smaller denominations.
 * It's the Chaumian e-cash version of making change.
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function splitTokenImplementation(req, res) {
  try {
    const { token, redeem_denomination_id, redeem_amount, custom_prefix } = req.body;
    
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
    
    // Parse token - support both compact and raw JSON formats
    let parsedToken;
    try {
      if (token.startsWith('giftmint')) {
        // Compact token format
        parsedToken = decodeToken(token);
      } else {
        // Legacy JSON format
        parsedToken = JSON.parse(token);
      }
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
      // Check if token has been redeemed - use redeemed_tokens table
      const redeemedToken = await trx('redeemed_tokens')
        .where('id', tokenData.id)
        .first();
      
      if (redeemedToken) {
        await trx.rollback();
        return res.status(400).json({
          success: false,
          message: 'Token has already been redeemed'
        });
      }
      
      // Mark original token as redeemed - add to redeemed_tokens
      await trx('redeemed_tokens').insert({
        id: tokenData.id,
        denomination_id: keyPair.denominationId,
        key_id: key_id,
        redeemed_at: new Date()
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
        const tokenObject = {
          data: finishedChangeToken.data,
          signature: finishedChangeToken.signature,
          key_id: changeKeyPair.id
        };
        
        // Create compact token format with custom prefix if provided
        const compactToken = encodeToken(tokenObject, custom_prefix);
        
        changeTokens.push(compactToken);
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
  splitTokenImplementation, // Add implementation for testing
  bulkCreateTokens,
  getOutstandingValue,
  getOutstandingByDenomination
};