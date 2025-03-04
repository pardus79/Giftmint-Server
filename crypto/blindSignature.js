/**
 * Blind signature implementation for Chaumian e-cash
 * 
 * This module provides functions for blind signatures using RSA.
 */

const crypto = require('crypto');
const forge = require('node-forge');
const { v4: uuidv4 } = require('uuid');
const Decimal = require('decimal.js');
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
 * Generate a blinding factor
 * 
 * @returns {Buffer} Random blinding factor
 */
function generateBlindingFactor() {
  return crypto.randomBytes(config.crypto.blindingFactorSize);
}

/**
 * Generate a new token
 * 
 * @param {number} amount - Token amount
 * @param {string} currency - Token currency
 * @param {string} [batchId] - Optional batch ID
 * @returns {Object} Token object with id, amount, currency, batchId, tokenData, blindingFactor
 */
function generateToken(amount, currency, batchId = '') {
  try {
    // Validate inputs
    if (!amount || isNaN(amount) || amount <= 0) {
      throw new Error('Invalid amount');
    }
    
    if (!currency) {
      throw new Error('Currency is required');
    }
    
    // Generate token ID
    const id = uuidv4();
    
    // Generate token data
    const tokenData = {
      id,
      amount: new Decimal(amount).toString(),
      currency,
      batchId,
      createdAt: new Date().toISOString()
    };
    
    // Generate blinding factor
    const blindingFactor = generateBlindingFactor();
    
    // JSON stringify and normalize token data
    const tokenString = JSON.stringify(tokenData);
    
    // Create a buffer from the token string
    const tokenBuffer = Buffer.from(tokenString, 'utf8');
    
    return {
      id,
      amount,
      currency,
      batchId,
      tokenData: tokenString,
      tokenBuffer,
      blindingFactor
    };
  } catch (error) {
    logger.error({ error }, 'Failed to generate token');
    throw error;
  }
}

/**
 * Blind a message using a public key and blinding factor
 * 
 * @param {Buffer} message - Message to blind
 * @param {string} publicKeyPem - Public key in PEM format
 * @param {Buffer} blindingFactor - Blinding factor
 * @returns {Object} Blinded message
 */
function blindMessage(message, publicKeyPem, blindingFactor) {
  try {
    // Parse public key
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    
    // Get modulus and exponent
    const n = publicKey.n;
    const e = publicKey.e;
    
    // Convert message and blinding factor to forge BigInteger
    const m = new forge.jsbn.BigInteger(message.toString('hex'), 16);
    const r = new forge.jsbn.BigInteger(blindingFactor.toString('hex'), 16);
    
    // Ensure message is smaller than modulus
    if (m.compareTo(n) >= 0) {
      throw new Error('Message is too large for the key modulus');
    }
    
    // Compute blinded message: m' = m * r^e mod n
    const rE = r.modPow(e, n);
    const blindedMessage = m.multiply(rE).mod(n);
    
    // Convert blinded message to hex string
    const blindedMessageHex = blindedMessage.toString(16);
    
    return {
      blindedMessage: Buffer.from(blindedMessageHex, 'hex'),
      blindingFactor,
      n,
      e
    };
  } catch (error) {
    logger.error({ error }, 'Failed to blind message');
    throw error;
  }
}

/**
 * Sign a blinded message using a private key
 * 
 * @param {Buffer} blindedMessage - Blinded message
 * @param {string} privateKeyPem - Private key in PEM format
 * @returns {Buffer} Blind signature
 */
function signBlindedMessage(blindedMessage, privateKeyPem) {
  try {
    // Parse private key
    const privateKey = forge.pki.privateKeyFromPem(privateKeyPem);
    
    // Convert blinded message to forge BigInteger
    const bm = new forge.jsbn.BigInteger(blindedMessage.toString('hex'), 16);
    
    // Make sure the message is within the valid range for the key
    const modulus = privateKey.n;
    if (bm.compareTo(modulus) >= 0) {
      throw new Error('Message is too large for the key modulus');
    }
    
    // Sign blinded message using raw RSA (directly computing m^d mod n)
    const blindSignature = bm.modPow(privateKey.d, privateKey.n);
    
    // Convert to buffer and return
    return Buffer.from(blindSignature.toString(16), 'hex');
  } catch (error) {
    logger.error({ error }, 'Failed to sign blinded message');
    throw error;
  }
}

/**
 * Unblind a blind signature
 * 
 * @param {Buffer} blindSignature - Blind signature
 * @param {Buffer} blindingFactor - Blinding factor used to blind the message
 * @param {string} publicKeyPem - Public key in PEM format
 * @returns {Buffer} Unblinded signature
 */
function unblindSignature(blindSignature, blindingFactor, publicKeyPem) {
  try {
    // Parse public key
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    
    // Get modulus
    const n = publicKey.n;
    
    // Convert parameters to forge BigInteger
    const bs = new forge.jsbn.BigInteger(blindSignature.toString('hex'), 16);
    const r = new forge.jsbn.BigInteger(blindingFactor.toString('hex'), 16);
    
    // Compute modular multiplicative inverse of r
    const rInv = r.modInverse(n);
    
    // Unblind the signature: s = s' * r^-1 mod n
    const signature = bs.multiply(rInv).mod(n);
    
    // Convert signature to hex string
    const signatureHex = signature.toString(16);
    
    return Buffer.from(signatureHex, 'hex');
  } catch (error) {
    logger.error({ error }, 'Failed to unblind signature');
    throw error;
  }
}

