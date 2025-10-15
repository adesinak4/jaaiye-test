const crypto = require('crypto');
const axios = require('axios');
const { handleSuccessfulPayment } = require('./paymentCommonService');
const API_BASE = 'https://api.flutterwave.com/v3';

async function verify(reference) {
  const res = await axios.get(`${API_BASE}/transactions/verify_by_reference`, {
    headers: { Authorization: `Bearer ${process.env.FLW_SECRET_KEY}` },
    params: { reference }
  });
  const data = res.data;
  return data && data.status === 'success' ? data.data : null;
}

function isValidSignature(headers, body) {
  const secretHash = process.env.FLW_WEBHOOK_SECRET;
  const signature = headers['flutterwave-signature'];
  if (!secretHash || !signature) return true; // allow in dev if not set
  const hash = crypto.createHmac('sha256', secretHash).update(JSON.stringify(body)).digest('base64');
  return hash === signature;
}

async function processWebhook(headers, body) {
  if (!isValidSignature(headers, body)) {
    return { ok: false, reason: 'invalid_signature' };
  }
  if (body && body.event === 'charge.completed' && body.data && body.data.status === 'successful') {
    const data = body.data;
    const reference = data.tx_ref || data.flw_ref || data.reference;
    const verified = await verify(reference);
    if (verified && verified.status === 'successful') {
      const metadata = verified.meta || (verified.customer && verified.customer.meta) || {};
      return await handleSuccessfulPayment({
        provider: 'flutterwave',
        reference,
        amount: verified.amount,
        currency: verified.currency || 'NGN',
        metadata,
        raw: verified
      });
    }
  }
  return { ok: false };
}

async function initializePayment({ amount, email, metadata, currency = 'NGN' }) {
  const payload = {
    tx_ref: 'flw_' + Date.now(),
    amount,
    currency,
    redirect_url: process.env.FLW_REDIRECT_URL,
    meta: metadata,
    customer: { email }
  };
  const res = await axios.post(`${API_BASE}/payments`, payload, {
    headers: {
      Authorization: `Bearer ${process.env.FLW_SECRET_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  const data = res.data;
  if (data.status !== 'success') {
    throw new Error(data.message || 'Flutterwave init failed');
  }
  const link = (data.data && data.data.link) || (data.meta && data.meta.authorization && data.meta.authorization.redirect);
  return { authorizationUrl: link, reference: payload.tx_ref };
}

module.exports = { processWebhook, verify, initializePayment };