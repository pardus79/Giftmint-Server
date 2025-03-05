/**
 * Blind Diffie-Hellman Key Exchange for e-cash gift certificates
 * 
 * This module implements the Blind Diffie-Hellman Key Exchange protocol
 * for secure and compact gift certificate token creation and verification.
 * This is a private implementation not compatible with external systems.
 */

const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const secp256k1 = require('secp256k1');
const pino = require('pino');
const config = require('../config/config');

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
 * Helper function to ensure an input is converted to Uint8Array
 * 
 * @param {Buffer|Uint8Array|string} input - Input to convert
 * @param {string} [encoding] - Encoding if input is string (default: 'hex')
 * @returns {Uint8Array} Uint8Array representation
 */
function toUint8Array(input, encoding = 'hex') {
  // Catch null/undefined early
  if (input === null || input === undefined) {
    logger.error('Null or undefined input passed to toUint8Array');
    throw new Error('Input to toUint8Array cannot be null or undefined');
  }
  
  try {
    // Log details about the input for debugging
    const inputType = typeof input;
    const isUint8Array = input instanceof Uint8Array;
    const isBuffer = Buffer.isBuffer(input);
    const isString = typeof input === 'string';
    const isArray = Array.isArray(input);
    const length = input.length !== undefined ? input.length : 'unknown';
    
    logger.debug({
      inputType,
      isUint8Array,
      isBuffer,
      isString,
      isArray,
      length,
      sample: isString ? input.slice(0, 20) + '...' : 'not a string'
    }, 'toUint8Array input details');
    
    // Handle each type
    if (isUint8Array) {
      return input;
    }
    
    if (isBuffer) {
      return new Uint8Array(input);
    }
    
    if (isString) {
      // Handle empty strings
      if (input.length === 0) {
        logger.error('Empty string passed to toUint8Array');
        throw new Error('Empty string input to toUint8Array');
      }
      
      // Check if this is a comma-separated string (toString() artifact)
      if (input.includes(',')) {
        logger.warn('Comma-separated string detected, attempting to convert');
        try {
          // Try to convert comma-separated string to proper hex
          // This happens when .toString() is called on a Buffer without specifying 'hex'
          return new Uint8Array(input.split(',').map(Number));
        } catch (e) {
          logger.error('Failed to convert comma-separated string');
          throw new Error('Invalid comma-separated string');
        }
      }
      
      return new Uint8Array(Buffer.from(input, encoding));
    }
    
    if (isArray) {
      // Handle empty arrays
      if (input.length === 0) {
        logger.error('Empty array passed to toUint8Array');
        throw new Error('Empty array input to toUint8Array');
      }
      return new Uint8Array(input);
    }
    
    // If we get here, we couldn't handle the type
    logger.error(`Cannot convert ${inputType} to Uint8Array`, { input: JSON.stringify(input) });
    throw new Error(`Cannot convert ${inputType} to Uint8Array`);
  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack,
      inputType: typeof input
    }, 'Error in toUint8Array conversion');
    throw error;
  }
}

// Domain separator for hash_to_curve (private to this implementation)
const DOMAIN_SEPARATOR = Buffer.from('Secp256k1_HashToCurve_Giftmint_');

/**
 * Maps a message to a point on the secp256k1 curve, using the specified domain separator
 * 
 * @param {Buffer|string} message - Message to hash to curve
 * @returns {Uint8Array} Public key point on curve
 */
