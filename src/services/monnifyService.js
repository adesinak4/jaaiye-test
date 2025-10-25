const crypto = require('crypto');
const axios = require('axios');
const { handleSuccessfulPayment } = require('./paymentCommonService');

async function login() {
    try {
        const credentials = Buffer.from(`{apiKey}:${secretKey}`).toString('base64');
        const res = await axios.post(`${process.env.MONNIFY_API_BASE}/api/v1/auth/login`, {
            headers: { Authorization: `Basic ${credentials}` }
        });

        const data = res.data;
        return data && data.requestSuccessful === 'true' ? data : null;
    } catch (error) {
        console.error('Error login in:', error.response?.data || error.message);
        return null;
    }
}

async function verify(transactionId) {
    const tokenData = await login();
    const token = tokenData?.responseBody?.accessToken || null;
    try {
        const res = await axios.get(`${process.env.MONNIFY_API_BASE}/transactions/${encodeURIComponent(transactionId)}`, {
            headers: { Authorization: `Bearer ${token}` }
        });

        const data = res.data;
        return data && data.responseMessage === 'success' ? data.data : null;
    } catch (error) {
        console.error('Error verifying transaction:', error.response?.data || error.message);
        return null;
    }
}

function computeHash(requestBody) {
    return crypto
        .createHmac('sha512', process.env.MONNIFY_SECRET_KEY)
        .update(requestBody)
        .digest('hex');
}

async function verifyWebhook(requestBody) {
    const signature = headers['monnify-signature'];
    const stringifiedBody = JSON.stringify(requestBody);
    const hash = computeHash(stringifiedBody);

    console.log("Computed hash:", hash);

    // You can optionally use this hash to compare with a signature header for verification
    return hash === signature;
}

async function processWebhook(headers, body) {
    // Validate signature first
    if (!isValidSignature(headers, body)) {
        console.error('Invalid Monnify webhook signature');
        return { ok: false, reason: 'invalid_signature' };
    }

    // Check for successful payment event
    if (body && body.event === 'charge.completed' && body.data && body.data.status === 'successful') {
        const data = body.data;
        const reference = data.id;

        if (!reference) {
            console.error('No reference found in Monnify webhook');
            return { ok: false, reason: 'no_reference' };
        }

        try {
            // Verify the transaction with Monnify API
            const verified = await verify(transId);
            if (verified && verified.status === 'successful') {
                const metadata = verified.meta || (verified.customer && verified.customer.meta) || {};

                // Process payment (this should be idempotent)
                return await handleSuccessfulPayment({
                    provider: 'monnify',
                    reference,
                    amount: verified.amount,
                    currency: verified.currency || 'NGN',
                    metadata,
                    raw: verified
                });
            } else {
                console.warn('Monnify transaction verification failed for reference:', reference);
                return { ok: false, reason: 'verification_failed' };
            }
        } catch (error) {
            console.error('Error processing Monnify webhook:', error);
            return { ok: false, reason: 'processing_error', error: error.message };
        }
    }

    console.log('Monnify webhook event not processed:', body?.event);
    return { ok: false, reason: 'event_not_handled' };
}

async function initializePayment({ amount, email, metadata, currencyCode = 'NGN' }) {
    const payload = {
        paymentReference: 'mnfy_' + Date.now(),
        amount,
        currencyCode,
        contractCode: process.env.MONNIFY_CONTRACT_CODE,
        redirect_url: process.env.FLW_REDIRECT_URL,
        meta: metadata,
        customerEmail: email
    };

    const tokenData = await login();
    const token = tokenData?.responseBody?.accessToken || null;

    try {
        const res = await axios.post(`${process.env.MONNIFY_API_BASE}/api/v1/merchant/transactions/init-transaction`, payload, {
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        });

        const data = res.data;
        const isCachedResponse = res.headers['x-idempotency-cache-hit'] === 'true';

        console.log('Monnify response:', {
            status: data.responseMessage
        });

        if (data.responseMessage !== 'success') {
            throw new Error(data.message || 'Monnify init failed');
        }

        const link = data.responseBody.checkoutUrl;

        // Create transaction record for polling backup
        try {
            const Transaction = require('../models/Transaction');
            await Transaction.create({
                provider: 'monnify',
                reference: payload.paymentReference,
                transReference: data.responseBody.transactionReference,
                amount,
                currency: currencyCode,
                userId: metadata.userId,
                eventId: metadata.eventId,
                ticketTypeId: metadata.ticketTypeId || null,
                quantity: metadata.quantity || 1,
                metadata,
                status: 'pending'
            });
            console.log('Transaction record created for polling:', payload.paymentReference);
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
            reference: payload.paymentReference
        };
    } catch (error) {
        console.error('Monnify API error:', {
            message: error.message,
            response: error.response?.data
        });
        throw new Error(`Monnify payment initialization failed: ${error.response?.data?.message || error.message}`);
    }
}

// Background job to poll for pending transactions
async function pollPendingTransactions() {
    try {
        // Get pending transactions from your database
        const Transaction = require('../models/Transaction');
        const pendingTransactions = await Transaction.find({
            provider: 'monnify',
            status: 'pending',
            createdAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } // Last 2 hours
        }).limit(50); // Limit to avoid overwhelming the API

        console.log(`Polling ${pendingTransactions.length} pending Monnify transactions`);

        for (const transaction of pendingTransactions) {
            try {
                const verified = await verify(transaction.transReference);
                if (verified && verified.responseMessage === 'successful') {
                    console.log(`Processing pending transaction: ${transaction.reference}`);
                    const metadata = verified.responseBody.metadata || { userId: transaction.userId, eventId: transaction.eventId, quantity: transaction.quantity } || {};

                    await handleSuccessfulPayment({
                        provider: 'monnify',
                        reference: transaction.reference,
                        amount: verified.responseBody.amount,
                        currency: verified.responseBody.currency || 'NGN',
                        metadata,
                        raw: verified
                    });
                } else if (verified && verified.responseMessage === 'failed') {
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
        console.error('Error in Monnify polling job:', error);
    }
}

module.exports = { processWebhook, verify, initializePayment, pollPendingTransactions };