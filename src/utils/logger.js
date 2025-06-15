const winston = require('winston');
const path = require('path');

const combinedLogPath = path.join(__dirname, '../..', 'logs', 'combined.log');
const errorLogPath = path.join(__dirname, '../..', 'logs', 'error.log');

const logger = winston.createLogger({
  level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
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

// Enhanced logging methods with error handling and additional info
const wrapLoggerMethod = (level) => {
  const original = logger[level].bind(logger);
  return (message, errorOrInfo) => {
    const logData = {
      message,
      ...(errorOrInfo instanceof Error ? {
        error: errorOrInfo.message,
        stack: errorOrInfo.stack
      } : errorOrInfo)
    };
    original(logData);
  };
};

logger.error = wrapLoggerMethod('error');
logger.warn = wrapLoggerMethod('warn');
logger.info = wrapLoggerMethod('info');
logger.debug = wrapLoggerMethod('debug');

module.exports = logger;