function hashToCurve(message) {
  // Convert message to Buffer if it's a string
  const messageBuffer = typeof message === 'string' 
    ? Buffer.from(message, 'utf8') 
    : Buffer.from(message);
  
  // Create the message hash with domain separator
  const msgHash = crypto.createHash('sha256')
    .update(Buffer.concat([DOMAIN_SEPARATOR, messageBuffer]))
    .digest();
  
  // Try to find a valid point by incrementing counter
  let counter = 0;
  while (counter < 1000) { // Limit iterations for safety
    // Create counter as 4-byte little-endian
    const counterBuf = Buffer.alloc(4);
    counterBuf.writeUInt32LE(counter, 0);
    
    // Hash with counter
    const attempt = crypto.createHash('sha256')
      .update(Buffer.concat([msgHash, counterBuf]))
      .digest();
    
    // Prepend 0x02 to make a compressed public key format
    const candidateKey = Buffer.concat([Buffer.from([0x02]), attempt]);
    
    // Convert to Uint8Array for secp256k1
    const candidateKeyUint8 = new Uint8Array(candidateKey);
    
    // Check if it's a valid secp256k1 point
    try {
      if (secp256k1.publicKeyVerify(candidateKeyUint8)) {
        logger.debug({
          counter,
          candidateKeyPrefix: Buffer.from(candidateKeyUint8.slice(0, 5)).toString('hex')
        }, 'Found valid curve point');
        return candidateKeyUint8;
      }
    } catch (error) {
      // Not a valid point, try next counter
    }
    
    counter++;
  }
  
  throw new Error('Failed to hash to curve after 1000 iterations');
}

/**
 * Generate a token with random secret and blinding factor
 * 
 * @returns {Object} Token with secret, Y (point), and blinding factor
 */
function generateToken() {
  try {
    // Generate a random secret (64 character hex string = 32 bytes)
    const secret = crypto.randomBytes(32).toString('hex');
    
    // Map secret to a point on the curve
    const Y = hashToCurve(secret);
    
    // Generate random blinding factor (32 bytes)
    const blindingFactor = crypto.randomBytes(32);
    
    // Ensure blinding factor is a valid scalar for secp256k1
    const r = new Uint8Array(blindingFactor);
    if (!secp256k1.privateKeyVerify(r)) {
      // Recursive call to generate a valid blinding factor
      return generateToken();
    }
    
    return {
      id: uuidv4(), // Token request ID
      secret,
      Y,
      blindingFactor: Buffer.from(r)
    };
  } catch (error) {
    logger.error({ error }, 'Failed to generate token');
    throw error;
  }
}

/**
 * Blind a message using BDHKE
 * 
 * @param {Buffer|Uint8Array} Y - Point on curve corresponding to secret
 * @param {Buffer|Uint8Array} blindingFactor - Random blinding factor
 * @returns {Uint8Array} Blinded message B_
 */
function blindMessage(Y, blindingFactor) {
  try {
    // First make sure we have valid inputs
    logger.debug({
      YExists: !!Y,
      YType: typeof Y,
      YIsArray: Array.isArray(Y),
      YIsUint8Array: Y instanceof Uint8Array,
      YIsBuffer: Buffer.isBuffer(Y),
      YLength: Y ? Y.length : 'null',
      bfExists: !!blindingFactor,
      bfType: typeof blindingFactor,
      bfIsArray: Array.isArray(blindingFactor),
      bfIsUint8Array: blindingFactor instanceof Uint8Array,
      bfIsBuffer: Buffer.isBuffer(blindingFactor),
      bfLength: blindingFactor ? blindingFactor.length : 'null'
    }, 'Input validation for blindMessage');
    
    // Use the helper to ensure uniform type handling
    const Y_uint8 = toUint8Array(Y);
    const blindingFactor_uint8 = toUint8Array(blindingFactor);
    
    // Additional input validation
    if (Y_uint8.length === 0) {
      throw new Error('Empty point Y provided to blindMessage');
    }
    
    if (blindingFactor_uint8.length === 0) {
      throw new Error('Empty blinding factor provided to blindMessage');
    }
    
    // Log after conversion
    logger.debug({
      Y_uint8Length: Y_uint8.length,
      blindingFactor_uint8Length: blindingFactor_uint8.length
    }, 'After conversion to Uint8Array');
    
    // Verify the public key is valid
    if (!secp256k1.publicKeyVerify(Y_uint8)) {
      throw new Error('Invalid point Y');
    }
    
    // Verify the private key (blinding factor) is valid
    if (!secp256k1.privateKeyVerify(blindingFactor_uint8)) {
      throw new Error('Invalid blinding factor');
    }
    
    // Generate point rG (blinding factor * generator)
    const rG = secp256k1.publicKeyCreate(blindingFactor_uint8);
    
    // Calculate B_ = Y + rG (point addition)
    const B_ = secp256k1.publicKeyCombine([Y_uint8, rG]);
    
    // Verify our result
    if (!B_ || B_.length === 0) {
      throw new Error('Generated an empty blinded message');
    }
    
    logger.debug({
      YPrefix: Buffer.from(Y_uint8).slice(0, 5).toString('hex'),
      rGPrefix: Buffer.from(rG).slice(0, 5).toString('hex'),
      B_Prefix: Buffer.from(B_).slice(0, 5).toString('hex'),
      B_Length: B_.length
    }, 'Blinded message');
    
    return B_;
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Failed to blind message');
    throw error;
  }
}

