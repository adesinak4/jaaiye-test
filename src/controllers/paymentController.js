const { asyncHandler } = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const paystackService = require('../services/paystackService');
const flutterwaveService = require('../services/flutterwaveService');

class PaymentController {
  static initPaystack = asyncHandler(async (req, res) => {
    const { eventId, ticketTypeId, quantity = 1, email } = req.body;
    const userId = req.user && req.user._id ? req.user._id : req.body.userId;
    const metadata = { eventId, ticketTypeId, quantity, userId };
    const amount = req.body.amount; // frontend may pass computed amount or compute server-side
    const init = await paystackService.initializePayment({ amount, email, metadata });
    return successResponse(res, { authorizationUrl: init.authorizationUrl, reference: init.reference });
  });

  static initFlutterwave = asyncHandler(async (req, res) => {
    const { eventId, ticketTypeId, quantity = 1, email } = req.body;
    const userId = req.user && req.user._id ? req.user._id : req.body.userId;
    const metadata = { eventId, ticketTypeId, quantity, userId };
    const amount = req.body.amount;
    const init = await flutterwaveService.initializePayment({ amount, email, metadata });
    return successResponse(res, { authorizationUrl: init.authorizationUrl, reference: init.reference });
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
    // 1️⃣ Immediately acknowledge receipt
    res.status(200).json({ received: true });

    // 2️⃣ Continue processing asynchronously
    (async () => {
      try {
        const result = await flutterwaveService.processWebhook(req.headers, req.body);
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
}

module.exports = PaymentController;