/**
 * Verify a signature
 * 
 * @param {Buffer} message - Original message
 * @param {Buffer} signature - Signature to verify
 * @param {string} publicKeyPem - Public key in PEM format
 * @returns {boolean} True if signature is valid
 */
function verifySignature(message, signature, publicKeyPem) {
  try {
    // Parse public key
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    
    // When using raw RSA signing (m^d mod n), verification requires
    // calculating signature^e mod n and comparing with the original message
    const n = publicKey.n;
    const e = publicKey.e;
    
    // Convert to BigIntegers
    const s = new forge.jsbn.BigInteger(signature.toString('hex'), 16);
    const m = new forge.jsbn.BigInteger(message.toString('hex'), 16);
    
    // Compute s^e mod n, which should equal m for a valid signature
    const calculatedMessage = s.modPow(e, n);
    
    // Compare the calculated message with the original
    return calculatedMessage.equals(m);
  } catch (error) {
    logger.error({ error }, 'Failed to verify signature');
    return false;
  }
}

/**
 * Create a complete token for e-cash
 * 
 * @param {number} amount - Token amount
 * @param {string} currency - Token currency
 * @param {string} publicKeyPem - Public key in PEM format
 * @param {string} [batchId] - Optional batch ID
 * @returns {Object} Token object with all necessary data
 */
function createTokenRequest(amount, currency, publicKeyPem, batchId = '') {
  try {
    // Generate token
    const token = generateToken(amount, currency, batchId);
    
    // Create token hash (what will actually be signed)
    const tokenHash = crypto.createHash('sha256')
      .update(token.tokenBuffer)
      .digest();
    
    // Parse public key to get modulus size
    const publicKey = forge.pki.publicKeyFromPem(publicKeyPem);
    const modulusBits = publicKey.n.bitLength();
    // For raw RSA (without padding), we need message < modulus
    const maxBytes = Math.floor(modulusBits / 8) - 1; // Safe message size for raw RSA
    
    // Make sure the hash is not too large for the key
    // We'll use a shorter hash if needed (or could pad appropriately)
    let hashToUse = tokenHash;
    if (tokenHash.length > maxBytes) {
      // Use a hash function with shorter output if needed
      hashToUse = crypto.createHash('sha1') // 20 bytes vs sha256's 32 bytes
        .update(token.tokenBuffer)
        .digest();
    }
    
    // Blind the token hash
    const { blindedMessage, blindingFactor } = blindMessage(
      hashToUse,
      publicKeyPem,
      token.blindingFactor
    );
    
    return {
      id: token.id,
      amount: token.amount,
      currency: token.currency,
      batchId: token.batchId,
      blindedToken: blindedMessage.toString('base64'),
      blindingFactor: blindingFactor.toString('base64'),
      tokenData: token.tokenData,
      hashAlgo: hashToUse.length === 20 ? 'sha1' : 'sha256' // Keep track of which hash we used
    };
  } catch (error) {
    logger.error({ error }, 'Failed to create token request');
    throw error;
  }
}

/**
 * Process and complete a token
 * 
 * @param {Object} tokenRequest - Token request from createTokenRequest
 * @param {string} blindSignature - Base64 encoded blind signature
 * @param {string} publicKeyPem - Public key in PEM format
 * @returns {Object} Completed token
 */
function processSignedToken(tokenRequest, blindSignature, publicKeyPem) {
  try {
    // Decode blind signature and blinding factor
    const blindSigBuffer = Buffer.from(blindSignature, 'base64');
    const blindingFactorBuffer = Buffer.from(tokenRequest.blindingFactor, 'base64');
    
    // Unblind the signature
    const signature = unblindSignature(
      blindSigBuffer,
      blindingFactorBuffer,
      publicKeyPem
    );
    
    // Recreate the token hash, using the same algorithm as during creation
    let tokenHash;
    if (tokenRequest.hashAlgo === 'sha1') {
      tokenHash = crypto.createHash('sha1')
        .update(Buffer.from(tokenRequest.tokenData, 'utf8'))
        .digest();
    } else {
      // Default to sha256
      tokenHash = crypto.createHash('sha256')
        .update(Buffer.from(tokenRequest.tokenData, 'utf8'))
        .digest();
    }
    
    // Verify the signature
    const isValid = verifySignature(tokenHash, signature, publicKeyPem);
    
    if (!isValid) {
      throw new Error('Invalid signature');
    }
    
    // Create final token with encoded signature
    return {
      id: tokenRequest.id,
      amount: tokenRequest.amount,
      currency: tokenRequest.currency,
      signature: signature.toString('base64'),
      data: tokenRequest.tokenData
    };
  } catch (error) {
    logger.error({ error }, 'Failed to process signed token');
    throw error;
  }
}

module.exports = {
  generateBlindingFactor,
  generateToken,
  blindMessage,
  signBlindedMessage,
  unblindSignature,
  verifySignature,
  createTokenRequest,
  processSignedToken
};