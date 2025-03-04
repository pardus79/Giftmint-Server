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
    console.log('Attempting to decode token:', encodedToken);
    
    // Check if it's already a JSON string (for backward compatibility)
    if (encodedToken.startsWith('{') && encodedToken.endsWith('}')) {
      console.log('Token appears to be JSON already, parsing directly');
      return JSON.parse(encodedToken);
    }
    
    // Get default prefix from config
    const defaultPrefix = getTokenPrefix();
    console.log('Default token prefix:', defaultPrefix);
    
    // Make sure the token starts with some kind of prefix
    // We'll be flexible about the prefix to support multiple stores
    let base64Token;
    
    // Try a direct approach first with specific prefix
    if (encodedToken.startsWith('btcpins')) {
      console.log('Found btcpins prefix, cutting it off');
      base64Token = encodedToken.substring(7); // "btcpins" is 7 chars
    } else if (encodedToken.startsWith('giftmint')) {
      console.log('Found giftmint prefix, cutting it off');
      base64Token = encodedToken.substring(8); // "giftmint" is 8 chars
    } else if (encodedToken.startsWith(defaultPrefix)) {
      console.log('Found default prefix, cutting it off');
      base64Token = encodedToken.slice(defaultPrefix.length);
    } else {
      console.log('No known prefix found, searching for first base64 character');
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
        console.log('No valid base64 characters found in token');
        throw new Error('Invalid token format: no base64 characters found');
      }
      
      console.log('Found base64 characters starting at index:', prefixEndIndex);
      base64Token = encodedToken.slice(prefixEndIndex);
    }
    
    console.log('Base64 token portion:', base64Token);
    
    // Restore the URL-safe base64 to regular base64
    let standardBase64 = base64Token
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding if needed
    while (standardBase64.length % 4) {
      standardBase64 += '=';
    }
    
    console.log('Processed base64 with padding:', standardBase64);
    
    try {
      // Decode the base64 string
      const tokenBuffer = Buffer.from(standardBase64, 'base64');
      
      // Parse the JSON
      const decoded = JSON.parse(tokenBuffer.toString());
      console.log('Successfully decoded token');
      return decoded;
    } catch (innerError) {
      console.log('Error during base64 decoding or JSON parsing:', innerError.message);
      throw new Error(`Token appears to be in compact format but couldn't be decoded: ${innerError.message}`);
    }
  } catch (error) {
    console.log('Token decoding failed:', error.message);
    throw new Error(`Failed to decode token: ${error.message}`);
  }
}

module.exports = {
  encodeToken,
  decodeToken
};