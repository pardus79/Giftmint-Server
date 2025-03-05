'use strict';

// Mock only secp256k1 module
jest.mock('secp256k1', () => ({
  privateKeyVerify: jest.fn().mockReturnValue(true),
  publicKeyCreate: jest.fn().mockReturnValue(Buffer.from('mocked-blinding-point')),
  ecdsaSign: jest.fn().mockReturnValue({
    signature: Buffer.from('mocked-signature'),
    recid: 0
  }),
  ecdsaVerify: jest.fn().mockReturnValue(true)
}));

const crypto = require('crypto');
const blindSignature = require('../../crypto/ecBlindSignature');
const secp256k1 = require('secp256k1');

describe('EC Blind Signature', () => {
  // Test data
  const mockPrivateKey = '-----BEGIN PRIVATE KEY-----\nMIGEAgEAMBAGByqGSM49AgEGBSuBBAAKBG0wawIBAQQgTestPrivateKey1234567890TestPrivateKey1234567890TestPrivate==\n-----END PRIVATE KEY-----';
  const mockPublicKey = '-----BEGIN PUBLIC KEY-----\nMFYwEAYHKoZIzj0CAQYFK4EEAAoDQgAETestPublicKey1234567890TestPublicKey1234567890TestPublicK==\n-----END PUBLIC KEY-----';
  const mockSecret = crypto.randomBytes(32);
  
  describe('blind', () => {
    it('should blind a message correctly', () => {
      const result = blindSignature.blind(mockSecret, mockPublicKey);
      
      // Check structure of result
      expect(result).toHaveProperty('blindedMessage');
      expect(result).toHaveProperty('blindingFactor');
      
      // Should be Buffers
      expect(Buffer.isBuffer(result.blindedMessage)).toBe(true);
      expect(Buffer.isBuffer(result.blindingFactor)).toBe(true);
      
      // Blinded message should include secret hash and blinding point
      expect(result.blindedMessage.length).toBeGreaterThan(32); // At least includes hash (32 bytes)
      
      // Verify secp256k1 calls
      expect(secp256k1.privateKeyVerify).toHaveBeenCalled();
      expect(secp256k1.publicKeyCreate).toHaveBeenCalled();
    });
    
    it('should generate different blinding factors for different calls', () => {
      const result1 = blindSignature.blind(mockSecret, mockPublicKey);
      const result2 = blindSignature.blind(mockSecret, mockPublicKey);
      
      // Blinding factors should be different even for the same secret
      expect(result1.blindingFactor.toString('hex')).not.toEqual(result2.blindingFactor.toString('hex'));
    });
  });
  
  describe('sign', () => {
    it('should sign a blinded message', async () => {
      // First blind a message
      const { blindedMessage } = blindSignature.blind(mockSecret, mockPublicKey);
      
      // Now sign it
      const signature = await blindSignature.sign(blindedMessage, mockPrivateKey);
      
      // Should be a Buffer
      expect(Buffer.isBuffer(signature)).toBe(true);
      
      // Verify secp256k1 calls
      expect(secp256k1.ecdsaSign).toHaveBeenCalled();
    });
  });
  
  describe('unblind', () => {
    it('should unblind a signature', () => {
      // Create blinded message
      const { blindedMessage, blindingFactor } = blindSignature.blind(mockSecret, mockPublicKey);
      
      // Create a mock blind signature
      const mockBlindSignature = Buffer.concat([
        Buffer.from('mocked-signature'),
        Buffer.from([0]) // recid
      ]);
      
      // Unblind it
      const unblindedSignature = blindSignature.unblind(mockBlindSignature, blindingFactor, mockPublicKey);
      
      // Should be a Buffer
      expect(Buffer.isBuffer(unblindedSignature)).toBe(true);
      
      // Should include the signature and recid
      expect(unblindedSignature.length).toBeGreaterThan(64); // At least 64 bytes for signature + 1 for recid
    });
  });
  
  describe('verify', () => {
    it('should verify a valid signature', () => {
      // Create a mock unblinded signature
      const mockUnblindedSignature = Buffer.concat([
        Buffer.alloc(64, 1), // Mock 64-byte signature
        Buffer.from([0])     // recid
      ]);
      
      // Verify it
      const result = blindSignature.verify(mockSecret, mockUnblindedSignature, mockPublicKey);
      
      // Should be successful
      expect(result).toBe(true);
      
      // Verify secp256k1 calls
      expect(secp256k1.ecdsaVerify).toHaveBeenCalled();
    });
    
    it('should handle verification errors', () => {
      // Mock a verification failure
      secp256k1.ecdsaVerify.mockReturnValueOnce(false);
      
      // Create a mock unblinded signature
      const mockUnblindedSignature = Buffer.concat([
        Buffer.alloc(64, 1), // Mock 64-byte signature
        Buffer.from([0])     // recid
      ]);
      
      // Verify it
      const result = blindSignature.verify(mockSecret, mockUnblindedSignature, mockPublicKey);
      
      // Should fail
      expect(result).toBe(false);
    });
    
    it('should catch and handle exceptions during verification', () => {
      // Make ecdsaVerify throw an error
      secp256k1.ecdsaVerify.mockImplementationOnce(() => {
        throw new Error('Verification error');
      });
      
      // Create a mock unblinded signature
      const mockUnblindedSignature = Buffer.concat([
        Buffer.alloc(64, 1), // Mock 64-byte signature
        Buffer.from([0])     // recid
      ]);
      
      // Verify it
      const result = blindSignature.verify(mockSecret, mockUnblindedSignature, mockPublicKey);
      
      // Should handle the error and return false
      expect(result).toBe(false);
    });
  });
  
  describe('PEM conversion utilities', () => {
    // These are internal functions, we can test them indirectly through the other functions
    it('should handle PEM private key conversion', async () => {
      // First blind a message
      const { blindedMessage } = blindSignature.blind(mockSecret, mockPublicKey);
      
      // Now sign it - this uses pemPrivateKeyToBuffer internally
      const signature = await blindSignature.sign(blindedMessage, mockPrivateKey);
      
      // Should be a Buffer
      expect(Buffer.isBuffer(signature)).toBe(true);
    });
    
    it('should handle PEM public key conversion', () => {
      // This uses pemPublicKeyToBuffer internally
      const result = blindSignature.blind(mockSecret, mockPublicKey);
      
      // Should complete successfully
      expect(result).toHaveProperty('blindedMessage');
      expect(result).toHaveProperty('blindingFactor');
    });
  });
});