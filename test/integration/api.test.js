'use strict';

// Replace the real database with a mock
jest.mock('../../db/database', () => require('../testUtils').mockDb);

// Mock the crypto module
jest.mock('../../crypto/ecBlindSignature', () => ({
  blind: jest.fn().mockReturnValue({
    blindedMessage: Buffer.from('mocked-blinded-message'),
    blindingFactor: Buffer.from('mocked-blinding-factor')
  }),
  sign: jest.fn().mockResolvedValue(Buffer.from('mocked-signature')),
  unblind: jest.fn().mockReturnValue(Buffer.from('mocked-unblinded-signature')),
  verify: jest.fn().mockReturnValue(true)
}));

jest.mock('../../crypto/ecKeyManager', () => ({
  getActiveKey: jest.fn().mockResolvedValue({
    id: 'test-key-id',
    publicKey: 'test-public-key',
    privateKey: 'test-private-key',
    expiresAt: new Date(Date.now() + 86400000), // 1 day in the future
    active: true
  }),
  getKeyById: jest.fn().mockResolvedValue({
    id: 'test-key-id',
    publicKey: 'test-public-key',
    privateKey: 'test-private-key',
    expiresAt: new Date(Date.now() + 86400000), // 1 day in the future
    active: true
  })
}));

const request = require('supertest');
const app = require('../../server');
const testUtils = require('../testUtils');
const testConfig = require('../testConfig');

// Setup and teardown
beforeAll(async () => {
  await testUtils.setupTestEnvironment();
});

afterAll(async () => {
  await testUtils.cleanupTestEnvironment();
});

describe('API Integration Tests', () => {
  const apiKey = testConfig.apiKeys[0];
  
  describe('Token Creation', () => {
    it('should create a token with valid amount', async () => {
      const response = await request(app)
        .post('/api/v1/token/create')
        .set('X-API-Key', apiKey)
        .send({ amount: 1024 })
        .expect(201);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('amount', 1024);
      expect(response.body).toHaveProperty('token');
      expect(typeof response.body.token).toBe('string');
    });
    
    it('should return 400 for invalid amount', async () => {
      const response = await request(app)
        .post('/api/v1/token/create')
        .set('X-API-Key', apiKey)
        .send({ amount: -10 })
        .expect(400);
      
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code', 'INVALID_AMOUNT');
    });
    
    it('should return 401 without API key', async () => {
      await request(app)
        .post('/api/v1/token/create')
        .send({ amount: 1024 })
        .expect(401);
    });
    
    it('should create multiple tokens with bulk-create', async () => {
      const response = await request(app)
        .post('/api/v1/token/bulk-create')
        .set('X-API-Key', apiKey)
        .send({ amounts: [512, 1024, 2048] })
        .expect(201);
      
      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('count', 3);
      expect(response.body).toHaveProperty('totalAmount', 3584);
      expect(response.body).toHaveProperty('tokens');
      expect(Array.isArray(response.body.tokens)).toBe(true);
      expect(response.body.tokens).toHaveLength(3);
    });
    
    it('should return 400 for invalid amounts in bulk-create', async () => {
      await request(app)
        .post('/api/v1/token/bulk-create')
        .set('X-API-Key', apiKey)
        .send({ amounts: 'not-an-array' })
        .expect(400);
      
      await request(app)
        .post('/api/v1/token/bulk-create')
        .set('X-API-Key', apiKey)
        .send({ amounts: [] })
        .expect(400);
      
      await request(app)
        .post('/api/v1/token/bulk-create')
        .set('X-API-Key', apiKey)
        .send({ amounts: [1024, -5] })
        .expect(400);
    });
  });
  
  describe('Token Verification', () => {
    it('should verify a valid token', async () => {
      // First, create a token
      const createResponse = await request(app)
        .post('/api/v1/token/create')
        .set('X-API-Key', apiKey)
        .send({ amount: 1024 })
        .expect(201);
      
      // Then verify it
      const verifyResponse = await request(app)
        .post('/api/v1/token/verify')
        .set('X-API-Key', apiKey)
        .send({ token: createResponse.body.token })
        .expect(200);
      
      expect(verifyResponse.body).toHaveProperty('valid', true);
      expect(verifyResponse.body).toHaveProperty('count');
      expect(verifyResponse.body).toHaveProperty('totalAmount');
      expect(verifyResponse.body).toHaveProperty('results');
      expect(Array.isArray(verifyResponse.body.results)).toBe(true);
    });
    
    it('should return 400 for missing token', async () => {
      await request(app)
        .post('/api/v1/token/verify')
        .set('X-API-Key', apiKey)
        .send({})
        .expect(400);
    });
  });
  
  describe('Administrative Endpoints', () => {
    it('should list available denominations', async () => {
      const response = await request(app)
        .get('/api/v1/denomination/list')
        .set('X-API-Key', apiKey)
        .expect(200);
      
      expect(response.body).toHaveProperty('denominations');
      expect(Array.isArray(response.body.denominations)).toBe(true);
      
      // Should have power-of-2 denominations
      const denominations = response.body.denominations;
      expect(denominations).toContain(1);
      expect(denominations).toContain(2);
      expect(denominations).toContain(4);
      expect(denominations).toContain(8);
      expect(denominations).toContain(16);
      expect(denominations).toContain(32);
      expect(denominations).toContain(64);
      expect(denominations).toContain(128);
      expect(denominations).toContain(256);
      expect(denominations).toContain(512);
      expect(denominations).toContain(1024);
    });
    
    it('should return token statistics', async () => {
      const response = await request(app)
        .get('/api/v1/stats/outstanding')
        .set('X-API-Key', apiKey)
        .expect(200);
      
      expect(response.body).toHaveProperty('stats');
    });
  });
  
  describe('Diagnostic Endpoints', () => {
    it('should provide detailed token verification', async () => {
      // First, create a token
      const createResponse = await request(app)
        .post('/api/v1/token/create')
        .set('X-API-Key', apiKey)
        .send({ amount: 1024 })
        .expect(201);
      
      // Then use diagnostic verification
      const diagnosticResponse = await request(app)
        .post('/api/v1/diagnostic/verify-token')
        .set('X-API-Key', apiKey)
        .send({ token: createResponse.body.token })
        .expect(200);
      
      expect(diagnosticResponse.body).toHaveProperty('valid');
      expect(diagnosticResponse.body).toHaveProperty('signatureValid');
      expect(diagnosticResponse.body).toHaveProperty('details');
    });
    
    it('should analyze token format', async () => {
      // First, create a token
      const createResponse = await request(app)
        .post('/api/v1/token/create')
        .set('X-API-Key', apiKey)
        .send({ amount: 1024 })
        .expect(201);
      
      // Then analyze its format
      const detailResponse = await request(app)
        .post('/api/v1/diagnostic/token-detail')
        .set('X-API-Key', apiKey)
        .send({ token: createResponse.body.token })
        .expect(200);
      
      expect(detailResponse.body).toHaveProperty('formatInfo');
      expect(detailResponse.body).toHaveProperty('isToken', true);
    });
  });
});