/**
 * Sign a blinded message using BDHKE
 * 
 * @param {Buffer|Uint8Array} B_ - Blinded message
 * @param {Buffer|Uint8Array} k - Private key
 * @returns {Uint8Array} Blind signature C_
 */
function signBlindedMessage(B_, k) {
  try {
    // First make sure we have valid inputs
    logger.debug({
      B_Exists: !!B_,
      B_Type: typeof B_,
      B_IsArray: Array.isArray(B_),
      B_IsUint8Array: B_ instanceof Uint8Array,
      B_IsBuffer: Buffer.isBuffer(B_),
      B_Length: B_ ? B_.length : 'null',
      B_Hex: B_ ? Buffer.from(B_).toString('hex').slice(0, 20) + '...' : 'null',
      kExists: !!k,
      kType: typeof k,
      kIsArray: Array.isArray(k),
      kIsUint8Array: k instanceof Uint8Array,
      kIsBuffer: Buffer.isBuffer(k),
      kLength: k ? k.length : 'null'
    }, 'Input validation for signBlindedMessage');
    
    // Early validation
    if (!B_ || (B_ instanceof Uint8Array && B_.length === 0)) {
      throw new Error('Empty blinded message B_ provided to signBlindedMessage');
    }
    
    if (!k || (k instanceof Uint8Array && k.length === 0)) {
      throw new Error('Empty private key k provided to signBlindedMessage');
    }
    
    // Convert inputs to Uint8Array using our helper
    const B_uint8 = toUint8Array(B_);
    const k_uint8 = toUint8Array(k);
    
    // Log after conversion
    logger.debug({
      B_uint8_length: B_uint8.length,
      B_uint8_hex: B_uint8.length > 0 ? Buffer.from(B_uint8).toString('hex').slice(0, 20) + '...' : 'empty',
      k_uint8_length: k_uint8.length,
    }, 'After conversion to Uint8Array');
    
    // Additional validation
    if (B_uint8.length === 0) {
      throw new Error('Empty blinded message after conversion');
    }
    
    if (k_uint8.length === 0) {
      throw new Error('Empty private key after conversion');
    }
    
    // Ensure B_ is a valid point
    if (!secp256k1.publicKeyVerify(B_uint8)) {
      throw new Error('Invalid blinded message B_');
    }
    
    // Ensure k is a valid scalar
    if (!secp256k1.privateKeyVerify(k_uint8)) {
      throw new Error('Invalid private key k');
    }
    
    // Calculate C_ = kB_ (point multiplication)
    const C_ = secp256k1.publicKeyTweakMul(B_uint8, k_uint8);
    
    // Verify result
    if (!C_ || C_.length === 0) {
      throw new Error('Generated an empty signature');
    }
    
    logger.debug({
      B_Prefix: Buffer.from(B_uint8).slice(0, 5).toString('hex'),
      C_Prefix: Buffer.from(C_).slice(0, 5).toString('hex'),
      C_Length: C_.length
    }, 'Generated blind signature');
    
    return C_;
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Failed to sign blinded message');
    throw error;
  }
}

