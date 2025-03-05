'use strict';

// Mock the database module
jest.mock('../../db/database', () => require('../testUtils').mockDb);

// Mock the fs module
jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockImplementation((path) => {
      if (path.includes('existing-key')) {
        return Promise.resolve(JSON.stringify({
          id: 'existing-key',
          publicKey: 'test-public-key',
          privateKey: 'test-private-key',
          expiresAt: new Date(Date.now() + 86400000) // 1 day in the future
        }));
      }
      return Promise.reject(new Error('File not found'));
    }),
    readdir: jest.fn().mockResolvedValue(['key1.json', 'key2.json']),
    stat: jest.fn().mockResolvedValue({
      mtime: new Date(Date.now() - 3600000) // 1 hour ago
    }),
    unlink: jest.fn().mockResolvedValue(undefined),
    rmdir: jest.fn().mockResolvedValue(undefined)
  }
}));

// Mock crypto for key generation
jest.mock('crypto', () => {
  const originalCrypto = jest.requireActual('crypto');
  return {
    ...originalCrypto,
    randomBytes: jest.fn().mockReturnValue(Buffer.from('mocked-random-bytes')),
    generateKeyPairSync: jest.fn().mockReturnValue({
      publicKey: 'mock-public-key',
      privateKey: 'mock-private-key'
    })
  };
});

const path = require('path');
const crypto = require('crypto');
const keyManager = require('../../crypto/ecKeyManager');
const db = require('../../db/database');
const fs = require('fs').promises;
const testConfig = require('../testConfig');

