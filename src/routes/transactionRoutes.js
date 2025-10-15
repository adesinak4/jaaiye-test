const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const Transaction = require('../models/Transaction');
const { successResponse } = require('../utils/response');

/**
 * @swagger
 * tags:
 *   name: Transactions
 *   description: Transaction listing and admin reporting
 */

/**
 * @swagger
 * /api/v1/transactions/my:
 *   get:
 *     summary: Get current user's transactions
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 */
// GET /api/v1/transactions/my
router.get('/my', protect, async (req, res) => {
  const userId = req.user._id;
  const items = await Transaction.find({ userId }).sort({ createdAt: -1 }).limit(200);
  return successResponse(res, { transactions: items });
});

/**
 * @swagger
 * /api/v1/transactions:
 *   get:
 *     summary: Admin list transactions
 *     tags: [Transactions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *       - in: query
 *         name: provider
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Success
 */
// GET /api/v1/transactions
router.get('/', protect, admin, async (req, res) => {
  const { status, provider } = req.query;
  const filter = {};
  if (status) filter.status = status;
  if (provider) filter.provider = provider;
  const items = await Transaction.find(filter).sort({ createdAt: -1 }).limit(500);
  return successResponse(res, { transactions: items });
});

module.exports = router;


