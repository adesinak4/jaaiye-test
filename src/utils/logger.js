const winston = require('winston');
const path = require('path');
const { sanitizeLogData } = require('./logSanitizer');

const combinedLogPath = path.join(__dirname, '../..', 'logs', 'combined.log');
const errorLogPath = path.join(__dirname, '../..', 'logs', 'error.log');

const LOG_INCLUDE_STACK = process.env.LOG_INCLUDE_STACK === 'true';

// Derive allowed levels: LOG_LEVELS wins; otherwise pick sensible defaults per env
function parseAllowedLevels() {
  const raw = process.env.LOG_LEVELS;
  if (raw && raw.trim().length > 0) {
    const set = new Set(
      raw
        .split(',')
        .map(l => l.trim().toLowerCase())
        .filter(Boolean)
    );
    return set;
  }
  // Fallback by NODE_ENV
  if ((process.env.NODE_ENV || 'development') === 'production') {
    return new Set(['info', 'warn', 'error']);
  }
  return new Set(['debug', 'info', 'warn', 'error']);
}

let ALLOWED_LEVELS = parseAllowedLevels();

// Set logger threshold to the most permissive; gating handled in wrappers
const logger = winston.createLogger({
  level: 'silly',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: {
    environment: process.env.NODE_ENV || 'development'
  },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({
      filename: combinedLogPath,
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    }),
    new winston.transports.File({
      filename: errorLogPath,
      level: 'error',
      maxsize: 10485760, // 10MB
      maxFiles: 5,
      tailable: true
    })
  ]
});

// Enhanced logging methods with error handling, redaction, and controlled stacks
const wrapLoggerMethod = (level) => {
  const original = logger[level].bind(logger);
  return (message, errorOrInfo) => {
    if (!ALLOWED_LEVELS.has(level)) return; // Gate by configured level set

    const base = { message };

    if (errorOrInfo instanceof Error) {
      base.error = errorOrInfo.message;
      if (LOG_INCLUDE_STACK && errorOrInfo.stack) {
        base.stack = errorOrInfo.stack;
      }
      if (errorOrInfo.code) base.code = errorOrInfo.code;
      if (errorOrInfo.name) base.name = errorOrInfo.name;
    } else if (errorOrInfo && typeof errorOrInfo === 'object') {
      Object.assign(base, sanitizeLogData(errorOrInfo));
    }

    original(base);
  };
};

logger.error = wrapLoggerMethod('error');
logger.warn = wrapLoggerMethod('warn');
logger.info = wrapLoggerMethod('info');
logger.debug = wrapLoggerMethod('debug');

// Allow runtime update of allowed levels (useful for tests or admin toggles)
logger.setAllowedLevels = (levels) => {
  if (Array.isArray(levels)) {
    ALLOWED_LEVELS = new Set(levels.map(l => String(l).toLowerCase()));
  } else if (levels instanceof Set) {
    ALLOWED_LEVELS = new Set(Array.from(levels).map(l => String(l).toLowerCase()));
  }
};

module.exports = logger;