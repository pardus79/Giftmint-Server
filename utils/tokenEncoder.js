'use strict';

const crypto = require('crypto');
const cbor = require('cbor');
const config = require('../config/config');

/**
 * Encodes a token into the Giftmint token format
 * @param {Object} token - The token to encode
 * @param {string} token.keyId - The key ID
 * @param {number} token.denomination - The token denomination
 * @param {string} token.secret - The secret as hex string
 * @param {string} token.signature - The signature as hex string
 * @returns {string} The encoded token
 */
function encodeToken(token) {
  // Validate token object
  if (!token.keyId || !token.denomination || !token.secret || !token.signature) {
    throw new Error('Invalid token object. Required fields: keyId, denomination, secret, signature');
  }
  
  // Create token ID from secret
  const id = generateTokenId(token.secret);
  
  // Create the token object
  const tokenObj = {
    id,
    keyId: token.keyId,
    denomination: token.denomination,
    secret: token.secret,
    signature: token.signature
  };
  
  // Convert to JSON and encode as base64
  const tokenJson = JSON.stringify(tokenObj);
  const tokenBase64 = Buffer.from(tokenJson).toString('base64url');
  
  // Add token prefix
  return `${config.token.prefix}_${tokenBase64}`;
}

/**
 * Decodes a token from the Giftmint token format
 * @param {string} encodedToken - The encoded token
 * @returns {Object} The decoded token
 */
function decodeToken(encodedToken) {
  // Validate and remove prefix
  if (!encodedToken.startsWith(`${config.token.prefix}_`)) {
    throw new Error(`Invalid token. Expected prefix ${config.token.prefix}_`);
  }
  
  const tokenBase64 = encodedToken.substring(config.token.prefix.length + 1);
  
  // Decode base64
  const tokenJson = Buffer.from(tokenBase64, 'base64url').toString('utf8');
  
  try {
    // Parse JSON
    const tokenObj = JSON.parse(tokenJson);
    
    // Validate token object
    if (!tokenObj.id || !tokenObj.keyId || 
        !tokenObj.denomination || !tokenObj.secret || 
        !tokenObj.signature) {
      throw new Error('Invalid token format. Missing required fields');
    }
    
    // Verify token ID
    const calculatedId = generateTokenId(tokenObj.secret);
    if (calculatedId !== tokenObj.id) {
      throw new Error('Invalid token. ID mismatch');
    }
    
    return tokenObj;
  } catch (error) {
    throw new Error(`Failed to decode token: ${error.message}`);
  }
}

/**
 * Generates a token ID from the secret
 * @param {string} secret - The secret as hex string
 * @returns {string} The token ID
 */
function generateTokenId(secret) {
  // Convert hex string to buffer if needed
  const secretBuffer = typeof secret === 'string' ? 
    Buffer.from(secret, 'hex') : secret;
  
  // Calculate SHA-256 hash
  return crypto.createHash('sha256')
    .update(secretBuffer)
    .digest('hex');
}

/**
 * Bundles multiple tokens into a single CBOR encoded bundle
 * @param {Array<string>} tokens - Array of encoded tokens
 * @returns {string} The token bundle as base64
 */
function bundleTokens(tokens) {
  if (!Array.isArray(tokens) || tokens.length === 0) {
    throw new Error('Tokens must be a non-empty array');
  }
  
  if (tokens.length > config.token.maxBundleSize) {
    throw new Error(`Bundle size exceeds maximum of ${config.token.maxBundleSize} tokens`);
  }
  
  // Group tokens by key ID
  const tokensByKeyId = {};
  
  for (const token of tokens) {
    try {
      const decodedToken = decodeToken(token);
      
      if (!tokensByKeyId[decodedToken.keyId]) {
        tokensByKeyId[decodedToken.keyId] = [];
      }
      
      tokensByKeyId[decodedToken.keyId].push({
        d: decodedToken.denomination,
        s: decodedToken.secret,
        sig: decodedToken.signature
      });
    } catch (error) {
      throw new Error(`Failed to process token for bundling: ${error.message}`);
    }
  }
  
  // Create bundle object
  const bundle = {
    tokens: tokensByKeyId
  };
  
  // Encode as CBOR and then as base64
  try {
    const cborBundle = cbor.encode(bundle);
    return Buffer.from(cborBundle).toString('base64url');
  } catch (error) {
    throw new Error(`Failed to encode token bundle: ${error.message}`);
  }
}

