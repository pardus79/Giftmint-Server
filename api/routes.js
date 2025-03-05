/**
 * API Routes for Giftmint mint
 */

const express = require('express');
const router = express.Router();
const { asyncHandler } = require('./middleware');
const tokenController = require('./tokenController');

// Denomination routes
router.post('/denomination/list', asyncHandler(tokenController.listDenominations));
router.get('/token/denominations', asyncHandler(tokenController.listDenominations));

// Token routes (EC-based, compact tokens)
router.post('/token/create', asyncHandler(tokenController.createECToken));
router.post('/token/verify', asyncHandler(tokenController.verifyECToken));
router.post('/token/redeem', asyncHandler(tokenController.redeemECToken));

// Also available under /ec endpoint for compatibility with existing documentation
router.post('/ec/token/create', asyncHandler(tokenController.createECToken));
router.post('/ec/token/verify', asyncHandler(tokenController.verifyECToken));
router.post('/ec/token/redeem', asyncHandler(tokenController.redeemECToken));

// Stats routes
router.post('/stats/outstanding', asyncHandler(tokenController.getOutstandingValue));
router.post('/stats/outstanding-by-denomination', asyncHandler(tokenController.getOutstandingByDenomination));

module.exports = router;