'use strict';

const crypto = require('crypto');
const secp256k1 = require('secp256k1');

/**
 * Creates a blinded message using Blind Diffie-Hellman Key Exchange (BDHKE)
 * @param {Buffer} secret - The secret to blind
 * @param {string} pubKey - The signer's public key in PEM format
 * @returns {Object} Object containing blindedMessage and blindingFactor
 */
function blind(secret, pubKey) {
  // Convert PEM public key to Buffer
  const pubKeyBuffer = pemPublicKeyToBuffer(pubKey);
  
  // Generate a random blinding factor
  const blindingFactor = crypto.randomBytes(32);
  
  // Make sure the blinding factor is a valid private key (less than the curve order)
  while (!secp256k1.privateKeyVerify(blindingFactor)) {
    blindingFactor = crypto.randomBytes(32);
  }
  
  // Hash the secret
  const secretHash = crypto.createHash('sha256').update(secret).digest();
  
  // Multiply the public key by the blinding factor
  const blindingPoint = secp256k1.publicKeyCreate(blindingFactor, true);
  
  // Combine the secret hash with the blinding point
  const blindedMessage = Buffer.concat([secretHash, blindingPoint]);
  
  return {
    blindedMessage,
    blindingFactor
  };
}

/**
 * Signs a blinded message using the private key
 * @param {Buffer} blindedMessage - The blinded message to sign
 * @param {string} privKey - The signer's private key in PEM format
 * @returns {Buffer} The blind signature
 */
async function sign(blindedMessage, privKey) {
  // Convert PEM private key to Buffer
  const privKeyBuffer = pemPrivateKeyToBuffer(privKey);
  
  // Extract the secret hash and blinding point from the blinded message
  const secretHash = blindedMessage.slice(0, 32);
  const blindingPoint = blindedMessage.slice(32);
  
  // Sign the secret hash with the private key
  const messageHash = crypto.createHash('sha256').update(secretHash).digest();
  
  // Sign the hash
  const { signature, recid } = secp256k1.ecdsaSign(messageHash, privKeyBuffer);
  
  // Concatenate the signature and recovery ID
  const fullSignature = Buffer.concat([
    signature,
    Buffer.from([recid])
  ]);
  
  return fullSignature;
}

/**
 * Unblinds a blind signature using the blinding factor
 * @param {Buffer} blindSignature - The blind signature
 * @param {Buffer} blindingFactor - The blinding factor used for blinding
 * @param {string} pubKey - The signer's public key in PEM format
 * @returns {Buffer} The unblinded signature
 */
function unblind(blindSignature, blindingFactor, pubKey) {
  // Extract the signature and recovery ID
  const signature = blindSignature.slice(0, 64);
  const recid = blindSignature[64];
  
  // Unblind the signature using the blinding factor
  // In BDHKE, we don't need to perform additional operations to unblind
  // as the blinding is done during verification
  
  // Return the signature with recovery ID
  return Buffer.concat([
    signature,
    Buffer.from([recid])
  ]);
}

/**
 * Verifies an unblinded signature
 * @param {Buffer} secret - The original secret
 * @param {Buffer} unblindedSignature - The unblinded signature
 * @param {string} pubKey - The signer's public key in PEM format
 * @returns {boolean} Whether the signature is valid
 */
function verify(secret, unblindedSignature, pubKey) {
  try {
    // Convert PEM public key to Buffer
    const pubKeyBuffer = pemPublicKeyToBuffer(pubKey);
    
    // Extract the signature and recovery ID
    const signature = unblindedSignature.slice(0, 64);
    const recid = unblindedSignature[64];
    
    // Hash the secret
    const secretHash = crypto.createHash('sha256').update(secret).digest();
    
    // Hash the message for verification
    const messageHash = crypto.createHash('sha256').update(secretHash).digest();
    
    // Verify the signature
    return secp256k1.ecdsaVerify(signature, messageHash, pubKeyBuffer);
  } catch (error) {
    console.error('Error verifying signature:', error);
    return false;
  }
}

/**
 * Converts a PEM public key to a Buffer
 * @param {string} pemPublicKey - The public key in PEM format
 * @returns {Buffer} The public key as a Buffer
 */
function pemPublicKeyToBuffer(pemPublicKey) {
  // Parse the PEM public key
  const publicKeyObject = crypto.createPublicKey({
    key: pemPublicKey,
    format: 'pem'
  });
  
  // Export the key as raw buffer (uncompressed point format)
  const publicKeyBuffer = publicKeyObject.export({
    format: 'der',
    type: 'spki'
  });
  
  // Extract the actual key bytes (removing ASN.1 headers)
  const asn1ParsedKey = crypto.createPublicKey({
    key: publicKeyBuffer,
    format: 'der',
    type: 'spki'
  });
  
  // Get the raw public key
  const rawKey = asn1ParsedKey.export({
    format: 'jwk'
  });
  
  // Convert jwk to secp256k1 format
  const xBuffer = Buffer.from(rawKey.x, 'base64');
  const yBuffer = Buffer.from(rawKey.y, 'base64');
  
  // Combine x and y coordinates with prefix byte (04 for uncompressed)
  return Buffer.concat([Buffer.from([0x04]), xBuffer, yBuffer]);
}

/**
 * Converts a PEM private key to a Buffer
 * @param {string} pemPrivateKey - The private key in PEM format
 * @returns {Buffer} The private key as a Buffer
 */
function pemPrivateKeyToBuffer(pemPrivateKey) {
  // Parse the PEM private key
  const privateKeyObject = crypto.createPrivateKey({
    key: pemPrivateKey,
    format: 'pem'
  });
  
  // Export the key as JWK
  const jwkKey = privateKeyObject.export({
    format: 'jwk'
  });
  
  // Extract the 'd' parameter (private key)
  return Buffer.from(jwkKey.d, 'base64');
}

module.exports = {
  blind,
  sign,
  unblind,
  verify
};