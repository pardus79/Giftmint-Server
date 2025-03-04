/**
 * Token encoder/decoder utility for more compact token representation
 */

/**
 * Encodes a token into a compact string format
 * 
 * @param {Object} token - The token object to encode
 * @returns {string} A compact token string
 */
function encodeToken(token) {
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
    return `giftmint${urlSafeToken}`;
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
    // Check if it's our token format
    if (!encodedToken.startsWith('giftmint')) {
      throw new Error('Invalid token format');
    }
    
    // Remove the prefix
    const base64Token = encodedToken.slice(8);
    
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