describe('EC Key Manager', () => {
  // Clear mock state between tests
  beforeEach(() => {
    jest.clearAllMocks();
  });
  
  describe('generateKeyPair', () => {
    it('should generate a key pair', () => {
      const keyPair = keyManager.generateKeyPair();
      
      expect(keyPair).toHaveProperty('publicKey');
      expect(keyPair).toHaveProperty('privateKey');
      
      // Verify crypto was called
      expect(crypto.generateKeyPairSync).toHaveBeenCalledWith('ec', expect.objectContaining({
        namedCurve: 'secp256k1'
      }));
    });
  });
  
  describe('createNewKey', () => {
    it('should create and store a new key', async () => {
      // Set up mocks
      crypto.randomBytes.mockReturnValueOnce(Buffer.from('key-id'));
      
      const key = await keyManager.createNewKey();
      
      // Verify key was created
      expect(key).toHaveProperty('id');
      expect(key).toHaveProperty('publicKey');
      expect(key).toHaveProperty('privateKey');
      expect(key).toHaveProperty('expiresAt');
      
      // Verify mkdir was called
      expect(fs.mkdir).toHaveBeenCalled();
      
      // Verify key was stored in database
      expect(db.storeKey).toHaveBeenCalledWith(expect.objectContaining({
        id: expect.any(String),
        publicKey: expect.any(String),
        privateKey: expect.any(String),
        expiresAt: expect.any(Date)
      }));
      
      // Verify key was saved to file
      expect(fs.writeFile).toHaveBeenCalled();
    });
  });
  
  describe('getActiveKey', () => {
    it('should create a new key if no active keys exist', async () => {
      // Set up db.getActiveKeys to return empty array
      db.getActiveKeys.mockResolvedValueOnce([]);
      
      // Mock createNewKey
      const mockKey = { id: 'new-key', publicKey: 'new-public-key', privateKey: 'new-private-key', expiresAt: new Date(Date.now() + 86400000) };
      jest.spyOn(keyManager, 'createNewKey').mockResolvedValueOnce(mockKey);
      
      const key = await keyManager.getActiveKey();
      
      // Should return the newly created key
      expect(key).toEqual(mockKey);
      
      // Verify createNewKey was called
      expect(keyManager.createNewKey).toHaveBeenCalled();
    });
    
    it('should return the most recent active key', async () => {
      // Set up db.getActiveKeys to return some keys
      const mockKeys = [
        { id: 'key1', publicKey: 'public-key-1', privateKey: 'private-key-1', expiresAt: new Date(Date.now() + 86400000) },
        { id: 'key2', publicKey: 'public-key-2', privateKey: 'private-key-2', expiresAt: new Date(Date.now() + 43200000) }
      ];
      db.getActiveKeys.mockResolvedValueOnce(mockKeys);
      
      // Mock createNewKey to ensure it's not called
      jest.spyOn(keyManager, 'createNewKey').mockResolvedValueOnce(null);
      
      const key = await keyManager.getActiveKey();
      
      // Should return the first key (most recent)
      expect(key).toEqual(mockKeys[0]);
      
      // Verify createNewKey was not called
      expect(keyManager.createNewKey).not.toHaveBeenCalled();
    });
    
    it('should create a new key if the most recent key is expired', async () => {
      // Set up db.getActiveKeys to return an expired key
      const mockKeys = [
        { id: 'expired-key', publicKey: 'public-key', privateKey: 'private-key', expiresAt: new Date(Date.now() - 86400000) }
      ];
      db.getActiveKeys.mockResolvedValueOnce(mockKeys);
      
      // Mock createNewKey
      const mockNewKey = { id: 'new-key', publicKey: 'new-public-key', privateKey: 'new-private-key', expiresAt: new Date(Date.now() + 86400000) };
      jest.spyOn(keyManager, 'createNewKey').mockResolvedValueOnce(mockNewKey);
      
      const key = await keyManager.getActiveKey();
      
      // Should return the newly created key
      expect(key).toEqual(mockNewKey);
      
      // Verify createNewKey was called
      expect(keyManager.createNewKey).toHaveBeenCalled();
    });
  });
  
  describe('getKeyById', () => {
    it('should get key from database if it exists', async () => {
      // Set up db.getKeyById to return a key
      const mockKey = { id: 'test-key', publicKey: 'public-key', privateKey: 'private-key' };
      db.getKeyById.mockResolvedValueOnce(mockKey);
      
      const key = await keyManager.getKeyById('test-key');
      
      // Should return the key from the database
      expect(key).toEqual(mockKey);
      
      // Verify db.getKeyById was called
      expect(db.getKeyById).toHaveBeenCalledWith('test-key');
    });
    
    it('should try to load key from file if not in database', async () => {
      // Set up db.getKeyById to return null
      db.getKeyById.mockResolvedValueOnce(null);
      
      const key = await keyManager.getKeyById('existing-key');
      
      // Should have properties from the file
      expect(key).toHaveProperty('id', 'existing-key');
      expect(key).toHaveProperty('publicKey', 'test-public-key');
      expect(key).toHaveProperty('privateKey', 'test-private-key');
      
      // Verify readFile was called
      expect(fs.readFile).toHaveBeenCalled();
    });
    
    it('should return null if key not found anywhere', async () => {
      // Set up db.getKeyById to return null
      db.getKeyById.mockResolvedValueOnce(null);
      
      const key = await keyManager.getKeyById('non-existent-key');
      
      // Should return null
      expect(key).toBeNull();
    });
  });
  
  describe('rotateKeys', () => {
    it('should deactivate expired keys and create new key if needed', async () => {
      // Set up db.getActiveKeys to return some keys, one expired
      const mockKeys = [
        { id: 'active-key', publicKey: 'public-key-1', privateKey: 'private-key-1', expiresAt: new Date(Date.now() + 86400000) },
        { id: 'expired-key', publicKey: 'public-key-2', privateKey: 'private-key-2', expiresAt: new Date(Date.now() - 86400000) }
      ];
      db.getActiveKeys.mockResolvedValueOnce(mockKeys);
      
      // Mock createNewKey
      jest.spyOn(keyManager, 'createNewKey').mockResolvedValueOnce({
        id: 'new-key',
        publicKey: 'new-public-key',
        privateKey: 'new-private-key',
        expiresAt: new Date(Date.now() + 86400000)
      });
      
      await keyManager.rotateKeys();
      
      // Should have deactivated the expired key
      expect(db.deactivateKey).toHaveBeenCalledWith('expired-key');
      
      // Should have created a new key
      expect(keyManager.createNewKey).toHaveBeenCalled();
    });
    
    it('should create a new key if no active keys exist', async () => {
      // Set up db.getActiveKeys to return empty array
      db.getActiveKeys.mockResolvedValueOnce([]);
      
      // Mock createNewKey
      jest.spyOn(keyManager, 'createNewKey').mockResolvedValueOnce({
        id: 'new-key',
        publicKey: 'new-public-key',
        privateKey: 'new-private-key',
        expiresAt: new Date(Date.now() + 86400000)
      });
      
      await keyManager.rotateKeys();
      
      // Should have created a new key
      expect(keyManager.createNewKey).toHaveBeenCalled();
    });
    
    it('should not create a new key if all keys are active and not expired', async () => {
      // Set up db.getActiveKeys to return active, non-expired keys
      const mockKeys = [
        { id: 'active-key-1', publicKey: 'public-key-1', privateKey: 'private-key-1', expiresAt: new Date(Date.now() + 86400000) },
        { id: 'active-key-2', publicKey: 'public-key-2', privateKey: 'private-key-2', expiresAt: new Date(Date.now() + 43200000) }
      ];
      db.getActiveKeys.mockResolvedValueOnce(mockKeys);
      
      // Mock createNewKey to ensure it's not called
      jest.spyOn(keyManager, 'createNewKey').mockResolvedValueOnce(null);
      
      await keyManager.rotateKeys();
      
      // Should not have deactivated any keys
      expect(db.deactivateKey).not.toHaveBeenCalled();
      
      // Should not have created a new key
      expect(keyManager.createNewKey).not.toHaveBeenCalled();
    });
  });
  
  describe('init', () => {
    it('should initialize key manager', async () => {
      // Mock rotateKeys
      jest.spyOn(keyManager, 'rotateKeys').mockResolvedValueOnce(undefined);
      
      await keyManager.init();
      
      // Should have called rotateKeys
      expect(keyManager.rotateKeys).toHaveBeenCalled();
    });
  });
});