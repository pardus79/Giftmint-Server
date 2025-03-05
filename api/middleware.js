'use strict';

const config = require('../config/config');

/**
 * Validates the API key provided in the X-API-Key header
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function validateApiKey(req, res, next) {
  // Skip API key validation for diagnostic endpoints if in development
  if (config.isDevelopment && req.path.startsWith('/v1/diagnostic')) {
    return next();
  }

  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    return res.status(401).json({
      error: {
        code: 'MISSING_API_KEY',
        message: 'API key is required'
      }
    });
  }
  
  if (!config.apiKeys.includes(apiKey)) {
    return res.status(403).json({
      error: {
        code: 'INVALID_API_KEY',
        message: 'Invalid API key'
      }
    });
  }
  
  next();
}

/**
 * Rate limiting middleware
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function rateLimit(req, res, next) {
  // Implementation using a proper rate-limiting library would go here
  // For now, we'll just pass through as a placeholder
  next();
}

/**
 * Request validation middleware for token operations
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
function validateTokenRequest(req, res, next) {
  // Validate request format for token operations
  if (!req.body) {
    return res.status(400).json({
      error: {
        code: 'INVALID_REQUEST',
        message: 'Request body is required'
      }
    });
  }
  
  // The specific validation logic will depend on the endpoint
  // We'll implement specific validators for each endpoint
  
  next();
}

module.exports = {
  validateApiKey,
  rateLimit,
  validateTokenRequest
};