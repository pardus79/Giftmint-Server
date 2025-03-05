'use strict';

const express = require('express');
const router = express.Router();
const middleware = require('./middleware');
const tokenController = require('./tokenController');

// Apply rate limiting to all routes
router.use(middleware.rateLimit);

// Token Creation Endpoints
router.post('/token/create', middleware.validateTokenRequest, tokenController.createToken);
router.post('/token/bulk-create', middleware.validateTokenRequest, tokenController.bulkCreateTokens);

// Token Verification Endpoints
router.post('/token/verify', middleware.validateTokenRequest, tokenController.verifyToken);

// Token Redemption Endpoints
router.post('/token/redeem', middleware.validateTokenRequest, tokenController.redeemToken);
router.post('/token/remint', middleware.validateTokenRequest, tokenController.remintToken);
router.post('/token/split', middleware.validateTokenRequest, tokenController.splitToken);

// Administrative Endpoints
router.get('/denomination/list', tokenController.listDenominations);
router.get('/stats/outstanding', tokenController.getOutstandingTokens);

// Diagnostic Endpoints
router.post('/diagnostic/verify-token', tokenController.diagnosticVerifyToken);
router.post('/diagnostic/unbundle', tokenController.diagnosticUnbundle);
router.post('/diagnostic/token-detail', tokenController.diagnosticTokenDetail);

// Health check endpoint (no auth required)
router.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok' });
});

module.exports = router;