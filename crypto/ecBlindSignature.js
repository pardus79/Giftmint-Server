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
  if (input instanceof Uint8Array) {
    return input;
  }
  
  if (Buffer.isBuffer(input)) {
    return new Uint8Array(input);
  }
  
  if (typeof input === 'string') {
    return new Uint8Array(Buffer.from(input, encoding));
  }
  
  if (Array.isArray(input)) {
    return new Uint8Array(input);
  }
  
  throw new Error(`Cannot convert ${typeof input} to Uint8Array`);
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
    // Use the helper to ensure uniform type handling
    const Y_uint8 = toUint8Array(Y);
    const blindingFactor_uint8 = toUint8Array(blindingFactor);
    
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
    
    logger.debug({
      YPrefix: Buffer.from(Y_uint8).slice(0, 5).toString('hex'),
      rGPrefix: Buffer.from(rG).slice(0, 5).toString('hex'),
      B_Prefix: Buffer.from(B_).slice(0, 5).toString('hex')
    }, 'Blinded message');
    
    return B_;
  } catch (error) {
    logger.error({ error }, 'Failed to blind message');
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
    // Convert inputs to Uint8Array using our helper
    const B_uint8 = toUint8Array(B_);
    const k_uint8 = toUint8Array(k);
    
    // Log for debugging
    logger.debug({
      B_uint8_length: B_uint8.length,
      k_uint8_length: k_uint8.length,
    }, 'Sign blinded message inputs');
    
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
    
    logger.debug({
      B_Prefix: Buffer.from(B_uint8).slice(0, 5).toString('hex'),
      C_Prefix: Buffer.from(C_).slice(0, 5).toString('hex')
    }, 'Generated blind signature');
    
    return C_;
  } catch (error) {
    logger.error({ error }, 'Failed to sign blinded message');
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
    // Convert all inputs to Uint8Array using our helper
    const C_uint8 = toUint8Array(C_);
    const blindingFactor_uint8 = toUint8Array(blindingFactor);
    const K_uint8 = toUint8Array(K);
    
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
    
    logger.debug({
      C_Prefix: Buffer.from(C_uint8).slice(0, 5).toString('hex'),
      rKPrefix: Buffer.from(rK).slice(0, 5).toString('hex'),
      CPrefix: Buffer.from(C).slice(0, 5).toString('hex')
    }, 'Unblinded signature');
    
    return C;
  } catch (error) {
    logger.error({ error }, 'Failed to unblind signature');
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
    // Convert inputs to Uint8Array using our helper
    const C_ = toUint8Array(blindSignature, 'hex');
    const blindingFactor = toUint8Array(tokenRequest.blindingFactor, 'hex');
    const K = toUint8Array(publicKey, 'hex');
    
    // Unblind the signature
    const C = unblindSignature(C_, blindingFactor, K);
    
    // Verify signature correctness
    // Note: Full verification requires the private key, which we don't have on the client side
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
    logger.error({ error }, 'Failed to process signed token');
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