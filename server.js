'use strict';

const express = require('express');
const helmet = require('helmet');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const fs = require('fs');
const path = require('path');

// Load environment variables
dotenv.config();

// Import configuration
const config = require('./config/config');

// Import routes
const routes = require('./api/routes');

// Import database
const db = require('./db/database');

// Ensure database directory exists
const dbDir = path.dirname(config.database.connection.filename);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

// Initialize database
db.init();

// Create Express app
const app = express();

// Apply middleware
app.use(helmet()); // Security headers
app.use(morgan('combined')); // Logging
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Apply authentication middleware for API routes
const authMiddleware = require('./api/middleware');
app.use('/api', authMiddleware.validateApiKey);

// Register API routes
app.use('/api/v1', routes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(err.status || 500).json({
    error: {
      message: config.isDevelopment ? err.message : 'Internal server error',
      ...(config.isDevelopment && { stack: err.stack })
    }
  });
});

// Start server
const PORT = process.env.PORT || 3500;
app.listen(PORT, () => {
  console.log(`Giftmint server running on port ${PORT}`);
  console.log(`Environment: ${config.environment}`);
});

// Handle shutdown
process.on('SIGINT', async () => {
  console.log('Shutting down server...');
  await db.shutdown();
  process.exit(0);
});

module.exports = app; // For testing