/**
 * Unbundles a token bundle into individual tokens
 * @param {string} bundle - The token bundle as base64
 * @returns {Array<string>} Array of encoded tokens
 */
function unbundleTokens(bundle) {
  try {
    // Decode base64
    const bundleBuffer = Buffer.from(bundle, 'base64url');
    
    // Decode CBOR
    const bundleObj = cbor.decode(bundleBuffer);
    
    if (!bundleObj.tokens) {
      throw new Error('Invalid bundle format. Missing tokens field');
    }
    
    const tokens = [];
    
    // Process each key ID group
    for (const [keyId, tokensList] of Object.entries(bundleObj.tokens)) {
      if (!Array.isArray(tokensList)) {
        throw new Error(`Invalid bundle format. Expected array for key ID ${keyId}`);
      }
      
      // Process each token in the group
      for (const tokenData of tokensList) {
        if (!tokenData.d || !tokenData.s || !tokenData.sig) {
          throw new Error(`Invalid token data in bundle for key ID ${keyId}`);
        }
        
        // Create token object
        const token = {
          keyId,
          denomination: tokenData.d,
          secret: tokenData.s,
          signature: tokenData.sig
        };
        
        // Encode the token
        tokens.push(encodeToken(token));
      }
    }
    
    if (tokens.length === 0) {
      throw new Error('Bundle contains no valid tokens');
    }
    
    return tokens;
  } catch (error) {
    throw new Error(`Failed to unbundle tokens: ${error.message}`);
  }
}

/**
 * Detects if a string is a token bundle or individual token
 * @param {string} tokenData - The token or bundle data
 * @returns {string} 'bundle' or 'token' or 'unknown'
 */
function detectTokenFormat(tokenData) {
  // Check for token prefix
  if (tokenData.startsWith(`${config.token.prefix}_`)) {
    return 'token';
  }
  
  // Try to decode as CBOR bundle
  try {
    const bundleBuffer = Buffer.from(tokenData, 'base64url');
    const bundleObj = cbor.decode(bundleBuffer);
    
    if (bundleObj.tokens) {
      return 'bundle';
    }
  } catch (error) {
    // Not a valid CBOR bundle
  }
  
  return 'unknown';
}

/**
 * Normalizes binary data from various formats
 * @param {string|Buffer} data - The data to normalize
 * @returns {Buffer} Normalized data as Buffer
 */
function normalizeBinaryData(data) {
  if (Buffer.isBuffer(data)) {
    return data;
  }
  
  if (typeof data === 'string') {
    // Check if it's a hex string
    if (/^[0-9a-fA-F]+$/.test(data)) {
      return Buffer.from(data, 'hex');
    }
    
    // Check if it's a base64 string
    try {
      const buf = Buffer.from(data, 'base64');
      // If decoding back to base64 gives the same result, it's likely base64
      if (buf.toString('base64') === data || 
          buf.toString('base64url') === data) {
        return buf;
      }
    } catch (e) {
      // Not base64
    }
    
    // Try to parse as comma-separated numbers
    if (data.includes(',')) {
      try {
        const numbers = data.split(',').map(n => parseInt(n.trim(), 10));
        if (numbers.every(n => !isNaN(n) && n >= 0 && n <= 255)) {
          return Buffer.from(numbers);
        }
      } catch (e) {
        // Not comma-separated numbers
      }
    }
    
    // Default to UTF-8 encoding
    return Buffer.from(data, 'utf8');
  }
  
  if (Array.isArray(data)) {
    return Buffer.from(data);
  }
  
  throw new Error('Cannot normalize data of type ' + typeof data);
}

module.exports = {
  encodeToken,
  decodeToken,
  generateTokenId,
  bundleTokens,
  unbundleTokens,
  detectTokenFormat,
  normalizeBinaryData
};