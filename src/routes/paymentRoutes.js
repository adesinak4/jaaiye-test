const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { idempotencyMiddleware } = require('../middleware/idempotencyMiddleware');
const PaymentController = require('../controllers/paymentController');

/**
 * @swagger
 * tags:
 *   name: Payments
 *   description: Payment initialization and processing
 */

/**
 * @swagger
 * /api/v1/payments/paystack/init:
 *   post:
 *     summary: Initialize Paystack payment and get authorization URL
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [eventId, email]
 *             properties:
 *               eventId:
 *                 type: string
 *               quantity:
 *                 type: integer
 *                 default: 1
 *               email:
 *                 type: string
 *               amount:
 *                 type: number
 *                 description: Optional. If omitted, server should compute.
 *     responses:
 *       200:
 *         description: Authorization URL returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     authorizationUrl:
 *                       type: string
 *                     reference:
 *                       type: string
 */
// Initialize Paystack payment and return authorization URL
router.post('/paystack/init', protect, PaymentController.initPaystack);

/**
 * @swagger
 * /api/v1/payments/flutterwave/init:
 *   post:
 *     summary: Initialize Flutterwave payment and get authorization URL
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: X-Idempotency-Key
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Unique key to prevent duplicate requests
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [eventId, email]
 *             properties:
 *               eventId:
 *                 type: string
 *               quantity:
 *                 type: integer
 *                 default: 1
 *               email:
 *                 type: string
 *               amount:
 *                 type: number
 *                 description: Optional. If omitted, server should compute.
 *     responses:
 *       200:
 *         description: Authorization URL returned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     authorizationUrl:
 *                       type: string
 *                     reference:
 *                       type: string
 *                     idempotencyKey:
 *                       type: string
 *                     isCachedResponse:
 *                       type: boolean
 *         headers:
 *           X-Idempotency-Cache-Hit:
 *             description: Indicates if response was cached
 *             schema:
 *               type: string
 *               enum: [true]
 */
// Initialize Flutterwave payment and return authorization URL
router.post('/flutterwave/init', protect, idempotencyMiddleware, PaymentController.initFlutterwave);

router.post('/verify', PaymentController.verifyPaystack);
router.post('/verify', PaymentController.verifyFlutterwave);

/**
 * @swagger
 * /api/v1/payments/register:
 *   post:
 *     summary: Register transaction for polling backup (mobile SDK usage)
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [provider, reference, amount, eventId]
 *             properties:
 *               provider:
 *                 type: string
 *                 enum: [paystack, flutterwave, payaza]
 *               reference:
 *                 type: string
 *               amount:
 *                 type: number
 *               currency:
 *                 type: string
 *                 default: NGN
 *               eventId:
 *                 type: string
 *               quantity:
 *                 type: integer
 *                 default: 1
 *               metadata:
 *                 type: object
 *     responses:
 *       200:
 *         description: Transaction registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     message:
 *                       type: string
 *                     transaction:
 *                       type: object
 */
router.post('/register', protect, PaymentController.registerTransaction);

/**
 * @swagger
 * /api/v1/payments/update:
 *   put:
 *     summary: Update transaction with payment gateway details
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reference]
 *             properties:
 *               reference:
 *                 type: string
 *               transId:
 *                 type: number
 *               transReference:
 *                 type: string
 *               status:
 *                 type: string
 *                 enum: [pending, successful, failed, cancelled, completed]
 *     responses:
 *       200:
 *         description: Transaction updated successfully
 */
router.put('/update', protect, PaymentController.updateTransaction);

module.exports = router;