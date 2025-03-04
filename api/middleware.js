/**
 * API Middleware
 */

const config = require('../config/config');
const pino = require('pino');

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
 * Verify API key middleware
 * 
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
function verifyApiKey(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  
  // Check if API key is provided
  if (!apiKey) {
    logger.warn({ ip: req.ip }, 'API key missing');
    return res.status(401).json({
      success: false,
      message: 'API key is required'
    });
  }
  
  // Check if API key is valid
  if (!config.api.apiKeys.includes(apiKey)) {
    logger.warn({ ip: req.ip, apiKey }, 'Invalid API key');
    return res.status(403).json({
      success: false,
      message: 'Invalid API key'
    });
  }
  
  // API key is valid, proceed
  next();
}

/**
 * Validate request body middleware
 * 
 * @param {Object} schema - Validation schema
 * @returns {Function} Middleware function
 */
function validateBody(schema) {
  return (req, res, next) => {
    const { error } = schema.validate(req.body);
    
    if (error) {
      logger.warn({ 
        ip: req.ip, 
        body: req.body, 
        error: error.details 
      }, 'Invalid request body');
      
      return res.status(400).json({
        success: false,
        message: error.details[0].message
      });
    }
    
    next();
  };
}

/**
 * Error handler middleware
 * 
 * @param {Function} handler - Route handler function
 * @returns {Function} Middleware function
 */
function asyncHandler(handler) {
  return async (req, res, next) => {
    try {
      await handler(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

module.exports = {
  verifyApiKey,
  validateBody,
  asyncHandler
};