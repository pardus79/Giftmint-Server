'use strict';

const config = require('../../config/config');
const keyManager = require('../../crypto/ecKeyManager');
const blindSignature = require('../../crypto/ecBlindSignature');
const tokenEncoder = require('../../utils/tokenEncoder');
const changeMaker = require('../../utils/changeMaker');
const db = require('../../db/database');
const crypto = require('crypto');
const testUtils = require('../testUtils');

// Integration test for token bundling
describe('Token Bundling Integration', () => {
  let mockActiveKey;
  
  // Setup test environment before running tests
  beforeAll(async () => {
    await testUtils.setupTestEnvironment();
    await db.init();
    
    // Generate a real key for testing
    mockActiveKey = await keyManager.createNewKey();
    
    // Override any mocked functions to use real implementations
    jest.clearAllMocks();
  });
  
  // Clean up after all tests
  afterAll(async () => {
    await db.shutdown();
    await testUtils.cleanupTestEnvironment();
  });
  
  describe('Token bundling and verification', () => {
    it('should create, bundle and verify multiple tokens correctly', async () => {
      // 1. Create multiple tokens with different denominations
      const denominations = [1, 2, 4, 8];
      const tokens = [];
      let totalAmount = 0;
      
      for (const denomination of denominations) {
        // Generate random secret
        const secret = crypto.randomBytes(32);
        
        // Create blinded message
        const { blindedMessage, blindingFactor } = blindSignature.blind(secret, mockActiveKey.publicKey);
        
        // Sign with mint's private key
        const blindSig = await blindSignature.sign(blindedMessage, mockActiveKey.privateKey);
        
        // Unblind signature
        const unblindedSignature = blindSignature.unblind(blindSig, blindingFactor, mockActiveKey.publicKey);
        
        // Create token
        const token = tokenEncoder.encodeToken({
          keyId: mockActiveKey.id,
          denomination,
          secret: secret.toString('hex'),
          signature: unblindedSignature.toString('hex')
        });
        
        // Verify the token individually
        const decodedToken = tokenEncoder.decodeToken(token);
        const isValid = blindSignature.verify(
          Buffer.from(decodedToken.secret, 'hex'),
          Buffer.from(decodedToken.signature, 'hex'),
          mockActiveKey.publicKey
        );
        
        // Ensure the individual token is valid
        expect(isValid).toBe(true);
        expect(decodedToken.denomination).toBe(denomination);
        
        tokens.push(token);
        totalAmount += denomination;
      }
      
      // 2. Bundle the tokens
      const tokenBundle = tokenEncoder.bundleTokens(tokens);
      
      // 3. Verify the bundle format
      expect(typeof tokenBundle).toBe('string');
      
      // 4. Unbundle and verify each token
      const unbundledTokens = tokenEncoder.unbundleTokens(tokenBundle);
      
      // 5. Verify the count matches
      expect(unbundledTokens.length).toBe(tokens.length);
      
      // 6. Verify each token in the bundle
      let verifiedAmount = 0;
      
      for (const bundledToken of unbundledTokens) {
        const decodedToken = tokenEncoder.decodeToken(bundledToken);
        
        // Verify signature
        const isValid = blindSignature.verify(
          Buffer.from(decodedToken.secret, 'hex'),
          Buffer.from(decodedToken.signature, 'hex'),
          mockActiveKey.publicKey
        );
        
        expect(isValid).toBe(true);
        verifiedAmount += decodedToken.denomination;
      }
      
      // 7. Verify total amount matches
      expect(verifiedAmount).toBe(totalAmount);
    });
    
    it('should detect invalid tokens in a bundle', async () => {
      // 1. Create valid tokens
      const denomination = 8;
      const secret = crypto.randomBytes(32);
      
      // Create blinded message
      const { blindedMessage, blindingFactor } = blindSignature.blind(secret, mockActiveKey.publicKey);
      
      // Sign with mint's private key
      const blindSig = await blindSignature.sign(blindedMessage, mockActiveKey.privateKey);
      
      // Unblind signature
      const unblindedSignature = blindSignature.unblind(blindSig, blindingFactor, mockActiveKey.publicKey);
      
      // Create valid token
      const validToken = tokenEncoder.encodeToken({
        keyId: mockActiveKey.id,
        denomination,
        secret: secret.toString('hex'),
        signature: unblindedSignature.toString('hex')
      });
      
      // 2. Create an invalid token with tampered signature
      const tamperedSignature = crypto.randomBytes(64).toString('hex');
      const invalidToken = tokenEncoder.encodeToken({
        keyId: mockActiveKey.id,
        denomination,
        secret: secret.toString('hex'),
        signature: tamperedSignature
      });
      
      // 3. Bundle both tokens
      const tokenBundle = tokenEncoder.bundleTokens([validToken, invalidToken]);
      
      // 4. Unbundle and verify each token
      const unbundledTokens = tokenEncoder.unbundleTokens(tokenBundle);
      
      // 5. Check that we have both tokens
      expect(unbundledTokens.length).toBe(2);
      
      // 6. Verify each token's signature
      const decodedValid = tokenEncoder.decodeToken(unbundledTokens[0]);
      const validSignatureVerified = blindSignature.verify(
        Buffer.from(decodedValid.secret, 'hex'),
        Buffer.from(decodedValid.signature, 'hex'),
        mockActiveKey.publicKey
      );
      
      const decodedInvalid = tokenEncoder.decodeToken(unbundledTokens[1]);
      const invalidSignatureVerified = blindSignature.verify(
        Buffer.from(decodedInvalid.secret, 'hex'),
        Buffer.from(decodedInvalid.signature, 'hex'),
        mockActiveKey.publicKey
      );
      
      // 7. Verify that one token is valid and one is invalid
      expect(validSignatureVerified || invalidSignatureVerified).toBe(true);
      expect(validSignatureVerified && invalidSignatureVerified).toBe(false);
    });
    
    it('should correctly calculate total amount from a bundle of tokens', async () => {
      // 1. Create tokens with different denominations
      const denominationValues = [16, 32, 64];
      const tokens = [];
      let expectedTotal = 0;
      
      for (const denomination of denominationValues) {
        const secret = crypto.randomBytes(32);
        const { blindedMessage, blindingFactor } = blindSignature.blind(secret, mockActiveKey.publicKey);
        const blindSig = await blindSignature.sign(blindedMessage, mockActiveKey.privateKey);
        const unblindedSignature = blindSignature.unblind(blindSig, blindingFactor, mockActiveKey.publicKey);
        
        const token = tokenEncoder.encodeToken({
          keyId: mockActiveKey.id,
          denomination,
          secret: secret.toString('hex'),
          signature: unblindedSignature.toString('hex')
        });
        
        tokens.push(token);
        expectedTotal += denomination;
      }
      
      // 2. Bundle the tokens
      const tokenBundle = tokenEncoder.bundleTokens(tokens);
      
      // 3. Unbundle the tokens
      const unbundledTokens = tokenEncoder.unbundleTokens(tokenBundle);
      
      // 4. Calculate total value from unbundled tokens
      let actualTotal = 0;
      for (const token of unbundledTokens) {
        const decoded = tokenEncoder.decodeToken(token);
        actualTotal += decoded.denomination;
      }
      
      // 5. Verify the total matches the expected value
      expect(actualTotal).toBe(expectedTotal);
    });
    
    it('should handle a very large bundle with many tokens', async () => {
      // 1. Create a large number of tokens
      const tokens = [];
      let expectedTotal = 0;
      
      // Create 20 tokens (this is still reasonable for a test but tests large bundle handling)
      for (let i = 0; i < 20; i++) {
        const denomination = Math.pow(2, (i % 5)); // cycle through denominations 1, 2, 4, 8, 16
        const secret = crypto.randomBytes(32);
        const { blindedMessage, blindingFactor } = blindSignature.blind(secret, mockActiveKey.publicKey);
        const blindSig = await blindSignature.sign(blindedMessage, mockActiveKey.privateKey);
        const unblindedSignature = blindSignature.unblind(blindSig, blindingFactor, mockActiveKey.publicKey);
        
        const token = tokenEncoder.encodeToken({
          keyId: mockActiveKey.id,
          denomination,
          secret: secret.toString('hex'),
          signature: unblindedSignature.toString('hex')
        });
        
        tokens.push(token);
        expectedTotal += denomination;
      }
      
      // 2. Bundle the tokens
      const tokenBundle = tokenEncoder.bundleTokens(tokens);
      
      // 3. Verify we can unbundle
      const unbundledTokens = tokenEncoder.unbundleTokens(tokenBundle);
      
      // 4. Check we have the right number of tokens
      expect(unbundledTokens.length).toBe(tokens.length);
      
      // 5. Calculate total and verify it matches
      let actualTotal = 0;
      for (const token of unbundledTokens) {
        const decoded = tokenEncoder.decodeToken(token);
        actualTotal += decoded.denomination;
      }
      
      expect(actualTotal).toBe(expectedTotal);
    });
  });
});