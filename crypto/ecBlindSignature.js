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

// Domain separator for hash_to_curve (private to this implementation)
const DOMAIN_SEPARATOR = Buffer.from('Secp256k1_HashToCurve_Giftmint_');

/**
 * Maps a message to a point on the secp256k1 curve, using the specified domain separator
 * 
 * @param {Buffer|string} message - Message to hash to curve
 * @returns {Buffer} Public key point on curve
 */
function hashToCurve(message) {
  if (typeof message === 'string') {
    message = Buffer.from(message, 'utf8');
  }
  
  // Create the message hash with domain separator
  const msgHash = crypto.createHash('sha256')
    .update(Buffer.concat([DOMAIN_SEPARATOR, message]))
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
    
    // Check if it's a valid secp256k1 point
    try {
      if (secp256k1.publicKeyVerify(candidateKey)) {
        logger.debug({
          counter,
          candidateKeyPrefix: candidateKey.slice(0, 5).toString('hex')
        }, 'Found valid curve point');
        return candidateKey;
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
 * @param {Buffer} Y - Point on curve corresponding to secret
 * @param {Buffer} blindingFactor - Random blinding factor
 * @returns {Buffer} Blinded message B_
 */
function blindMessage(Y, blindingFactor) {
  try {
    // Ensure Y is a valid public key
    if (!secp256k1.publicKeyVerify(Y)) {
      throw new Error('Invalid point Y');
    }
    
    // Ensure blinding factor is a valid scalar
    if (!secp256k1.privateKeyVerify(blindingFactor)) {
      throw new Error('Invalid blinding factor');
    }
    
    // Generate point rG (blinding factor * generator)
    const rG = secp256k1.publicKeyCreate(blindingFactor);
    
    // Calculate B_ = Y + rG (point addition)
    const B_ = secp256k1.publicKeyCombine([Y, rG]);
    
    logger.debug({
      YPrefix: Y.slice(0, 5).toString('hex'),
      rGPrefix: rG.slice(0, 5).toString('hex'),
      B_Prefix: B_.slice(0, 5).toString('hex')
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
 * @param {Buffer} B_ - Blinded message
 * @param {Buffer} k - Private key
 * @returns {Buffer} Blind signature C_
 */
function signBlindedMessage(B_, k) {
  try {
    // Ensure B_ is a valid point
    if (!secp256k1.publicKeyVerify(B_)) {
      throw new Error('Invalid blinded message B_');
    }
    
    // Ensure k is a valid scalar
    if (!secp256k1.privateKeyVerify(k)) {
      throw new Error('Invalid private key k');
    }
    
    // Calculate C_ = kB_ (point multiplication)
    const C_ = secp256k1.publicKeyTweakMul(B_, k);
    
    logger.debug({
      B_Prefix: B_.slice(0, 5).toString('hex'),
      C_Prefix: C_.slice(0, 5).toString('hex')
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
 * @param {Buffer} C_ - Blind signature
 * @param {Buffer} blindingFactor - Blinding factor used to blind the message
 * @param {Buffer} K - Public key corresponding to private key k
 * @returns {Buffer} Unblinded signature C
 */
function unblindSignature(C_, blindingFactor, K) {
  try {
    // Ensure C_ is a valid point
    if (!secp256k1.publicKeyVerify(C_)) {
      throw new Error('Invalid blind signature C_');
    }
    
    // Ensure blinding factor is a valid scalar
    if (!secp256k1.privateKeyVerify(blindingFactor)) {
      throw new Error('Invalid blinding factor');
    }
    
    // Ensure K is a valid point
    if (!secp256k1.publicKeyVerify(K)) {
      throw new Error('Invalid public key K');
    }
    
    // Calculate rK (point multiplication)
    const rK = secp256k1.publicKeyTweakMul(K, blindingFactor);
    
    // Negate rK (for point subtraction)
    const negRK = secp256k1.publicKeyNegate(rK);
    
    // Calculate C = C_ - rK (point addition with negated rK)
    const C = secp256k1.publicKeyCombine([C_, negRK]);
    
    logger.debug({
      C_Prefix: C_.slice(0, 5).toString('hex'),
      rKPrefix: rK.slice(0, 5).toString('hex'),
      CPrefix: C.slice(0, 5).toString('hex')
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
 * @param {Buffer} C - Signature to verify
 * @param {Buffer} k - Private key
 * @returns {boolean} True if signature is valid
 */
function verifySignature(secret, C, k) {
  try {
    // Map secret to curve point
    const Y = hashToCurve(secret);
    
    // Calculate expected signature kY
    const expectedC = secp256k1.publicKeyTweakMul(Y, k);
    
    // Compare signatures (must compare hex strings as Buffer comparison is reference-based)
    const isValid = C.toString('hex') === expectedC.toString('hex');
    
    logger.debug({
      YPrefix: Y.slice(0, 5).toString('hex'),
      CPrefix: C.slice(0, 5).toString('hex'),
      expectedCPrefix: expectedC.slice(0, 5).toString('hex'),
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
    
    // Blind the message
    const B_ = blindMessage(Y, token.blindingFactor);
    
    return {
      id: token.id,
      keysetId,
      secret: token.secret,
      blindedMessage: B_.toString('hex'),
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
    // Decode blind signature and blinding factor
    const C_ = Buffer.from(blindSignature, 'hex');
    const blindingFactor = Buffer.from(tokenRequest.blindingFactor, 'hex');
    const K = Buffer.from(publicKey, 'hex');
    
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
      signature: C.toString('hex'),
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