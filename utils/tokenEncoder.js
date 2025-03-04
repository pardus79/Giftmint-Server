/**
 * Token encoder/decoder utility for more compact token representation
 */
const config = require('../config/config');

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
 * Decodes a compact token string back into an object
 * 
 * @param {string} encodedToken - The encoded token string
 * @returns {Object} The decoded token object
 */
function decodeToken(encodedToken) {
  try {
    // Get default prefix from config
    const defaultPrefix = getTokenPrefix();
    
    // Make sure the token starts with some kind of prefix
    // We'll be flexible about the prefix to support multiple stores
    let base64Token;
    
    if (encodedToken.startsWith(defaultPrefix)) {
      // Default prefix from config
      base64Token = encodedToken.slice(defaultPrefix.length);
    } else {
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
        throw new Error('Invalid token format');
      }
      
      // Check if the rest of the string only contains valid base64url chars
      const potentialBase64 = encodedToken.slice(prefixEndIndex);
      if (!/^[A-Za-z0-9\-_]+$/.test(potentialBase64)) {
        throw new Error('Invalid token format: contains non-base64url characters');
      }
      
      base64Token = potentialBase64;
    }
    
    // Restore the URL-safe base64 to regular base64
    let standardBase64 = base64Token
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding if needed
    while (standardBase64.length % 4) {
      standardBase64 += '=';
    }
    
    // Decode the base64 string
    const tokenBuffer = Buffer.from(standardBase64, 'base64');
    
    // Parse the JSON
    return JSON.parse(tokenBuffer.toString());
  } catch (error) {
    throw new Error(`Failed to decode token: ${error.message}`);
  }
}

module.exports = {
  encodeToken,
  decodeToken
};