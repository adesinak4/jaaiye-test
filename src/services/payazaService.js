const crypto = require('crypto');
const axios = require('axios');
const { handleSuccessfulPayment } = require('./paymentCommonService');
const API_BASE = 'https://api.payaza.africa/live/merchant-collection/transfer_notification_controller/transaction-query';

async function verify(reference) {
  const res = await axios.get(`${API_BASE}?transaction_reference=${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYAZA_SECRET_KEY}` }
  });
  const data = res.data;
  return data && data.status ? data.data : null;
}

// Background job to poll for pending transactions
async function pollPendingTransactions() {
  try {
    // Get pending transactions from your database
    const Transaction = require('../models/Transaction');
    const pendingTransactions = await Transaction.find({
      provider: 'payaza',
      status: 'pending',
      createdAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } // Last 2 hours
    }).limit(50); // Limit to avoid overwhelming the API

    console.log(`Polling ${pendingTransactions.length} pending Payaza transactions`);

    for (const transaction of pendingTransactions) {
      try {
        const verified = await verify(transaction.reference);
        if (verified && verified.status === 'successful') {
          console.log(`Processing pending transaction: ${transaction.reference}`);
          const metadata = verified.meta || (verified.customer && verified.customer.meta) || {userId: transaction.userId, eventId: transaction.eventId, quantity: transaction.quantity} || {};

          await handleSuccessfulPayment({
            provider: 'payaza',
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
    console.error('Error in Payaza polling job:', error);
  }
}

// function isValidSignature(headers, body) {
//   const signature = headers['x-payaza-signature'];
//   if (!signature || !process.env.PAYAZA_SECRET_KEY) return true; // allow in dev if no key
//   const hash = crypto.createHmac('sha512', process.env.PAYAZA_SECRET_KEY).update(body, 'utf8').digest('base64');
//   return hash === signature;
// }

// async function processWebhook(headers, body) {
//   if (!isValidSignature(headers, body)) {
//     return { ok: false, reason: 'invalid_signature' };
//   }
//   if (body && body.event === 'charge.success') {
//     const reference = body.data && body.data.reference;
//     const verified = await verify(reference);
//     if (verified && verified.status === 'success') {
//       const metadata = verified.metadata || {};
//       return await handleSuccessfulPayment({
//         provider: 'paystack',
//         reference,
//         amount: verified.amount / 100,
//         currency: verified.currency || 'NGN',
//         metadata,
//         raw: verified
//       });
//     }
//   }
//   return { ok: false };
// }

// async function initializePayment({ amount, email, metadata }) {
//   const payload = {
//     amount: Math.round(amount * 100),
//     email,
//     metadata,
//     callback_url: process.env.PAYAZA_CALLBACK_URL
//   };
//   const res = await axios.post(`${API_BASE}/transaction/initialize`, payload, {
//     headers: {
//       Authorization: `Bearer ${process.env.PAYAZA_SECRET_KEY}`,
//       'Content-Type': 'application/json'
//     }
//   });
//   const data = res.data;
//   if (!data.status) {
//     throw new Error(data.message || 'Payaza init failed');
//   }
//   return { authorizationUrl: data.data.authorization_url, reference: data.data.reference };
// }

module.exports = { verify, pollPendingTransactions };


