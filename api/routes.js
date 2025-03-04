/**
 * API Routes for Giftmint mint
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('./middleware');
const tokenController = require('./tokenController');

// Token routes
router.post('/token/create', asyncHandler(tokenController.createToken));
router.post('/token/verify', asyncHandler(tokenController.verifyToken));
router.post('/token/redeem', asyncHandler(tokenController.redeemToken));
router.post('/token/remint', asyncHandler(tokenController.remintToken));
router.post('/token/bulk-create', asyncHandler(tokenController.bulkCreateTokens));

// Stats routes
router.post('/stats/outstanding', asyncHandler(tokenController.getOutstandingValue));

module.exports = router;