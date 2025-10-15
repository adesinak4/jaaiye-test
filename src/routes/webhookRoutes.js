const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { successResponse, errorResponse } = require('../utils/response');
const { syncQueue } = require('../queues');
const PaymentController = require('../controllers/paymentController');

// Google Calendar webhook
// POST /webhooks/google/calendar
router.post('/google/calendar', async (req, res) => {
  try {
    const channelToken = req.get('X-Goog-Channel-Token');
    const resourceId = req.get('X-Goog-Resource-Id');
    const state = req.get('X-Goog-Resource-State');
    const channelId = req.get('X-Goog-Channel-Id');

    if (!resourceId || !channelId) {
      return res.status(200).end(); // Acknowledge but ignore
    }

    // Optionally verify token if set
    if (process.env.GOOGLE_CHANNEL_TOKEN && channelToken !== process.env.GOOGLE_CHANNEL_TOKEN) {
      return res.status(200).end();
    }

    // Find the user who has this resource/channel registered
    const user = await User.findOne({ 'googleCalendar.calendars.resourceId': resourceId });
    if (user) {
      syncQueue.add({ type: 'googleIncrementalSync', userId: user._id.toString(), resourceId, channelId, state });
    }

    return res.status(200).end();
  } catch (err) {
    return res.status(200).end();
  }
});

/**
 * @swagger
 * tags:
 *   name: Webhooks
 *   description: External webhook endpoints
 */

/**
 * @swagger
 * /webhooks/paystack:
 *   post:
 *     summary: Paystack webhook receiver
 *     tags: [Webhooks]
 *     responses:
 *       200:
 *         description: Acknowledged
 */
// Paystack webhook
router.post('/paystack', express.json({ type: '*/*' }), PaymentController.handlePaystackWebhook);

/**
 * @swagger
 * /webhooks/flutterwave:
 *   post:
 *     summary: Flutterwave webhook receiver
 *     tags: [Webhooks]
 *     responses:
 *       200:
 *         description: Acknowledged
 */
// Flutterwave webhook
router.post('/flutterwave', express.json({ type: '*/*' }), PaymentController.handleFlutterwaveWebhook);

module.exports = router;