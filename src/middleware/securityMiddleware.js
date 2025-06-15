const rateLimit = require('express-rate-limit');
const { generateDeviceFingerprint, rateLimitKey } = require('../services/authService');

// Rate limiting
exports.apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
  keyGenerator: rateLimitKey,
  message: 'Too many requests from this IP, please try again later'
});

// API Key validation
exports.validateApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key is required'
    });
  }

  try {
    const user = await User.findOne({ apiKey });
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid API key'
      });
    }

    req.user = user;
    next();
  } catch(error) {
    res.status(500).json({
      success: false,
      error: 'Error validating API key'
    });
  }
};

// Device fingerprint validation
exports.validateDevice = (req, res, next) => {
  const deviceFingerprint = generateDeviceFingerprint(req);
  req.deviceFingerprint = deviceFingerprint;
  next();
};

// Security headers
exports.securityHeaders = (req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'");
  next();
};

// Request sanitization
exports.sanitizeRequest = (req, res, next) => {
  // Sanitize body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
      }
    });
  }

  // Sanitize query
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key].trim();
      }
    });
  }

  next();
};