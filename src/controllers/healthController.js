const mongoose = require('mongoose');
const logger = require('../utils/logger')

// Basic health check
exports.healthCheck = (req, res, next) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
};

// Detailed health check including database status
exports.detailedHealthCheck = async (req, res, next) => {
  try {
    const dbState = mongoose.connection.readyState;
    const dbStatus = dbState === 1 ? 'connected' : 'disconnected';

    res.status(200).json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      database: {
        status: dbStatus,
        connectionState: dbState
      },
      memory: {
        usage: process.memoryUsage()
      }
    });
  } catch(error) {
    logger.error('Failed to process request', error);
    res.status(500).json({
      status: 'error',
      error: error.message
    });
  }
};