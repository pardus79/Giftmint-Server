/**
 * Token encoder/decoder utility for more compact token representation
 */
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

/**
 * Get the token prefix to use
 * 
 * @param {string} [customPrefix] - Optional custom prefix to use
 * @returns {string} The token prefix
 */
function getTokenPrefix(customPrefix) {
  // Use provided custom prefix, or the one from config, or default to 'giftmint'
  return customPrefix || config.token.prefix || 'giftmint';
}

/**
 * Encodes a token into a compact string format
 * 
 * @param {Object} token - The token object to encode
 * @param {string} [customPrefix] - Optional custom prefix to use
 * @returns {string} A compact token string
 */
function encodeToken(token, customPrefix) {
  try {
    // Convert token to a buffer
    const tokenBuffer = Buffer.from(JSON.stringify(token));
    
    // Base64 encode the token
    const base64Token = tokenBuffer.toString('base64');
    
    // Replace characters that might cause issues in URLs or when displayed
    const urlSafeToken = base64Token
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    // Add a prefix to identify our tokens
    const prefix = getTokenPrefix(customPrefix);
    return `${prefix}${urlSafeToken}`;
  } catch (error) {
    throw new Error(`Failed to encode token: ${error.message}`);
  }
}

/**
 * Bundle multiple tokens into a single string for easy sharing
 * 
 * @param {Array<string>} tokens - Array of encoded token strings
 * @param {string} [customPrefix] - Optional custom prefix to use
 * @returns {string} A bundled token string
 */
function bundleTokens(tokens, customPrefix) {
  try {
    if (!Array.isArray(tokens)) {
      throw new Error('Tokens must be an array');
    }
    
    if (tokens.length === 0) {
      throw new Error('No tokens to bundle');
    }
    
    if (tokens.length === 1) {
      // No need to bundle a single token
      return tokens[0];
    }
    
    // Create a bundle object with version and tokens
    const bundle = {
      v: 1, // Version for future compatibility
      tokens: tokens,
      count: tokens.length,
      created: Date.now()
    };
    
    // Convert to buffer
    const bundleBuffer = Buffer.from(JSON.stringify(bundle));
    
    // Base64 encode
    const base64Bundle = bundleBuffer.toString('base64');
    
    // URL-safe encoding
    const urlSafeBundle = base64Bundle
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
    
    // Add bundle prefix
    const prefix = getTokenPrefix(customPrefix);
    return `${prefix}bundle-${urlSafeBundle}`;
  } catch (error) {
    logger.error({ error }, 'Failed to bundle tokens');
    throw new Error(`Failed to bundle tokens: ${error.message}`);
  }
}

/**
 * Decodes a compact token string back into an object
 * 
 * @param {string} encodedToken - The encoded token string
 * @returns {Object} The decoded token object
 */
