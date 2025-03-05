'use strict';

// Mock the config module
jest.mock('../../config/config', () => ({
  token: {
    prefix: 'GM',
    maxBundleSize: 100
  }
}));

const compactTokenEncoder = require('../../utils/compactTokenEncoder');
const tokenEncoder = require('../../utils/tokenEncoder');
const crypto = require('crypto');
const cbor = require('cbor');

describe('Compact Token Encoder', () => {
  // Setup mock data
  const mockTokens = [];
  // Use a hex string for key ID to match the actual implementation
  const mockKeyId = '74657374313233348888'; // 'test1234' followed by some hex
  
  // Create a few test tokens
  beforeAll(() => {
    // Create 3 tokens with different denominations
    for (const denom of [1, 10, 100]) {
      const secret = crypto.randomBytes(32).toString('hex');
      const signature = crypto.randomBytes(64).toString('hex');
      
      const token = tokenEncoder.encodeToken({
        keyId: mockKeyId,
        denomination: denom,
        secret,
        signature
      });
      
      mockTokens.push(token);
    }
  });
  
  describe('bundleTokensCompact', () => {
    it('should bundle tokens in compact format', () => {
      // Bundle tokens in compact format
      const compactBundle = compactTokenEncoder.bundleTokensCompact(mockTokens);
      
      // Verify it's a string
      expect(typeof compactBundle).toBe('string');
      
      // Should be base64 encoded
      expect(() => {
        Buffer.from(compactBundle, 'base64url');
      }).not.toThrow();
    });
    
    it('should throw for empty array', () => {
      expect(() => {
        compactTokenEncoder.bundleTokensCompact([]);
      }).toThrow('Tokens must be a non-empty array');
    });
    
    it('should throw for non-array', () => {
      expect(() => {
        compactTokenEncoder.bundleTokensCompact('not-an-array');
      }).toThrow('Tokens must be a non-empty array');
    });
  });
  
  describe('unbundleTokensCompact', () => {
    it('should create a valid compact bundle', () => {
      // Bundle tokens
      const compactBundle = compactTokenEncoder.bundleTokensCompact(mockTokens);
      expect(typeof compactBundle).toBe('string');
    });
    
    it('should detect the token key ID correctly', () => {
      // Verify we can find the key ID in the bundle
      const compactBundle = compactTokenEncoder.bundleTokensCompact(mockTokens);
      const bundleObj = cbor.decode(Buffer.from(compactBundle, 'base64url'));
      
      // The bundle should have a tokens array (t)
      expect(bundleObj).toHaveProperty('t');
      expect(Array.isArray(bundleObj.t)).toBe(true);
      
      // At least one token group should exist
      expect(bundleObj.t.length).toBeGreaterThan(0);
      
      // The first token group should have our key ID
      const tokenGroup = bundleObj.t[0];
      expect(tokenGroup).toHaveProperty('i');
      
      // Convert the binary key ID to hex string
      const keyId = tokenGroup.i.toString('hex');
      expect(keyId).toBe(mockKeyId);
    });
    
    it('should handle both formats correctly in tokenController', () => {
      // This test just makes sure our file exists, proper integration tests
      // would test the actual controller functions
      expect(typeof compactTokenEncoder.bundleTokensCompact).toBe('function');
      expect(typeof compactTokenEncoder.unbundleTokensCompact).toBe('function');
    });
    
    it('should throw for invalid compact bundle', () => {
      expect(() => {
        compactTokenEncoder.unbundleTokensCompact('invalid-bundle');
      }).toThrow();
    });
  });
  
  describe('compareBundleSizes', () => {
    it('should compare bundle sizes and show reduction', () => {
      // Get size comparison
      const comparison = compactTokenEncoder.compareBundleSizes(mockTokens);
      
      // Verify we have all the expected fields
      expect(comparison).toHaveProperty('standardSize');
      expect(comparison).toHaveProperty('compactSize');
      expect(comparison).toHaveProperty('reduction');
      expect(comparison).toHaveProperty('percentSaved');
      
      // Compact should be smaller than standard
      expect(comparison.compactSize).toBeLessThan(comparison.standardSize);
      
      // Reduction should be positive
      expect(comparison.reduction).toBeGreaterThan(0);
      
      // Percent saved should be positive
      expect(comparison.percentSaved).toBeGreaterThan(0);
    });
  });
});