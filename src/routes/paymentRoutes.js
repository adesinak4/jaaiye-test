const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
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
 *             required: [eventId, ticketTypeId, email]
 *             properties:
 *               eventId:
 *                 type: string
 *               ticketTypeId:
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [eventId, ticketTypeId, email]
 *             properties:
 *               eventId:
 *                 type: string
 *               ticketTypeId:
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
// Initialize Flutterwave payment and return authorization URL
router.post('/flutterwave/init', protect, PaymentController.initFlutterwave);

router.post('/verify', PaymentController.verifyPaystack);
router.post('/verify', PaymentController.verifyFlutterwave);


module.exports = router;