/**
 * Unblind a blind signature
 * 
 * @param {Buffer|Uint8Array} C_ - Blind signature
 * @param {Buffer|Uint8Array} blindingFactor - Blinding factor used to blind the message
 * @param {Buffer|Uint8Array} K - Public key corresponding to private key k
 * @returns {Uint8Array} Unblinded signature C
 */
function unblindSignature(C_, blindingFactor, K) {
  try {
    // Debug the inputs
    logger.info({
      C_Type: typeof C_,
      C_IsUint8Array: C_ instanceof Uint8Array,
      C_Length: C_ ? C_.length : 0,
      C_Sample: C_ && C_.length > 0 ? Buffer.from(C_).toString('hex').slice(0, 20) : 'empty',
      bfType: typeof blindingFactor,
      bfIsUint8Array: blindingFactor instanceof Uint8Array,
      bfLength: blindingFactor ? blindingFactor.length : 0,
      KType: typeof K,
      KIsUint8Array: K instanceof Uint8Array,
      KLength: K ? K.length : 0,
      KSample: K && K.length > 0 ? Buffer.from(K).toString('hex').slice(0, 20) : 'empty'
    }, 'Unblind signature inputs');
    
    // Early validation
    if (!C_ || C_.length === 0) {
      throw new Error('Empty blind signature provided to unblindSignature');
    }
    
    if (!blindingFactor || blindingFactor.length === 0) {
      throw new Error('Empty blinding factor provided to unblindSignature');
    }
    
    if (!K || K.length === 0) {
      throw new Error('Empty public key provided to unblindSignature');
    }
    
    // Convert all inputs to Uint8Array using our helper
    const C_uint8 = toUint8Array(C_);
    const blindingFactor_uint8 = toUint8Array(blindingFactor);
    const K_uint8 = toUint8Array(K);
    
    // Log after conversion
    logger.debug({
      C_uint8Length: C_uint8.length,
      blindingFactor_uint8Length: blindingFactor_uint8.length,
      K_uint8Length: K_uint8.length
    }, 'After conversion to Uint8Array');
    
    // Additional validation
    if (C_uint8.length === 0) {
      throw new Error('Empty blind signature after conversion');
    }
    
    if (blindingFactor_uint8.length === 0) {
      throw new Error('Empty blinding factor after conversion');
    }
    
    if (K_uint8.length === 0) {
      throw new Error('Empty public key after conversion');
    }
    
    // Ensure C_ is a valid point
    if (!secp256k1.publicKeyVerify(C_uint8)) {
      throw new Error('Invalid blind signature C_');
    }
    
    // Ensure blinding factor is a valid scalar
    if (!secp256k1.privateKeyVerify(blindingFactor_uint8)) {
      throw new Error('Invalid blinding factor');
    }
    
    // Ensure K is a valid point
    if (!secp256k1.publicKeyVerify(K_uint8)) {
      throw new Error('Invalid public key K');
    }
    
    // Calculate rK (point multiplication)
    const rK = secp256k1.publicKeyTweakMul(K_uint8, blindingFactor_uint8);
    
    // Negate rK (for point subtraction)
    const negRK = secp256k1.publicKeyNegate(rK);
    
    // Calculate C = C_ - rK (point addition with negated rK)
    const C = secp256k1.publicKeyCombine([C_uint8, negRK]);
    
    // Validate result
    if (!C || C.length === 0) {
      throw new Error('Generated an empty unblinded signature');
    }
    
    logger.debug({
      C_Prefix: Buffer.from(C_uint8).slice(0, 5).toString('hex'),
      rKPrefix: Buffer.from(rK).slice(0, 5).toString('hex'),
      CPrefix: Buffer.from(C).slice(0, 5).toString('hex'),
      CLength: C.length
    }, 'Unblinded signature');
    
    return C;
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Failed to unblind signature');
    throw error;
  }
}

