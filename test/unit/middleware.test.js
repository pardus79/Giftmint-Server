'use strict';

// Mock the config module
jest.mock('../../config/config', () => ({
  isDevelopment: false,
  apiKeys: ['valid-api-key-1', 'valid-api-key-2']
}));

const middleware = require('../../api/middleware');
const config = require('../../config/config');

describe('API Middleware', () => {
  describe('validateApiKey', () => {
    let req, res, next;
    
    beforeEach(() => {
      // Create fresh request, response, and next function for each test
      req = {
        headers: {},
        path: '/v1/token/create'
      };
      
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      
      next = jest.fn();
    });
    
    it('should call next() for valid API key', () => {
      req.headers['x-api-key'] = 'valid-api-key-1';
      
      middleware.validateApiKey(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
    
    it('should return 401 for missing API key', () => {
      middleware.validateApiKey(req, res, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'MISSING_API_KEY'
        })
      }));
    });
    
    it('should return 403 for invalid API key', () => {
      req.headers['x-api-key'] = 'invalid-api-key';
      
      middleware.validateApiKey(req, res, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'INVALID_API_KEY'
        })
      }));
    });
    
    it('should bypass validation for diagnostic endpoints in development', () => {
      // Temporarily set isDevelopment to true
      const originalIsDevelopment = config.isDevelopment;
      config.isDevelopment = true;
      
      req.path = '/v1/diagnostic/verify-token';
      
      middleware.validateApiKey(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
      
      // Restore original value
      config.isDevelopment = originalIsDevelopment;
    });
    
    it('should not bypass validation for non-diagnostic endpoints in development', () => {
      // Temporarily set isDevelopment to true
      const originalIsDevelopment = config.isDevelopment;
      config.isDevelopment = true;
      
      req.path = '/v1/token/create';
      
      middleware.validateApiKey(req, res, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(401);
      
      // Restore original value
      config.isDevelopment = originalIsDevelopment;
    });
  });
  
  describe('validateTokenRequest', () => {
    let req, res, next;
    
    beforeEach(() => {
      req = {
        body: null
      };
      
      res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis()
      };
      
      next = jest.fn();
    });
    
    it('should call next() for valid request body', () => {
      req.body = { key: 'value' };
      
      middleware.validateTokenRequest(req, res, next);
      
      expect(next).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
      expect(res.json).not.toHaveBeenCalled();
    });
    
    it('should return 400 for missing request body', () => {
      middleware.validateTokenRequest(req, res, next);
      
      expect(next).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        error: expect.objectContaining({
          code: 'INVALID_REQUEST'
        })
      }));
    });
  });
  
  describe('rateLimit', () => {
    it('should pass through (basic smoke test)', () => {
      const req = {};
      const res = {};
      const next = jest.fn();
      
      middleware.rateLimit(req, res, next);
      
      expect(next).toHaveBeenCalled();
    });
  });
});