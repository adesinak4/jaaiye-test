const { v4: uuidv4 } = require('uuid');
const logger = require('../utils/logger');

// In-memory cache for idempotency keys (in production, use Redis)
const idempotencyCache = new Map();

// Clean up old entries every hour
setInterval(() => {
  const oneHourAgo = Date.now() - (60 * 60 * 1000);
  for (const [key, value] of idempotencyCache.entries()) {
    if (value.timestamp < oneHourAgo) {
      idempotencyCache.delete(key);
    }
  }
}, 60 * 60 * 1000);

/**
 * Middleware to handle idempotency keys for payment requests
 * Ensures duplicate requests return the same response
 */
function idempotencyMiddleware(req, res, next) {
  // Only apply to POST requests for payment endpoints
  if (req.method !== 'POST' || !req.path.includes('/payments/')) {
    return next();
  }

  // Get idempotency key from header
  const idempotencyKey = req.headers['x-idempotency-key'] || req.headers['X-Idempotency-Key'];

  if (!idempotencyKey) {
    // Generate a new idempotency key if none provided
    req.idempotencyKey = uuidv4();
    logger.info('Generated new idempotency key', {
      key: req.idempotencyKey,
      path: req.path
    });
    return next();
  }

  // Check if we've seen this key before
  const cachedResponse = idempotencyCache.get(idempotencyKey);

  if (cachedResponse) {
    logger.info('Returning cached response for idempotency key', {
      key: idempotencyKey,
      path: req.path
    });

    // Set cache hit header
    res.set('X-Idempotency-Cache-Hit', 'true');
    return res.status(cachedResponse.status).json(cachedResponse.data);
  }

  // Store the idempotency key for this request
  req.idempotencyKey = idempotencyKey;

  // Override res.json to cache successful responses
  const originalJson = res.json;
  res.json = function(data) {
    // Only cache successful responses (2xx status codes)
    if (res.statusCode >= 200 && res.statusCode < 300) {
      idempotencyCache.set(idempotencyKey, {
        status: res.statusCode,
        data: data,
        timestamp: Date.now()
      });

      logger.info('Cached response for idempotency key', {
        key: idempotencyKey,
        status: res.statusCode,
        path: req.path
      });
    }

    return originalJson.call(this, data);
  };

  next();
}

/**
 * Generate a unique idempotency key for a payment request
 * Combines user ID, event ID, and timestamp for uniqueness
 */
function generatePaymentIdempotencyKey(userId, eventId, ticketTypeId, amount) {
  const timestamp = Math.floor(Date.now() / 1000); // Unix timestamp in seconds
  const data = `${userId}-${eventId}-${ticketTypeId}-${amount}-${timestamp}`;

  // Create a deterministic UUID-like key
  const hash = require('crypto')
    .createHash('sha256')
    .update(data)
    .digest('hex')
    .substring(0, 32);

  // Format as UUID
  return [
    hash.substring(0, 8),
    hash.substring(8, 12),
    hash.substring(12, 16),
    hash.substring(16, 20),
    hash.substring(20, 32)
  ].join('-');
}

/**
 * Validate idempotency key format
 */
function isValidIdempotencyKey(key) {
  if (!key || typeof key !== 'string') {
    return false;
  }

  // UUID v4 format validation
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(key);
}

module.exports = {
  idempotencyMiddleware,
  generatePaymentIdempotencyKey,
  isValidIdempotencyKey
};