/**
 * Verify a signature
 * 
 * @param {string} secret - Original secret message
 * @param {Buffer|Uint8Array} C - Signature to verify
 * @param {Buffer|Uint8Array} k - Private key
 * @returns {boolean} True if signature is valid
 */
function verifySignature(secret, C, k) {
  try {
    // Map secret to curve point
    const Y = hashToCurve(secret);
    
    // Convert inputs to Uint8Array using our helper
    const C_uint8 = toUint8Array(C);
    const k_uint8 = toUint8Array(k);
    
    // Calculate expected signature kY
    const expectedC = secp256k1.publicKeyTweakMul(Y, k_uint8);
    
    // Compare signatures (must compare hex strings as Buffer comparison is reference-based)
    const isValid = Buffer.from(C_uint8).toString('hex') === Buffer.from(expectedC).toString('hex');
    
    logger.debug({
      YPrefix: Buffer.from(Y).slice(0, 5).toString('hex'),
      CPrefix: Buffer.from(C_uint8).slice(0, 5).toString('hex'),
      expectedCPrefix: Buffer.from(expectedC).slice(0, 5).toString('hex'),
      isValid
    }, 'Verified signature');
    
    return isValid;
  } catch (error) {
    logger.error({ error }, 'Failed to verify signature');
    return false;
  }
}

/**
 * Create a token request
 * 
 * @param {string} keysetId - Keyset ID to request signature from
 * @returns {Object} Token request with blinded message
 */
function createTokenRequest(keysetId) {
  try {
    // Generate token
    const token = generateToken();
    
    // Extract Y point from secret
    const Y = hashToCurve(token.secret);
    
    // Add debug logging
    logger.info({
      YType: typeof Y,
      YIsUint8Array: Y instanceof Uint8Array,
      YLength: Y ? Y.length : 'undefined',
      blindingFactorType: typeof token.blindingFactor,
      blindingFactorIsBuffer: Buffer.isBuffer(token.blindingFactor),
      blindingFactorLength: token.blindingFactor ? token.blindingFactor.length : 'undefined'
    }, 'Debug before blindMessage');
    
    // Blind the message
    const B_ = blindMessage(Y, token.blindingFactor);
    
    // Add debug logging for the resulting blinded message
    logger.info({
      B_Type: typeof B_,
      B_IsUint8Array: B_ instanceof Uint8Array,
      B_Length: B_ ? B_.length : 0,
      B_FirstFewBytes: B_ && B_.length > 0 ? Buffer.from(B_.slice(0, 5)).toString('hex') : 'empty'
    }, 'Blinded message result');
    
    // Make sure we're converting a proper Uint8Array to hex string
    const blindedMessageHex = B_ instanceof Uint8Array && B_.length > 0 ? 
      Buffer.from(B_).toString('hex') : '';
      
    logger.info({
      blindedMessageHexLength: blindedMessageHex.length,
      blindedMessageHexPrefix: blindedMessageHex.slice(0, 10)
    }, 'Blind message hex conversion');
    
    return {
      id: token.id,
      keysetId,
      secret: token.secret,
      blindedMessage: blindedMessageHex,
      blindingFactor: token.blindingFactor.toString('hex')
    };
  } catch (error) {
    logger.error({ error }, 'Failed to create token request');
    throw error;
  }
}

/**
 * Process a signed token
 * 
 * @param {Object} tokenRequest - Token request from createTokenRequest
 * @param {string} blindSignature - Hex string blind signature
 * @param {string} publicKey - Hex string public key
 * @returns {Object} Completed token
 */
