'use strict';

const tokenEncoder = require('../../utils/tokenEncoder');
const testConfig = require('../testConfig');
const testUtils = require('../testUtils');
const crypto = require('crypto');

describe('TokenEncoder Utility', () => {
  // Test data
  const testSecret = crypto.randomBytes(32).toString('hex');
  const testSignature = crypto.randomBytes(64).toString('hex');
  const testKeyId = 'test-key-id';
  const testDenomination = 1024;
  
  describe('encodeToken', () => {
    it('should encode a token correctly', () => {
      const tokenData = {
        keyId: testKeyId,
        denomination: testDenomination,
        secret: testSecret,
        signature: testSignature
      };
      
      const encodedToken = tokenEncoder.encodeToken(tokenData);
      
      // Check token format
      expect(encodedToken).toMatch(new RegExp(`^${testConfig.token.prefix}_`));
      
      // Should be decodable
      const decoded = tokenEncoder.decodeToken(encodedToken);
      expect(decoded).toHaveProperty('id');
      expect(decoded.keyId).toBe(testKeyId);
      expect(decoded.denomination).toBe(testDenomination);
      expect(decoded.secret).toBe(testSecret);
      expect(decoded.signature).toBe(testSignature);
    });
    
    it('should throw an error for invalid token data', () => {
      // Missing keyId
      expect(() => tokenEncoder.encodeToken({
        denomination: testDenomination,
        secret: testSecret,
        signature: testSignature
      })).toThrow();
      
      // Missing denomination
      expect(() => tokenEncoder.encodeToken({
        keyId: testKeyId,
        secret: testSecret,
        signature: testSignature
      })).toThrow();
      
      // Missing secret
      expect(() => tokenEncoder.encodeToken({
        keyId: testKeyId,
        denomination: testDenomination,
        signature: testSignature
      })).toThrow();
      
      // Missing signature
      expect(() => tokenEncoder.encodeToken({
        keyId: testKeyId,
        denomination: testDenomination,
        secret: testSecret
      })).toThrow();
    });
    
    it('should generate consistent token IDs for the same secret', () => {
      const token1 = tokenEncoder.encodeToken({
        keyId: testKeyId,
        denomination: testDenomination,
        secret: testSecret,
        signature: testSignature
      });
      
      const token2 = tokenEncoder.encodeToken({
        keyId: testKeyId,
        denomination: testDenomination,
        secret: testSecret,
        signature: testSignature
      });
      
      const decoded1 = tokenEncoder.decodeToken(token1);
      const decoded2 = tokenEncoder.decodeToken(token2);
      
      expect(decoded1.id).toBe(decoded2.id);
    });
  });
  
  describe('decodeToken', () => {
    it('should decode a valid token', () => {
      // Create a mock token
      const mockToken = testUtils.createMockToken(testKeyId, testDenomination, testSecret, testSignature);
      
      // Decode it
      const decoded = tokenEncoder.decodeToken(mockToken.token);
      
      // Should match the original data
      expect(decoded.keyId).toBe(testKeyId);
      expect(decoded.denomination).toBe(testDenomination);
      expect(decoded.secret).toBe(testSecret);
      expect(decoded.signature).toBe(testSignature);
      expect(decoded.id).toBe(mockToken.raw.id);
    });
    
    it('should throw an error for tokens with invalid prefix', () => {
      const tokenObj = {
        id: crypto.createHash('sha256').update(testSecret).digest('hex'),
        keyId: testKeyId,
        denomination: testDenomination,
        secret: testSecret,
        signature: testSignature
      };
      
      const tokenJson = JSON.stringify(tokenObj);
      const tokenBase64 = Buffer.from(tokenJson).toString('base64url');
      const invalidToken = `INVALID_${tokenBase64}`;
      
      expect(() => tokenEncoder.decodeToken(invalidToken)).toThrow();
    });
    
    it('should throw an error for malformed tokens', () => {
      // Not base64
      expect(() => tokenEncoder.decodeToken(`${testConfig.token.prefix}_not-base64!`)).toThrow();
      
      // Not JSON
      const notJson = Buffer.from('not-json').toString('base64url');
      expect(() => tokenEncoder.decodeToken(`${testConfig.token.prefix}_${notJson}`)).toThrow();
      
      // Missing fields
      const missingFields = Buffer.from(JSON.stringify({ foo: 'bar' })).toString('base64url');
      expect(() => tokenEncoder.decodeToken(`${testConfig.token.prefix}_${missingFields}`)).toThrow();
    });
    
    it('should throw an error if token ID doesn\'t match secret', () => {
      const tokenObj = {
        id: 'invalid-id',
        keyId: testKeyId,
        denomination: testDenomination,
        secret: testSecret,
        signature: testSignature
      };
      
      const tokenJson = JSON.stringify(tokenObj);
      const tokenBase64 = Buffer.from(tokenJson).toString('base64url');
      const invalidToken = `${testConfig.token.prefix}_${tokenBase64}`;
      
      expect(() => tokenEncoder.decodeToken(invalidToken)).toThrow();
    });
  });
  
  describe('generateTokenId', () => {
    it('should generate a consistent ID for the same secret', () => {
      const id1 = tokenEncoder.generateTokenId(testSecret);
      const id2 = tokenEncoder.generateTokenId(testSecret);
      
      expect(id1).toBe(id2);
    });
    
    it('should generate different IDs for different secrets', () => {
      const secret1 = crypto.randomBytes(32).toString('hex');
      const secret2 = crypto.randomBytes(32).toString('hex');
      
      const id1 = tokenEncoder.generateTokenId(secret1);
      const id2 = tokenEncoder.generateTokenId(secret2);
      
      expect(id1).not.toBe(id2);
    });
    
    it('should handle both hex strings and buffers', () => {
      const secretHex = testSecret;
      const secretBuffer = Buffer.from(testSecret, 'hex');
      
      const id1 = tokenEncoder.generateTokenId(secretHex);
      const id2 = tokenEncoder.generateTokenId(secretBuffer);
      
      expect(id1).toBe(id2);
    });
  });
  
  describe('bundleTokens and unbundleTokens', () => {
    it('should bundle and unbundle tokens correctly', () => {
      // Create multiple tokens
      const token1 = testUtils.createMockToken('key1', 1);
      const token2 = testUtils.createMockToken('key1', 2);
      const token3 = testUtils.createMockToken('key2', 4);
      
      const tokens = [token1.token, token2.token, token3.token];
      
      // Bundle them
      const bundle = tokenEncoder.bundleTokens(tokens);
      
      // Should be a string
      expect(typeof bundle).toBe('string');
      
      // Unbundle
      const unbundled = tokenEncoder.unbundleTokens(bundle);
      
      // Should have all tokens
      expect(unbundled).toHaveLength(3);
      
      // Tokens may not be in the same order, so we'll sort them by id
      const sortedOriginal = tokens.sort();
      const sortedUnbundled = unbundled.sort();
      
      for (let i = 0; i < sortedOriginal.length; i++) {
        // Decode to compare properties
        const originalDecoded = tokenEncoder.decodeToken(sortedOriginal[i]);
        const unbundledDecoded = tokenEncoder.decodeToken(sortedUnbundled[i]);
        
        expect(unbundledDecoded.id).toBe(originalDecoded.id);
        expect(unbundledDecoded.keyId).toBe(originalDecoded.keyId);
        expect(unbundledDecoded.denomination).toBe(originalDecoded.denomination);
        expect(unbundledDecoded.secret).toBe(originalDecoded.secret);
        expect(unbundledDecoded.signature).toBe(originalDecoded.signature);
      }
    });
    
    it('should throw an error for invalid bundle inputs', () => {
      // Empty array
      expect(() => tokenEncoder.bundleTokens([])).toThrow();
      
      // Not an array
      expect(() => tokenEncoder.bundleTokens('not-an-array')).toThrow();
      
      // Invalid tokens
      expect(() => tokenEncoder.bundleTokens(['invalid-token'])).toThrow();
    });
    
    it('should throw an error for invalid bundle to unbundle', () => {
      // Not base64
      expect(() => tokenEncoder.unbundleTokens('not-base64!')).toThrow();
      
      // Not CBOR
      const notCbor = Buffer.from('not-cbor').toString('base64url');
      expect(() => tokenEncoder.unbundleTokens(notCbor)).toThrow();
    });
    
    it('should handle bundles with tokens from different key IDs', () => {
      // Create tokens with different key IDs
      const token1 = testUtils.createMockToken('key1', 1);
      const token2 = testUtils.createMockToken('key1', 2);
      const token3 = testUtils.createMockToken('key2', 4);
      const token4 = testUtils.createMockToken('key3', 8);
      
      const tokens = [token1.token, token2.token, token3.token, token4.token];
      
      // Bundle them
      const bundle = tokenEncoder.bundleTokens(tokens);
      
      // Unbundle
      const unbundled = tokenEncoder.unbundleTokens(bundle);
      
      // Should have all tokens
      expect(unbundled).toHaveLength(4);
      
      // Check that all key IDs are preserved
      const keyIds = new Set(unbundled.map(token => tokenEncoder.decodeToken(token).keyId));
      expect(keyIds.size).toBe(3); // 3 unique key IDs
      expect(keyIds.has('key1')).toBe(true);
      expect(keyIds.has('key2')).toBe(true);
      expect(keyIds.has('key3')).toBe(true);
    });
    
    it('should enforce max bundle size', () => {
      // Create maxBundleSize + 1 tokens
      const tokens = [];
      const maxSize = testConfig.token.maxBundleSize;
      
      for (let i = 0; i < maxSize + 1; i++) {
        tokens.push(testUtils.createMockToken('key1', 1).token);
      }
      
      // Should throw an error
      expect(() => tokenEncoder.bundleTokens(tokens)).toThrow();
    });
  });
  
  describe('detectTokenFormat', () => {
    it('should detect individual tokens', () => {
      const token = testUtils.createMockToken().token;
      const format = tokenEncoder.detectTokenFormat(token);
      expect(format).toBe('token');
    });
    
    it('should detect token bundles', () => {
      const tokens = [
        testUtils.createMockToken().token,
        testUtils.createMockToken().token
      ];
      
      const bundle = tokenEncoder.bundleTokens(tokens);
      const format = tokenEncoder.detectTokenFormat(bundle);
      
      expect(format).toBe('bundle');
    });
    
    it('should return "unknown" for invalid formats', () => {
      expect(tokenEncoder.detectTokenFormat('invalid-format')).toBe('unknown');
    });
  });
  
  describe('normalizeBinaryData', () => {
    it('should normalize Buffer data', () => {
      const buffer = Buffer.from([1, 2, 3, 4]);
      const normalized = tokenEncoder.normalizeBinaryData(buffer);
      
      expect(Buffer.isBuffer(normalized)).toBe(true);
      expect(normalized).toEqual(buffer);
    });
    
    it('should normalize hex strings', () => {
      const hex = '01020304';
      const normalized = tokenEncoder.normalizeBinaryData(hex);
      
      expect(Buffer.isBuffer(normalized)).toBe(true);
      expect(normalized).toEqual(Buffer.from([1, 2, 3, 4]));
    });
    
    it('should normalize base64 strings', () => {
      const base64 = Buffer.from([1, 2, 3, 4]).toString('base64');
      const normalized = tokenEncoder.normalizeBinaryData(base64);
      
      expect(Buffer.isBuffer(normalized)).toBe(true);
      expect(normalized).toEqual(Buffer.from([1, 2, 3, 4]));
    });
    
    it('should normalize comma-separated number strings', () => {
      const commaString = '1, 2, 3, 4';
      const normalized = tokenEncoder.normalizeBinaryData(commaString);
      
      expect(Buffer.isBuffer(normalized)).toBe(true);
      expect(normalized).toEqual(Buffer.from([1, 2, 3, 4]));
    });
    
    it('should normalize regular strings as UTF-8', () => {
      const str = 'test';
      const normalized = tokenEncoder.normalizeBinaryData(str);
      
      expect(Buffer.isBuffer(normalized)).toBe(true);
      expect(normalized).toEqual(Buffer.from('test', 'utf8'));
    });
    
    it('should normalize arrays', () => {
      const arr = [1, 2, 3, 4];
      const normalized = tokenEncoder.normalizeBinaryData(arr);
      
      expect(Buffer.isBuffer(normalized)).toBe(true);
      expect(normalized).toEqual(Buffer.from([1, 2, 3, 4]));
    });
    
    it('should throw for unsupported types', () => {
      expect(() => tokenEncoder.normalizeBinaryData(null)).toThrow();
      expect(() => tokenEncoder.normalizeBinaryData(undefined)).toThrow();
      expect(() => tokenEncoder.normalizeBinaryData({})).toThrow();
    });
  });
});