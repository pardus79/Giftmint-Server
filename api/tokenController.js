'use strict';

const config = require('../config/config');
const keyManager = require('../crypto/ecKeyManager');
const blindSignature = require('../crypto/ecBlindSignature');
const tokenEncoder = require('../utils/tokenEncoder');
const compactTokenEncoder = require('../utils/compactTokenEncoder');
const changeMaker = require('../utils/changeMaker');
const db = require('../db/database');
const crypto = require('crypto');
const cbor = require('cbor');

// Always use compact encoding for better space efficiency
// The standard encoding is deprecated and should not be used
const useCompactEncoding = true; // This flag is kept for backward compatibility but is always true

/**
 * Creates a single token with the specified amount
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function createToken(req, res) {
  try {
    const { amount, custom_prefix } = req.body;
    
    if (!amount || isNaN(parseInt(amount, 10)) || parseInt(amount, 10) <= 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_AMOUNT',
          message: 'Amount must be a positive integer value'
        }
      });
    }
    
    const amountInt = parseInt(amount, 10);
    
    // Use custom prefix if provided
    let tokenPrefix = config.token.prefix;
    if (custom_prefix) {
      tokenPrefix = custom_prefix;
      console.log(`Using custom prefix: ${tokenPrefix} from request`);
    } else {
      console.log(`Using default prefix: ${tokenPrefix} from config`);
    }
    
    // Get optimal combination of denominations
    const denominationCombination = changeMaker.getOptimalCombination(amountInt, config.denominations);
    
    // With power-of-2 denominations, we should always be able to represent any positive integer value
    // This check is just a safeguard and shouldn't normally be triggered
    if (!denominationCombination) {
      console.error(`Unexpected error: Unable to represent value ${amountInt} with power-of-2 denominations`);
      return res.status(500).json({
        error: {
          code: 'SERVER_ERROR',
          message: 'Internal error processing the requested value'
        }
      });
    }
    
    // Get the latest key for signing
    const activeKey = await keyManager.getActiveKey();
    
    if (!activeKey) {
      return res.status(500).json({
        error: {
          code: 'KEY_ERROR',
          message: 'No active key available for signing'
        }
      });
    }
    
    // Create tokens for each denomination
    const tokens = [];
    
    for (const [denomination, count] of Object.entries(denominationCombination)) {
      for (let i = 0; i < count; i++) {
        // Generate random secret
        const secret = crypto.randomBytes(32);
        
        // Create blinded message
        const { blindedMessage, blindingFactor } = blindSignature.blind(secret, activeKey.publicKey);
        
        // Sign with mint's private key
        const blindSig = await blindSignature.sign(blindedMessage, activeKey.privateKey);
        
        // Unblind signature
        const unblindedSignature = blindSignature.unblind(blindSig, blindingFactor, activeKey.publicKey);
        
        // Create token
        const token = tokenEncoder.encodeToken({
          keyId: activeKey.id,
          denomination: parseInt(denomination, 10),
          secret: secret.toString('hex'),
          signature: unblindedSignature.toString('hex'),
          prefix: tokenPrefix // Use custom prefix if specified
        });
        
        tokens.push(token);
      }
    }
    
    // Always use compact bundling for better efficiency
    const tokenBundle = compactTokenEncoder.bundleTokensCompact(tokens, tokenPrefix);
    
    res.status(201).json({
      success: true,
      amount: amountInt,
      token: tokenBundle
    });
  } catch (error) {
    console.error('Error creating token:', error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: config.isDevelopment ? error.message : 'Internal server error'
      }
    });
  }
}

/**
 * Creates multiple tokens with the specified amounts
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function bulkCreateTokens(req, res) {
  try {
    const { amounts } = req.body;
    
    if (!Array.isArray(amounts) || amounts.length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_AMOUNTS',
          message: 'Amounts must be a non-empty array of positive integers'
        }
      });
    }
    
    const tokenBundles = [];
    let totalAmount = 0;
    
    for (const amount of amounts) {
      const amountInt = parseInt(amount, 10);
      
      if (isNaN(amountInt) || amountInt <= 0) {
        return res.status(400).json({
          error: {
            code: 'INVALID_AMOUNT',
            message: `Invalid amount: ${amount}`
          }
        });
      }
      
      // Get optimal combination of denominations
      const denominationCombination = changeMaker.getOptimalCombination(amountInt, config.denominations);
      
      // With power-of-2 denominations, we should always be able to represent any positive integer value
      // This check is just a safeguard and shouldn't normally be triggered
      if (!denominationCombination) {
        console.error(`Unexpected error: Unable to represent value ${amountInt} with power-of-2 denominations`);
        return res.status(500).json({
          error: {
            code: 'SERVER_ERROR',
            message: 'Internal error processing the requested value'
          }
        });
      }
      
      // Get the latest key for signing
      const activeKey = await keyManager.getActiveKey();
      
      if (!activeKey) {
        return res.status(500).json({
          error: {
            code: 'KEY_ERROR',
            message: 'No active key available for signing'
          }
        });
      }
      
      // Create tokens for each denomination
      const tokens = [];
      
      for (const [denomination, count] of Object.entries(denominationCombination)) {
        for (let i = 0; i < count; i++) {
          // Generate random secret
          const secret = crypto.randomBytes(32);
          
          // Create blinded message
          const { blindedMessage, blindingFactor } = blindSignature.blind(secret, activeKey.publicKey);
          
          // Sign with mint's private key
          const blindSig = await blindSignature.sign(blindedMessage, activeKey.privateKey);
          
          // Unblind signature
          const unblindedSignature = blindSignature.unblind(blindSig, blindingFactor, activeKey.publicKey);
          
          // Create token
          const token = tokenEncoder.encodeToken({
            keyId: activeKey.id,
            denomination: parseInt(denomination, 10),
            secret: secret.toString('hex'),
            signature: unblindedSignature.toString('hex')
          });
          
          tokens.push(token);
        }
      }
      
      // Always use compact bundling
      const tokenBundle = compactTokenEncoder.bundleTokensCompact(tokens);
      tokenBundles.push(tokenBundle);
      totalAmount += amountInt;
    }
    
    res.status(201).json({
      success: true,
      count: amounts.length,
      totalAmount,
      tokens: tokenBundles
    });
  } catch (error) {
    console.error('Error creating bulk tokens:', error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: config.isDevelopment ? error.message : 'Internal server error'
      }
    });
  }
}

/**
 * Verifies a token or token bundle
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function verifyToken(req, res) {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        error: {
          code: 'MISSING_TOKEN',
          message: 'Token is required'
        }
      });
    }
    
    console.log(`[verifyToken] Processing token: ${token.substring(0, 20)}... (length: ${token.length})`);
    
    // Determine if this is a bundle or single token
    let tokens = [];
    let isBundled = false;
    
    // Check what kind of token we're dealing with
    console.log(`[verifyToken] Examining token format: ${token.substring(0, 30)}...`);
    
    // Check if this looks like a compact bundle format (starts with prefix followed by CBOR data)
    const isCompactFormat = token.match(/^[a-zA-Z0-9]+oWF/);
    // Check if this looks like an individual token (contains underscore)
    const isIndividualToken = token.includes('_');
    
    console.log(`[verifyToken] Token format detection: compact=${!!isCompactFormat}, individual=${isIndividualToken}`);
    
    try {
      if (isCompactFormat) {
        // Try compact format first as it's the preferred format
        console.log('[verifyToken] Trying to unbundle as compact format');
        try {
          tokens = compactTokenEncoder.unbundleTokensCompact(token);
          isBundled = true;
          
          // Check if we have valid tokens or just a fallback empty array
          if (tokens && tokens.length > 0) {
            console.log(`[verifyToken] Successfully unbundled as compact format: ${tokens.length} tokens`);
          } else {
            // Something went wrong during unbundling, but it didn't throw an error
            console.log('[verifyToken] Unbundling returned empty token array, checking for special flags');
            
            // Check if this is a special case with our bypass flag
            if (tokens && tokens._verification_bypass_needed) {
              console.log('[verifyToken] Token has verification bypass flag - using special handling');
              
              // This is a direct verification token - the original token should be validated directly
              tokens = [token]; // Use the original token for direct verification
            } else {
              // Regular fall back case
              console.log('[verifyToken] No special flags found, treating as single token');
              tokens = [token]; // Fall back to treating as single token
            }
          }
        } catch (err) {
          console.error(`[verifyToken] Failed to unbundle compact format: ${err.message}`);
          
          // Check if the error message indicates a CBOR tag issue
          if (err.message && (
              err.message.includes('Additional info not implemented') ||
              err.message.includes('tag 28') ||
              err.message.includes('tag 30') ||
              err.message.includes('Unknown fixed value')
          )) {
            console.log('[verifyToken] Detected CBOR tag issue, attempting direct token validation');
            // Special handling for known CBOR tag issue
            tokens = [token]; // Treat as single token
          } else {
            // Other error, try as single token
            tokens = [token];
          }
        }
      } else if (isIndividualToken) {
        // This is an individual token with underscore separator
        console.log('[verifyToken] Detected individual token format');
        tokens = [token];
      } else {
        // Unknown format - try compact unbundling as a last resort
        console.log('[verifyToken] Unknown token format, trying compact unbundling');
        try {
          tokens = compactTokenEncoder.unbundleTokensCompact(token);
          isBundled = true;
          
          // Check if we have valid tokens or just a fallback empty array
          if (tokens && tokens.length > 0) {
            console.log(`[verifyToken] Successfully unbundled as compact format: ${tokens.length} tokens`);
          } else {
            // Something went wrong during unbundling, but it didn't throw an error
            console.log('[verifyToken] Unbundling returned empty token array, checking for special flags');
            
            // Check if this is a special case with our bypass flag
            if (tokens && tokens._verification_bypass_needed) {
              console.log('[verifyToken] Token has verification bypass flag - using special handling');
              
              // This is a direct verification token - the original token should be validated directly
              tokens = [token]; // Use the original token for direct verification
            } else {
              // Regular fall back case
              console.log('[verifyToken] No special flags found, treating as single token');
              tokens = [token]; // Fall back to treating as single token
            }
          }
        } catch (compactError) {
          console.log(`[verifyToken] Unbundling failed: ${compactError.message}`);
          
          // Check if the error message indicates a CBOR tag issue
          if (compactError.message && (
              compactError.message.includes('Additional info not implemented') ||
              compactError.message.includes('tag 28') ||
              compactError.message.includes('tag 30') ||
              compactError.message.includes('Unknown fixed value')
          )) {
            console.log('[verifyToken] Detected CBOR tag issue in fallback path, attempting direct token validation');
          }
          
          // Fall back to treating as single token
          tokens = [token];
        }
      }
    } catch (error) {
      // If all unbundling attempts fail, log the error and treat as single token
      console.error(`[verifyToken] Error unbundling token: ${error.message}`);
      tokens = [token];
    }
    
    const verificationResults = [];
    let totalAmount = 0;
    
    for (const singleToken of tokens) {
      try {
        // Decode the token
        const decodedToken = tokenEncoder.decodeToken(singleToken);
        
        // Get the key for verification
        const key = await keyManager.getKeyById(decodedToken.keyId);
        
        if (!key) {
          verificationResults.push({
            valid: false,
            reason: 'UNKNOWN_KEY',
            token: singleToken
          });
          continue;
        }
        
        // Check if token has been redeemed
        const isRedeemed = await db.isTokenRedeemed(decodedToken.id);
        
        if (isRedeemed) {
          verificationResults.push({
            valid: false,
            reason: 'ALREADY_REDEEMED',
            token: singleToken
          });
          continue;
        }
        
        // Verify the signature
        const isValid = blindSignature.verify(
          Buffer.from(decodedToken.secret, 'hex'),
          Buffer.from(decodedToken.signature, 'hex'),
          key.publicKey
        );
        
        if (!isValid) {
          verificationResults.push({
            valid: false,
            reason: 'INVALID_SIGNATURE',
            token: singleToken
          });
          continue;
        }
        
        verificationResults.push({
          valid: true,
          denomination: decodedToken.denomination,
          token: singleToken
        });
        
        totalAmount += decodedToken.denomination;
      } catch (error) {
        verificationResults.push({
          valid: false,
          reason: 'INVALID_FORMAT',
          token: singleToken,
          error: config.isDevelopment ? error.message : undefined
        });
      }
    }
    
    const allValid = verificationResults.every(result => result.valid);
    
    res.status(200).json({
      valid: allValid,
      bundled: isBundled,
      count: tokens.length,
      totalAmount: allValid ? totalAmount : 0,
      results: verificationResults
    });
  } catch (error) {
    console.error('Error verifying token:', error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: config.isDevelopment ? error.message : 'Internal server error'
      }
    });
  }
}

/**
 * Redeems a token or token bundle
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function redeemToken(req, res) {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        error: {
          code: 'MISSING_TOKEN',
          message: 'Token is required'
        }
      });
    }
    
    console.log(`[redeemToken] Processing token: ${token.substring(0, 20)}... (length: ${token.length})`);
    
    // Determine if this is a bundle or single token
    let tokens = [];
    let isBundled = false;
    
    // Check what kind of token we're dealing with
    console.log(`[redeemToken] Examining token format: ${token.substring(0, 30)}...`);
    
    // Check if this looks like a compact bundle format (starts with prefix followed by CBOR data)
    const isCompactFormat = token.match(/^[a-zA-Z0-9]+oWF/);
    // Check if this looks like an individual token (contains underscore)
    const isIndividualToken = token.includes('_');
    
    console.log(`[redeemToken] Token format detection: compact=${!!isCompactFormat}, individual=${isIndividualToken}`);
    
    try {
      if (isCompactFormat) {
        // Try compact format first as it's the preferred format
        console.log('[redeemToken] Trying to unbundle as compact format');
        try {
          tokens = compactTokenEncoder.unbundleTokensCompact(token);
          isBundled = true;
          console.log(`[redeemToken] Successfully unbundled as compact format: ${tokens.length} tokens`);
        } catch (err) {
          console.error(`[redeemToken] Failed to unbundle compact format: ${err.message}`);
          tokens = [token]; // Fall back to treating as single token
        }
      } else if (isIndividualToken) {
        // This is an individual token with underscore separator
        console.log('[redeemToken] Detected individual token format');
        tokens = [token];
      } else {
        // Unknown format - try compact unbundling as a last resort
        console.log('[redeemToken] Unknown token format, trying compact unbundling');
        try {
          tokens = compactTokenEncoder.unbundleTokensCompact(token);
          isBundled = true;
          console.log(`[redeemToken] Successfully unbundled as compact format: ${tokens.length} tokens`);
        } catch (compactError) {
          console.log(`[redeemToken] Unbundling failed, treating as single token`);
          tokens = [token];
        }
      }
    } catch (error) {
      // If all unbundling attempts fail, log the error and treat as single token
      console.error(`[redeemToken] Error unbundling token: ${error.message}`);
      tokens = [token];
    }
    
    const redemptionResults = [];
    let totalAmount = 0;
    
    // Start a database transaction
    await db.beginTransaction();
    
    try {
      for (const singleToken of tokens) {
        try {
          // Decode the token
          const decodedToken = tokenEncoder.decodeToken(singleToken);
          
          // Get the key for verification
          const key = await keyManager.getKeyById(decodedToken.keyId);
          
          if (!key) {
            redemptionResults.push({
              redeemed: false,
              reason: 'UNKNOWN_KEY',
              token: singleToken
            });
            continue;
          }
          
          // Check if token has been redeemed
          const isRedeemed = await db.isTokenRedeemed(decodedToken.id);
          
          if (isRedeemed) {
            redemptionResults.push({
              redeemed: false,
              reason: 'ALREADY_REDEEMED',
              token: singleToken
            });
            continue;
          }
          
          // Verify the signature
          const isValid = blindSignature.verify(
            Buffer.from(decodedToken.secret, 'hex'),
            Buffer.from(decodedToken.signature, 'hex'),
            key.publicKey
          );
          
          if (!isValid) {
            redemptionResults.push({
              redeemed: false,
              reason: 'INVALID_SIGNATURE',
              token: singleToken
            });
            continue;
          }
          
          // Mark token as redeemed
          await db.markTokenAsRedeemed(decodedToken.id, decodedToken.denomination);
          
          redemptionResults.push({
            redeemed: true,
            denomination: decodedToken.denomination,
            token: singleToken
          });
          
          totalAmount += decodedToken.denomination;
        } catch (error) {
          redemptionResults.push({
            redeemed: false,
            reason: 'INVALID_FORMAT',
            token: singleToken,
            error: config.isDevelopment ? error.message : undefined
          });
        }
      }
      
      // Commit the transaction
      await db.commitTransaction();
      
      const allRedeemed = redemptionResults.every(result => result.redeemed);
      
      res.status(200).json({
        success: allRedeemed,
        bundled: isBundled,
        count: tokens.length,
        totalAmount,
        results: redemptionResults
      });
    } catch (error) {
      // Rollback the transaction in case of error
      await db.rollbackTransaction();
      throw error;
    }
  } catch (error) {
    console.error('Error redeeming token:', error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: config.isDevelopment ? error.message : 'Internal server error'
      }
    });
  }
}

/**
 * Remints tokens without redeeming them
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function remintToken(req, res) {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        error: {
          code: 'MISSING_TOKEN',
          message: 'Token is required'
        }
      });
    }
    
    // Verify the token first
    let tokens = [];
    let isBundled = false;
    
    try {
      // Try to unbundle the token (first as standard, then as compact)
      try {
        tokens = tokenEncoder.unbundleTokens(token);
        isBundled = true;
      } catch (standardError) {
        // Try compact format if standard fails
        try {
          tokens = compactTokenEncoder.unbundleTokensCompact(token);
          isBundled = true;
        } catch (compactError) {
          // Not a bundle, treat as single token
          tokens = [token];
        }
      }
    } catch (error) {
      // Not a bundle, treat as single token
      tokens = [token];
    }
    
    const verificationResults = [];
    let totalAmount = 0;
    
    for (const singleToken of tokens) {
      try {
        // Decode the token
        const decodedToken = tokenEncoder.decodeToken(singleToken);
        
        // Get the key for verification
        const key = await keyManager.getKeyById(decodedToken.keyId);
        
        if (!key) {
          verificationResults.push({
            valid: false,
            reason: 'UNKNOWN_KEY',
            token: singleToken
          });
          continue;
        }
        
        // Check if token has been redeemed
        const isRedeemed = await db.isTokenRedeemed(decodedToken.id);
        
        if (isRedeemed) {
          verificationResults.push({
            valid: false,
            reason: 'ALREADY_REDEEMED',
            token: singleToken
          });
          continue;
        }
        
        // Verify the signature
        const isValid = blindSignature.verify(
          Buffer.from(decodedToken.secret, 'hex'),
          Buffer.from(decodedToken.signature, 'hex'),
          key.publicKey
        );
        
        if (!isValid) {
          verificationResults.push({
            valid: false,
            reason: 'INVALID_SIGNATURE',
            token: singleToken
          });
          continue;
        }
        
        verificationResults.push({
          valid: true,
          denomination: decodedToken.denomination,
          token: singleToken
        });
        
        totalAmount += decodedToken.denomination;
      } catch (error) {
        verificationResults.push({
          valid: false,
          reason: 'INVALID_FORMAT',
          token: singleToken,
          error: config.isDevelopment ? error.message : undefined
        });
      }
    }
    
    const allValid = verificationResults.every(result => result.valid);
    
    if (!allValid) {
      return res.status(400).json({
        error: {
          code: 'INVALID_TOKEN',
          message: 'One or more tokens are invalid',
          results: verificationResults
        }
      });
    }
    
    // All tokens are valid, now create new tokens
    
    // Get the latest key for signing
    const activeKey = await keyManager.getActiveKey();
    
    if (!activeKey) {
      return res.status(500).json({
        error: {
          code: 'KEY_ERROR',
          message: 'No active key available for signing'
        }
      });
    }
    
    // Create new tokens
    const newTokens = [];
    
    for (const result of verificationResults) {
      // Generate random secret
      const secret = crypto.randomBytes(32);
      
      // Create blinded message
      const { blindedMessage, blindingFactor } = blindSignature.blind(secret, activeKey.publicKey);
      
      // Sign with mint's private key
      const blindSig = await blindSignature.sign(blindedMessage, activeKey.privateKey);
      
      // Unblind signature
      const unblindedSignature = blindSignature.unblind(blindSig, blindingFactor, activeKey.publicKey);
      
      // Create token
      const token = tokenEncoder.encodeToken({
        keyId: activeKey.id,
        denomination: result.denomination,
        secret: secret.toString('hex'),
        signature: unblindedSignature.toString('hex')
      });
      
      newTokens.push(token);
    }
    
    // Always use compact bundling
    const tokenBundle = compactTokenEncoder.bundleTokensCompact(newTokens);
    
    res.status(200).json({
      success: true,
      amount: totalAmount,
      token: tokenBundle
    });
  } catch (error) {
    console.error('Error reminting token:', error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: config.isDevelopment ? error.message : 'Internal server error'
      }
    });
  }
}

/**
 * Splits a token into smaller denominations
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function splitToken(req, res) {
  try {
    const { token, amounts } = req.body;
    
    if (!token) {
      return res.status(400).json({
        error: {
          code: 'MISSING_TOKEN',
          message: 'Token is required'
        }
      });
    }
    
    if (!amounts || !Array.isArray(amounts) || amounts.length === 0) {
      return res.status(400).json({
        error: {
          code: 'INVALID_AMOUNTS',
          message: 'Amounts must be a non-empty array of positive integers'
        }
      });
    }
    
    // Verify the token first
    let tokens = [];
    let isBundled = false;
    
    try {
      // Try to unbundle the token (first as standard, then as compact)
      try {
        tokens = tokenEncoder.unbundleTokens(token);
        isBundled = true;
      } catch (standardError) {
        // Try compact format if standard fails
        try {
          tokens = compactTokenEncoder.unbundleTokensCompact(token);
          isBundled = true;
        } catch (compactError) {
          // Not a bundle, treat as single token
          tokens = [token];
        }
      }
    } catch (error) {
      // Not a bundle, treat as single token
      tokens = [token];
    }
    
    // Calculate total value of tokens
    let tokenTotalAmount = 0;
    const validTokens = [];
    
    for (const singleToken of tokens) {
      try {
        // Decode the token
        const decodedToken = tokenEncoder.decodeToken(singleToken);
        
        // Get the key for verification
        const key = await keyManager.getKeyById(decodedToken.keyId);
        
        if (!key) {
          continue;
        }
        
        // Check if token has been redeemed
        const isRedeemed = await db.isTokenRedeemed(decodedToken.id);
        
        if (isRedeemed) {
          continue;
        }
        
        // Verify the signature
        const isValid = blindSignature.verify(
          Buffer.from(decodedToken.secret, 'hex'),
          Buffer.from(decodedToken.signature, 'hex'),
          key.publicKey
        );
        
        if (!isValid) {
          continue;
        }
        
        validTokens.push(decodedToken);
        tokenTotalAmount += decodedToken.denomination;
      } catch (error) {
        // Skip invalid tokens
      }
    }
    
    // Calculate total amount requested in split
    const amountInts = amounts.map(a => parseInt(a, 10));
    const requestedTotal = amountInts.reduce((sum, amount) => sum + amount, 0);
    
    if (requestedTotal > tokenTotalAmount) {
      return res.status(400).json({
        error: {
          code: 'INSUFFICIENT_VALUE',
          message: `Total requested amount ${requestedTotal} exceeds token value ${tokenTotalAmount}`
        }
      });
    }
    
    // All tokens are valid, now create new tokens
    
    // Get the latest key for signing
    const activeKey = await keyManager.getActiveKey();
    
    if (!activeKey) {
      return res.status(500).json({
        error: {
          code: 'KEY_ERROR',
          message: 'No active key available for signing'
        }
      });
    }
    
    // Create new tokens for each requested amount
    const newTokenBundles = [];
    
    // Begin a transaction for marking original tokens as redeemed
    await db.beginTransaction();
    
    try {
      // Mark original tokens as redeemed
      for (const decodedToken of validTokens) {
        await db.markTokenAsRedeemed(decodedToken.id, decodedToken.denomination);
      }
      
      // Create new tokens
      for (const amount of amountInts) {
        if (amount <= 0) {
          continue;
        }
        
        // Get optimal combination of denominations
        const denominationCombination = changeMaker.getOptimalCombination(amount, config.denominations);
        
        // With power-of-2 denominations, we should always be able to represent any positive integer value
        // This check is just a safeguard and shouldn't normally be triggered
        if (!denominationCombination) {
          console.error(`Unexpected error: Unable to represent value ${amount} with power-of-2 denominations`);
          throw new Error(`Internal error processing the requested value: ${amount}`);
        }
        
        // Create tokens for each denomination
        const newTokens = [];
        
        for (const [denomination, count] of Object.entries(denominationCombination)) {
          for (let i = 0; i < count; i++) {
            // Generate random secret
            const secret = crypto.randomBytes(32);
            
            // Create blinded message
            const { blindedMessage, blindingFactor } = blindSignature.blind(secret, activeKey.publicKey);
            
            // Sign with mint's private key
            const blindSig = await blindSignature.sign(blindedMessage, activeKey.privateKey);
            
            // Unblind signature
            const unblindedSignature = blindSignature.unblind(blindSig, blindingFactor, activeKey.publicKey);
            
            // Create token
            const newToken = tokenEncoder.encodeToken({
              keyId: activeKey.id,
              denomination: parseInt(denomination, 10),
              secret: secret.toString('hex'),
              signature: unblindedSignature.toString('hex')
            });
            
            newTokens.push(newToken);
          }
        }
        
        // Always use compact bundling
        const tokenBundle = compactTokenEncoder.bundleTokensCompact(newTokens);
        newTokenBundles.push(tokenBundle);
      }
      
      // Add change if needed
      const changeAmount = tokenTotalAmount - requestedTotal;
      
      if (changeAmount > 0) {
        // Get optimal combination of denominations for change
        const denominationCombination = changeMaker.getOptimalCombination(changeAmount, config.denominations);
        
        // With power-of-2 denominations, we should always be able to represent any positive integer value
        // This check is just a safeguard and shouldn't normally be triggered
        if (!denominationCombination) {
          console.error(`Unexpected error: Unable to represent change value ${changeAmount} with power-of-2 denominations`);
          throw new Error(`Internal error processing the change amount`);
        }
        
        // Create tokens for change
        const changeTokens = [];
        
        for (const [denomination, count] of Object.entries(denominationCombination)) {
          for (let i = 0; i < count; i++) {
            // Generate random secret
            const secret = crypto.randomBytes(32);
            
            // Create blinded message
            const { blindedMessage, blindingFactor } = blindSignature.blind(secret, activeKey.publicKey);
            
            // Sign with mint's private key
            const blindSig = await blindSignature.sign(blindedMessage, activeKey.privateKey);
            
            // Unblind signature
            const unblindedSignature = blindSignature.unblind(blindSig, blindingFactor, activeKey.publicKey);
            
            // Create token
            const changeToken = tokenEncoder.encodeToken({
              keyId: activeKey.id,
              denomination: parseInt(denomination, 10),
              secret: secret.toString('hex'),
              signature: unblindedSignature.toString('hex')
            });
            
            changeTokens.push(changeToken);
          }
        }
        
        // Always use compact bundling for change tokens
        const changeBundle = compactTokenEncoder.bundleTokensCompact(changeTokens);
        newTokenBundles.push(changeBundle);
      }
      
      // Commit the transaction
      await db.commitTransaction();
      
      res.status(200).json({
        success: true,
        originalAmount: tokenTotalAmount,
        splitAmount: requestedTotal,
        changeAmount,
        tokens: newTokenBundles
      });
    } catch (error) {
      // Rollback the transaction in case of error
      await db.rollbackTransaction();
      throw error;
    }
  } catch (error) {
    console.error('Error splitting token:', error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: config.isDevelopment ? error.message : 'Internal server error'
      }
    });
  }
}

/**
 * Lists available denominations
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function listDenominations(req, res) {
  try {
    res.status(200).json({
      denominations: config.denominations.sort((a, b) => a - b)
    });
  } catch (error) {
    console.error('Error listing denominations:', error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: config.isDevelopment ? error.message : 'Internal server error'
      }
    });
  }
}

/**
 * Gets stats about outstanding tokens
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getOutstandingTokens(req, res) {
  try {
    const stats = await db.getTokenStats();
    
    res.status(200).json({
      stats
    });
  } catch (error) {
    console.error('Error getting token stats:', error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: config.isDevelopment ? error.message : 'Internal server error'
      }
    });
  }
}

/**
 * Diagnostic endpoint for detailed token verification
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function diagnosticVerifyToken(req, res) {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        error: {
          code: 'MISSING_TOKEN',
          message: 'Token is required'
        }
      });
    }
    
    // Try to decode token
    try {
      const decodedToken = tokenEncoder.decodeToken(token);
      
      // Get the key for verification
      const key = await keyManager.getKeyById(decodedToken.keyId);
      
      if (!key) {
        return res.status(200).json({
          valid: false,
          reason: 'UNKNOWN_KEY',
          details: {
            keyId: decodedToken.keyId,
            foundKey: false
          }
        });
      }
      
      // Check if token has been redeemed
      const isRedeemed = await db.isTokenRedeemed(decodedToken.id);
      
      // Verify the signature
      const isValid = blindSignature.verify(
        Buffer.from(decodedToken.secret, 'hex'),
        Buffer.from(decodedToken.signature, 'hex'),
        key.publicKey
      );
      
      return res.status(200).json({
        valid: isValid && !isRedeemed,
        redeemed: isRedeemed,
        signatureValid: isValid,
        details: {
          id: decodedToken.id,
          keyId: decodedToken.keyId,
          denomination: decodedToken.denomination,
          secretLength: decodedToken.secret.length,
          signatureLength: decodedToken.signature.length
        }
      });
    } catch (error) {
      // Not a single token, check if it's a bundle
      try {
        const unbundledTokens = tokenEncoder.unbundleTokens(token);
        
        return res.status(200).json({
          valid: false,
          reason: 'TOKEN_BUNDLE',
          message: 'Token appears to be a bundle, use /diagnostic/unbundle endpoint',
          tokenCount: unbundledTokens.length
        });
      } catch (bundleError) {
        return res.status(200).json({
          valid: false,
          reason: 'INVALID_FORMAT',
          error: config.isDevelopment ? error.message : 'Invalid token format'
        });
      }
    }
  } catch (error) {
    console.error('Error in diagnostic token verification:', error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: config.isDevelopment ? error.message : 'Internal server error'
      }
    });
  }
}

/**
 * Diagnostic endpoint for unbundling tokens
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function diagnosticUnbundle(req, res) {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        error: {
          code: 'MISSING_TOKEN',
          message: 'Token is required'
        }
      });
    }
    
    try {
      // Try to unbundle the token
      const tokens = tokenEncoder.unbundleTokens(token);
      
      // Get high-level info about each token
      const tokenInfos = tokens.map(token => {
        try {
          const decodedToken = tokenEncoder.decodeToken(token);
          return {
            valid: true,
            id: decodedToken.id,
            keyId: decodedToken.keyId,
            denomination: decodedToken.denomination
          };
        } catch (error) {
          return {
            valid: false,
            error: config.isDevelopment ? error.message : 'Invalid token format'
          };
        }
      });
      
      return res.status(200).json({
        bundled: true,
        count: tokens.length,
        tokens: tokenInfos
      });
    } catch (error) {
      // Not a bundle, might be a single token
      try {
        const decodedToken = tokenEncoder.decodeToken(token);
        
        return res.status(200).json({
          bundled: false,
          singleToken: {
            id: decodedToken.id,
            keyId: decodedToken.keyId,
            denomination: decodedToken.denomination
          }
        });
      } catch (singleError) {
        return res.status(200).json({
          bundled: false,
          valid: false,
          error: config.isDevelopment ? error.message : 'Invalid token format'
        });
      }
    }
  } catch (error) {
    console.error('Error in diagnostic unbundle:', error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: config.isDevelopment ? error.message : 'Internal server error'
      }
    });
  }
}

/**
 * Diagnostic endpoint for detailed token analysis
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function diagnosticTokenDetail(req, res) {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        error: {
          code: 'MISSING_TOKEN',
          message: 'Token is required'
        }
      });
    }
    
    // Basic format check
    const formatInfo = {
      length: token.length,
      startsWith: token.substring(0, Math.min(10, token.length)),
      containsSpecialChars: /[^a-zA-Z0-9+/=_-]/.test(token)
    };
    
    // Try to parse as JSON
    let isJson = false;
    try {
      JSON.parse(token);
      isJson = true;
    } catch (e) {
      // Not JSON
    }
    
    // Try to parse as CBOR
    let isCbor = false;
    try {
      const buf = Buffer.from(token, 'base64');
      cbor.decode(buf);
      isCbor = true;
    } catch (e) {
      // Not CBOR
    }
    
    // Try to decode as token
    let isToken = false;
    let tokenInfo = {};
    try {
      const decodedToken = tokenEncoder.decodeToken(token);
      isToken = true;
      tokenInfo = {
        id: decodedToken.id,
        keyId: decodedToken.keyId,
        denomination: decodedToken.denomination,
        secretLength: decodedToken.secret.length,
        signatureLength: decodedToken.signature.length
      };
    } catch (e) {
      // Not a token
    }
    
    // Try to unbundle
    let isBundle = false;
    let bundleInfo = {};
    try {
      const tokens = tokenEncoder.unbundleTokens(token);
      isBundle = true;
      bundleInfo = {
        tokenCount: tokens.length
      };
    } catch (e) {
      // Not a bundle
    }
    
    return res.status(200).json({
      formatInfo,
      isJson,
      isCbor,
      isToken,
      isBundle,
      tokenInfo: isToken ? tokenInfo : null,
      bundleInfo: isBundle ? bundleInfo : null
    });
  } catch (error) {
    console.error('Error in diagnostic token detail:', error);
    res.status(500).json({
      error: {
        code: 'SERVER_ERROR',
        message: config.isDevelopment ? error.message : 'Internal server error'
      }
    });
  }
}

module.exports = {
  createToken,
  bulkCreateTokens,
  verifyToken,
  redeemToken,
  remintToken,
  splitToken,
  listDenominations,
  getOutstandingTokens,
  diagnosticVerifyToken,
  diagnosticUnbundle,
  diagnosticTokenDetail
};