function processSignedToken(tokenRequest, blindSignature, publicKey) {
  try {
    // Debug the inputs
    logger.info({
      blindSignatureType: typeof blindSignature,
      blindSignatureLength: blindSignature ? blindSignature.length : 0,
      blindSignaturePrefix: typeof blindSignature === 'string' ? blindSignature.slice(0, 20) : 'not a string',
      publicKeyType: typeof publicKey,
      publicKeyLength: publicKey ? publicKey.length : 0,
      publicKeyPrefix: typeof publicKey === 'string' ? publicKey.slice(0, 20) : 'not a string',
      tokenRequestKeys: tokenRequest ? Object.keys(tokenRequest) : [],
      blindingFactorLength: tokenRequest && tokenRequest.blindingFactor ? tokenRequest.blindingFactor.length : 0
    }, 'Process signed token inputs');
    
    // Safely convert inputs to Uint8Array using our helper
    let C_ = null;
    let blindingFactor = null;
    let K = null;
    
    try {
      // Check if blindSignature is a valid hex string (should be digits and a-f only)
      if (typeof blindSignature === 'string' && !/^[0-9a-f]+$/i.test(blindSignature)) {
        logger.error({ 
          blindSignature: blindSignature.substring(0, 30),
          isValidHex: /^[0-9a-f]+$/i.test(blindSignature)
        }, 'blindSignature is not a valid hex string');
        throw new Error('blindSignature is not a valid hex string');
      }
      
      C_ = toUint8Array(blindSignature, 'hex');
      logger.debug({ C_Length: C_.length }, 'Converted blindSignature to Uint8Array');
    } catch (e) {
      logger.error({ error: e.message }, 'Failed to convert blindSignature to Uint8Array');
      throw new Error('Invalid blind signature format');
    }
    
    try {
      blindingFactor = toUint8Array(tokenRequest.blindingFactor, 'hex');
      logger.debug({ blindingFactorLength: blindingFactor.length }, 'Converted blindingFactor to Uint8Array');
    } catch (e) {
      logger.error({ error: e.message }, 'Failed to convert blindingFactor to Uint8Array');
      throw new Error('Invalid blinding factor format');
    }
    
    try {
      // Check if publicKey is a valid hex string (should be digits and a-f only)
      if (typeof publicKey === 'string' && !/^[0-9a-f]+$/i.test(publicKey)) {
        logger.error({ 
          publicKey: publicKey.substring(0, 30),
          isValidHex: /^[0-9a-f]+$/i.test(publicKey)
        }, 'publicKey is not a valid hex string');
        throw new Error('publicKey is not a valid hex string');
      }
      
      K = toUint8Array(publicKey, 'hex');
      logger.debug({ KLength: K.length }, 'Converted publicKey to Uint8Array');
    } catch (e) {
      logger.error({ error: e.message }, 'Failed to convert publicKey to Uint8Array');
      throw new Error('Invalid public key format');
    }
    
    // Additional validation
    if (C_.length === 0) throw new Error('Empty blind signature');
    if (blindingFactor.length === 0) throw new Error('Empty blinding factor');
    if (K.length === 0) throw new Error('Empty public key');
    
    // Unblind the signature
    const C = unblindSignature(C_, blindingFactor, K);
    
    // Verify the unblinded signature is valid
    if (!C || C.length === 0) {
      throw new Error('Unblinded signature is empty');
    }
    
    // Verify signature correctness
    // This is just a basic structure check
    if (!secp256k1.publicKeyVerify(C)) {
      throw new Error('Invalid unblinded signature structure');
    }
    
    // Create completed token
    return {
      id: tokenRequest.id,
      secret: tokenRequest.secret,
      signature: Buffer.from(C).toString('hex'),
      keysetId: tokenRequest.keysetId
    };
  } catch (error) {
    logger.error({ error: error.message, stack: error.stack }, 'Failed to process signed token');
    throw error;
  }
}

module.exports = {
  hashToCurve,
  generateToken,
  blindMessage,
  signBlindedMessage,
  unblindSignature,
  verifySignature,
  createTokenRequest,
  processSignedToken
};