function decodeToken(encodedToken) {
  try {
    logger.debug({ token: encodedToken.substring(0, 20) + '...' }, 'Attempting to decode token');
    
    // Check if it's already a JSON string (for backward compatibility)
    if (encodedToken.startsWith('{') && encodedToken.endsWith('}')) {
      logger.debug('Token appears to be JSON already, parsing directly');
      return JSON.parse(encodedToken);
    }
    
    // Check if it's a bundle
    if (encodedToken.includes('bundle-')) {
      logger.debug('Token appears to be a bundle, attempting to unbundle');
      return unbundleTokens(encodedToken);
    }
    
    // Get default prefix from config
    const defaultPrefix = getTokenPrefix();
    logger.debug({ defaultPrefix }, 'Default token prefix');
    
    // Make sure the token starts with some kind of prefix
    // We'll be flexible about the prefix to support multiple stores
    let base64Token;
    
    // Try a direct approach first with specific prefix
    if (encodedToken.startsWith('btcpins')) {
      logger.debug('Found btcpins prefix, cutting it off');
      base64Token = encodedToken.substring(7); // "btcpins" is 7 chars
    } else if (encodedToken.startsWith('giftmint')) {
      logger.debug('Found giftmint prefix, cutting it off');
      base64Token = encodedToken.substring(8); // "giftmint" is 8 chars
    } else if (encodedToken.startsWith(defaultPrefix)) {
      logger.debug('Found default prefix, cutting it off');
      base64Token = encodedToken.slice(defaultPrefix.length);
    } else {
      logger.debug('No known prefix found, searching for first base64 character');
      // Find the first occurrence of a base64 character
      // This allows any prefix to be used without hardcoding specific values
      // Check for all characters used in URL-safe base64: A-Z, a-z, 0-9, -, _
      let prefixEndIndex = -1;
      for (let i = 0; i < encodedToken.length; i++) {
        const char = encodedToken[i];
        if ((char >= 'A' && char <= 'Z') || 
            (char >= 'a' && char <= 'z') || 
            (char >= '0' && char <= '9') ||
            char === '-' || char === '_') {
          prefixEndIndex = i;
          break;
        }
      }
      
      if (prefixEndIndex === -1) {
        logger.warn('No valid base64 characters found in token');
        throw new Error('Invalid token format: no base64 characters found');
      }
      
      logger.debug({ prefixEndIndex }, 'Found base64 characters starting at index');
      base64Token = encodedToken.slice(prefixEndIndex);
    }
    
    logger.debug({ base64Token: base64Token.substring(0, 20) + '...' }, 'Base64 token portion');
    
    // Restore the URL-safe base64 to regular base64
    let standardBase64 = base64Token
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding if needed
    while (standardBase64.length % 4) {
      standardBase64 += '=';
    }
    
    logger.debug({ standardBase64: standardBase64.substring(0, 20) + '...' }, 'Processed base64 with padding');
    
    try {
      // Decode the base64 string
      const tokenBuffer = Buffer.from(standardBase64, 'base64');
      
      // Parse the JSON
      const decoded = JSON.parse(tokenBuffer.toString());
      logger.debug('Successfully decoded token');
      return decoded;
    } catch (innerError) {
      logger.error({ error: innerError }, 'Error during base64 decoding or JSON parsing');
      throw new Error(`Token appears to be in compact format but couldn't be decoded: ${innerError.message}`);
    }
  } catch (error) {
    logger.error({ error }, 'Token decoding failed');
    throw new Error(`Failed to decode token: ${error.message}`);
  }
}

/**
 * Unbundle a token bundle into individual tokens
 * 
 * @param {string} bundleString - The bundled token string
 * @returns {Object} The unbundled tokens
 */
function unbundleTokens(bundleString) {
  try {
    logger.debug({ bundle: bundleString.substring(0, 20) + '...' }, 'Unbundling tokens');
    
    // Find bundle identifier
    const bundleMarker = 'bundle-';
    const bundleIndex = bundleString.indexOf(bundleMarker);
    
    if (bundleIndex === -1) {
      logger.warn('Not a bundle - bundle marker not found');
      throw new Error('Not a valid token bundle');
    }
    
    // Extract the base64 part
    const base64Bundle = bundleString.slice(bundleIndex + bundleMarker.length);
    logger.debug({ base64Bundle: base64Bundle.substring(0, 20) + '...' }, 'Extracted base64 bundle');
    
    // Restore the URL-safe base64 to regular base64
    let standardBase64 = base64Bundle
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding if needed
    while (standardBase64.length % 4) {
      standardBase64 += '=';
    }
    
    // Decode the base64 string
    const bundleBuffer = Buffer.from(standardBase64, 'base64');
    
    // Parse the JSON
    const bundle = JSON.parse(bundleBuffer.toString());
    logger.debug({ bundleVersion: bundle.v, tokenCount: bundle.count }, 'Successfully decoded bundle');
    
    return bundle;
  } catch (error) {
    logger.error({ error }, 'Failed to unbundle tokens');
    throw new Error(`Failed to unbundle tokens: ${error.message}`);
  }
}

module.exports = {
  encodeToken,
  decodeToken,
  bundleTokens,
  unbundleTokens
};