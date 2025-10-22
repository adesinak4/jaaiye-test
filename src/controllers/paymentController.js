const { asyncHandler } = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const paystackService = require('../services/paystackService');
const flutterwaveService = require('../services/flutterwaveService');

class PaymentController {
  static initPaystack = asyncHandler(async (req, res) => {
    const { eventId, quantity = 1, email, amount } = req.body;

    // Validate required fields
    if (!eventId || !email) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: eventId and email are required'
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    const userId = req.user && req.user._id ? req.user._id : req.body.userId;
    const metadata = { eventId, quantity, userId };

    try {
      const init = await paystackService.initializePayment({ amount, email, metadata });
      return successResponse(res, { authorizationUrl: init.authorizationUrl, reference: init.reference });
    } catch (error) {
      console.error('Paystack init error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to initialize Paystack payment'
      });
    }
  });

  static initFlutterwave = asyncHandler(async (req, res) => {
    const { eventId, quantity = 1, email, amount } = req.body;

    // Get idempotency key from header or generate one
    const idempotencyKey = req.headers['x-idempotency-key'] || req.headers['X-Idempotency-Key'];

    // Validate required fields
    if (!eventId || !email) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: eventId and email are required'
      });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({
        success: false,
        message: 'Valid amount is required'
      });
    }

    const userId = req.user && req.user._id ? req.user._id : req.body.userId;
    const metadata = { eventId, quantity, userId };

    try {
      const init = await flutterwaveService.initializePayment({
        amount,
        email,
        metadata,
        idempotencyKey
      });

      return successResponse(res, {
        authorizationUrl: init.authorizationUrl,
        reference: init.reference,
        idempotencyKey: init.idempotencyKey,
        isCachedResponse: init.isCachedResponse
      });
    } catch (error) {
      console.error('Flutterwave init error:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to initialize Flutterwave payment'
      });
    }
  });

  static handlePaystackWebhook = asyncHandler(async (req, res) => {
    // 1️⃣ Immediately acknowledge receipt
    res.status(200).json({ received: true });

    // 2️⃣ Continue processing asynchronously
    (async () => {
      try {
        const result = await paystackService.processWebhook(req.headers, req.body);
        if (result && result.ok) {
          console.log('Webhook processed successfully');
        } else {
          console.warn('Webhook processed with issues', result);
        }
      } catch (error) {
        console.error('Error processing webhook', error);
      }
    })();
  });

  static handleFlutterwaveWebhook = asyncHandler(async (req, res) => {
    // 1️⃣ Immediately acknowledge receipt (respond quickly)
    res.status(200).json({ received: true });

    // 2️⃣ Continue processing asynchronously
    (async () => {
      try {
        const result = await flutterwaveService.processWebhook(req.headers, req.body);
        if (result && result.ok) {
          console.log('Flutterwave webhook processed successfully');
        } else {
          console.warn('Flutterwave webhook processed with issues', result);
        }
      } catch (error) {
        console.error('Error processing Flutterwave webhook', error);
      }
    })();
  });

  static verifyPaystack = asyncHandler(async (req, res) => {
    const { reference } = req.body
    const result = await paystackService.verify(reference);
    return res.status(200).json({ result })
  });

  static verifyFlutterwave = asyncHandler(async (req, res) => {
    const { reference } = req.body
    const result = await flutterwaveService.verify(reference);
    return res.status(200).json({ result })
  });

  // Register transaction for polling backup (for mobile SDK usage)
  static registerTransaction = asyncHandler(async (req, res) => {
    const { provider, reference, amount, currency = 'NGN', eventId, quantity = 1, metadata = {} } = req.body;

    // Validate required fields
    if (!provider || !reference || !amount || !eventId) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: provider, reference, amount, and eventId are required'
      });
    }

    if (!['paystack', 'flutterwave', 'payaza'].includes(provider)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid provider. Must be paystack, flutterwave, or payaza'
      });
    }

    const userId = req.user && req.user._id ? req.user._id : req.body.userId;
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    try {
      const Transaction = require('../models/Transaction');

      // Check if transaction already exists
      const existingTransaction = await Transaction.findOne({ provider, reference });
      if (existingTransaction) {
        return successResponse(res, {
          message: 'Transaction already registered',
          transaction: existingTransaction
        });
      }

      // Create transaction record
      const transaction = await Transaction.create({
        provider,
        reference,
        amount,
        currency,
        userId,
        eventId,
        ticketTypeId: metadata.ticketTypeId || null,
        quantity,
        metadata: { ...metadata, userId, eventId },
        status: 'pending'
      });

      console.log('Transaction registered for polling:', {
        provider,
        reference,
        amount,
        userId,
        eventId
      });

      return successResponse(res, {
        message: 'Transaction registered successfully',
        transaction
      });
    } catch (error) {
      console.error('Error registering transaction:', error);
      return res.status(500).json({
        success: false,
        message: error.message || 'Failed to register transaction'
      });
    }
  });
}

module.exports = PaymentController;


