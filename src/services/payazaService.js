const crypto = require('crypto');
const axios = require('axios');
const { handleSuccessfulPayment } = require('./paymentCommonService');
const API_BASE = 'https://api.payaza.africa';

async function verify(reference) {
  const res = await axios.get(`${API_BASE}/transaction/verify/${encodeURIComponent(reference)}`, {
    headers: { Authorization: `Bearer ${process.env.PAYAZA_SECRET_KEY}` }
  });
  const data = res.data;
  return data && data.status ? data.data : null;
}

function isValidSignature(headers, body) {
  const signature = headers['x-payaza-signature'];
  if (!signature || !process.env.PAYAZA_SECRET_KEY) return true; // allow in dev if no key
  const hash = crypto.createHmac('sha512', process.env.PAYAZA_SECRET_KEY).update(body, 'utf8').digest('base64');
  return hash === signature;
}

async function processWebhook(headers, body) {
  if (!isValidSignature(headers, body)) {
    return { ok: false, reason: 'invalid_signature' };
  }
  if (body && body.event === 'charge.success') {
    const reference = body.data && body.data.reference;
    const verified = await verify(reference);
    if (verified && verified.status === 'success') {
      const metadata = verified.metadata || {};
      return await handleSuccessfulPayment({
        provider: 'paystack',
        reference,
        amount: verified.amount / 100,
        currency: verified.currency || 'NGN',
        metadata,
        raw: verified
      });
    }
  }
  return { ok: false };
}

async function initializePayment({ amount, email, metadata }) {
  const payload = {
    amount: Math.round(amount * 100),
    email,
    metadata,
    callback_url: process.env.PAYAZA_CALLBACK_URL
  };
  const res = await axios.post(`${API_BASE}/transaction/initialize`, payload, {
    headers: {
      Authorization: `Bearer ${process.env.PAYAZA_SECRET_KEY}`,
      'Content-Type': 'application/json'
    }
  });
  const data = res.data;
  if (!data.status) {
    throw new Error(data.message || 'Payaza init failed');
  }
  return { authorizationUrl: data.data.authorization_url, reference: data.data.reference };
}

module.exports = { processWebhook, verify, initializePayment };


