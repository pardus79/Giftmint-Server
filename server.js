/**
 * Giftmint Mint Server
 * 
 * This is the main server file for the Giftmint Chaumian e-cash mint.
 */

// Load environment variables
require('dotenv').config();

// Import dependencies
const express = require('express');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const cors = require('cors');
const pino = require('pino');
const { rateLimit } = require('express-rate-limit');

// Import local modules
const config = require('./config/config');
const db = require('./db/database');
const keyManager = require('./crypto/keyManager');
const apiRoutes = require('./api/routes');
const { verifyApiKey } = require('./api/middleware');

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

// Initialize express app
const app = express();

// Apply middleware
app.use(helmet());
app.use(cors());
app.use(bodyParser.json());

// Add request logging
app.use((req, res, next) => {
  logger.info({
    method: req.method,
    url: req.url,
    ip: req.ip,
  }, 'Incoming request');
  next();
});

// Apply rate limiting
const limiter = rateLimit({
  windowMs: config.api.rateLimitWindow,
  max: config.api.rateLimitMax,
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests from this IP, please try again later.'
});

// Apply API key verification to all API routes
app.use(`${config.api.baseUrl}`, verifyApiKey, limiter, apiRoutes);

// Define health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error({
    method: req.method,
    url: req.url,
    error: err.message,
    stack: err.stack
  }, 'Error occurred');
  
  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal server error'
  });
});

// Start the server
async function startServer() {
  try {
    // Initialize database
    await db.init();
    
    // Initialize key manager
    await keyManager.init();
    
    // Start server
    app.listen(config.server.port, config.server.host, () => {
      logger.info(`Server listening at http://${config.server.host}:${config.server.port}`);
    });
  } catch (error) {
    logger.fatal(error, 'Failed to start server');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  // Close database and other resources before exiting
  db.close().then(() => {
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  // Close database and other resources before exiting
  db.close().then(() => {
    process.exit(0);
  });
});

// Start server
if (require.main === module) {
  startServer();
}

module.exports = app; // Export for testing