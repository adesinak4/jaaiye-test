const logger = require('./logger');
const { sanitizeLogData } = require('./logSanitizer');

// Async handler wrapper
const asyncHandler = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};

// Minimal request logging middleware (one line per request), gated by env
const requestLogger = (req, res, next) => {
  if (process.env.LOG_REQUESTS !== 'true') return next();

  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    const info = sanitizeLogData({
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      durationMs: duration,
      userId: req.user?.id,
    });
    logger.info('Request', info);
  });

  next();
};

module.exports = {
  asyncHandler,
  requestLogger
};