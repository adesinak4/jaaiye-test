const crypto = require('crypto');
const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const { handleSuccessfulPayment } = require('./paymentCommonService');
const API_BASE = 'https://api.flutterwave.com/v3';

async function verify(transactionId) {
  try {
    const res = await axios.get(`${API_BASE}/transactions/${transactionId}/verify`, {
      headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` }
    });

    const data = res.data;
    return data && data.status === 'success' ? data.data : null;
  } catch (error) {
    console.error('Error verifying transaction:', error.response?.data || error.message);
    return null;
  }
}

function isValidSignature(headers, body) {
  const secretHash = process.env.FLW_WEBHOOK_SECRET;
  const signature = headers['verif-hash'] || headers['flutterwave-signature'];

  if (!secretHash || !signature) {
    console.warn('Flutterwave webhook signature validation skipped - missing secret or signature');
    return true; // allow in dev if not set
  }

  const hash = crypto.createHmac('sha256', secretHash)
    .update(JSON.stringify(body))
    .digest('hex');

  return hash === signature;
}

async function processWebhook(headers, body) {
  // Validate signature first
  if (!isValidSignature(headers, body)) {
    console.error('Invalid Flutterwave webhook signature');
    return { ok: false, reason: 'invalid_signature' };
  }

  // Check for successful payment event
  if (body && body.event === 'charge.completed' && body.data && body.data.status === 'successful') {
    const data = body.data;
    const reference = data.id;

    if (!reference) {
      console.error('No reference found in Flutterwave webhook');
      return { ok: false, reason: 'no_reference' };
    }

    try {
      // Verify the transaction with Flutterwave API
      const verified = await verify(transId);
      if (verified && verified.status === 'successful') {
        const metadata = verified.meta || (verified.customer && verified.customer.meta) || {};

        // Process payment (this should be idempotent)
        return await handleSuccessfulPayment({
          provider: 'flutterwave',
          reference,
          amount: verified.amount,
          currency: verified.currency || 'NGN',
          metadata,
          raw: verified
        });
      } else {
        console.warn('Flutterwave transaction verification failed for reference:', reference);
        return { ok: false, reason: 'verification_failed' };
      }
    } catch (error) {
      console.error('Error processing Flutterwave webhook:', error);
      return { ok: false, reason: 'processing_error', error: error.message };
    }
  }

  console.log('Flutterwave webhook event not processed:', body?.event);
  return { ok: false, reason: 'event_not_handled' };
}

async function initializePayment({ amount, email, metadata, currency = 'NGN', idempotencyKey }) {
  // Generate idempotency key if not provided
  const key = idempotencyKey || uuidv4();

  const payload = {
    tx_ref: 'flw_' + Date.now(),
    amount,
    currency,
    redirect_url: process.env.FLW_REDIRECT_URL,
    meta: metadata,
    customer: { email }
  };

  console.log('Flutterwave payment initialization:', {
    payload,
    idempotencyKey: key,
    hasSecretKey: !!process.env.FLW_SECRET_KEY
  });

  try {
    const res = await axios.post(`${API_BASE}/payments`, payload, {
      headers: {
        Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
        'Content-Type': 'application/json',
        'X-Idempotency-Key': key
      }
    });

    const data = res.data;
    const isCachedResponse = res.headers['x-idempotency-cache-hit'] === 'true';

    console.log('Flutterwave response:', {
      status: data.status,
      isCachedResponse,
      idempotencyKey: key
    });

    if (data.status !== 'success') {
      throw new Error(data.message || 'Flutterwave init failed');
    }

    const link = (data.data && data.data.link) || (data.meta && data.meta.authorization && data.meta.authorization.redirect);

    // Create transaction record for polling backup
    try {
      const Transaction = require('../models/Transaction');
      await Transaction.create({
        provider: 'flutterwave',
        reference: payload.tx_ref,
        amount,
        currency,
        userId: metadata.userId,
        eventId: metadata.eventId,
        ticketTypeId: metadata.ticketTypeId || null,
        quantity: metadata.quantity || 1,
        metadata,
        status: 'pending'
      });
      console.log('Transaction record created for polling:', payload.tx_ref);
    } catch (txError) {
      // If transaction already exists (unique constraint), that's fine
      if (txError.code === 11000) {
        console.log('Transaction record already exists:', payload.tx_ref);
      } else {
        console.error('Failed to create transaction record:', txError);
        // Don't fail the payment init if we can't create the record
      }
    }

    return {
      authorizationUrl: link,
      reference: payload.tx_ref,
      idempotencyKey: key,
      isCachedResponse
    };
  } catch (error) {
    console.error('Flutterwave API error:', {
      message: error.message,
      response: error.response?.data,
      idempotencyKey: key
    });
    throw new Error(`Flutterwave payment initialization failed: ${error.response?.data?.message || error.message}`);
  }
}

// Background job to poll for pending transactions
async function pollPendingTransactions() {
  try {
    // Get pending transactions from your database
    const Transaction = require('../models/Transaction');
    const pendingTransactions = await Transaction.find({
      provider: 'flutterwave',
      status: ['pending'],
      createdAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } // Last 2 hours
    }).limit(50); // Limit to avoid overwhelming the API

    console.log(`Polling ${pendingTransactions.length} pending Flutterwave transactions`);

    for (const transaction of pendingTransactions) {
      try {
        const verified = await verify(transaction.transId);
        if (verified && verified.status === 'successful') {
          console.log(`Processing pending transaction: ${transaction.reference}`);
          const metadata = { userId: transaction.userId, eventId: transaction.eventId, quantity: transaction.quantity } || {};

          await handleSuccessfulPayment({
            provider: 'flutterwave',
            reference: transaction.reference,
            amount: verified.amount,
            currency: verified.currency || 'NGN',
            metadata,
            raw: verified
          });
        } else if (verified && verified.status === 'failed') {
          // Mark transaction as failed
          transaction.status = 'failed';
          await transaction.save();
          console.log(`Transaction failed: ${transaction.reference}`);
        }
      } catch (error) {
        console.error(`Error polling transaction ${transaction.reference}:`, error.message);
      }
    }
  } catch (error) {
    console.error('Error in Flutterwave polling job:', error);
  }
}

module.exports = { processWebhook, verify, initializePayment, pollPendingTransactions };