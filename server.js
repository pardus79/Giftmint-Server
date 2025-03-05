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
const keyManager = require('./crypto/ecKeyManager'); // Using EC key manager only
const apiRoutes = require('./api/routes');
const { verifyApiKey } = require('./api/middleware');

// Set up logging
const fs = require('fs');
const path = require('path');

// Create logging streams based on configuration
let logStreams = [{ stream: process.stdout }];

// Add file stream if configured
if (config.log.file) {
  const logDir = path.dirname(config.log.file);
  
  // Create log directory if it doesn't exist
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true });
  }
  
  // Add file stream
  logStreams.push({ stream: fs.createWriteStream(config.log.file, { flags: 'a' }) });
  console.log(`Logging to file: ${config.log.file}`);
}

// Initialize logger with all streams
const logger = pino(
  {
    level: config.log.level,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true
      }
    }
  }, 
  pino.multistream(logStreams)
);

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
    
    // Initialize EC key manager
    await keyManager.init();
    logger.info('EC Key Manager initialized successfully');
    
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
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully');
  // Close database and other resources before exiting
  try {
    await db.close();
    logger.info('Successfully closed all connections');
    process.exit(0);
  } catch (error) {
    logger.error(error, 'Error during shutdown');
    process.exit(1);
  }
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down gracefully');
  // Close database and other resources before exiting
  try {
    await db.close();
    logger.info('Successfully closed all connections');
    process.exit(0);
  } catch (error) {
    logger.error(error, 'Error during shutdown');
    process.exit(1);
  }
});

// Start server
if (require.main === module) {
  startServer();
}

// Export app and logger for use in other modules
module.exports = {
  app,
  logger
};