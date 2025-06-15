const logger = require('../utils/logger');

// Validation error handler
const handleValidationError = (error) => {
  const errors = Object.values(error.errors).map(error => ({
    type: 'field',
    value: error.value,
    msg: error.msg,
    path: error.path,
    location: error.location
  }));

  logger.error('Validation Error', error, 400, { errors });

  return {
    success: false,
    errors
  };
};

// JWT error handler
const handleJWTError = (error) => {
  logger.error('JWT Error', error, 401);

  return {
    success: false,
    error: 'Invalid token'
  };
};

// JWT expired error handler
const handleJWTExpiredError = (error) => {
  logger.error('JWT Expired', error, 401);

  return {
    success: false,
    error: 'Token expired'
  };
};

// Duplicate key error handler
const handleDuplicateKeyError = (error) => {
  const field = Object.keys(error.keyValue)[0];
  logger.error('Duplicate Key Error', error, 409, { field });

  return {
    success: false,
    error: `${field} already exists`
  };
};

// Cast error handler (invalid MongoDB ObjectId)
const handleCastError = (error) => {
  logger.error('Cast Error', error, 400);

  return {
    success: false,
    error: 'Invalid ID format'
  };
};

// Default error handler
const handleDefaultError = (error) => {
  logger.error('Server Error', error, 500);

  return {
    success: false,
    error: 'Something went wrong'
  };
};

// Main error handler middleware
const errorHandler = (error, req, res, next) => {
  let error = { ...error };
  error.message = error.message;

  // Log the full error details
  logger.error('Request Error', error, 500, {
    path: req.path,
    method: req.method,
    body: req.body,
    params: req.params,
    query: req.query,
    user: req.user ? req.user.id : 'unauthenticated'
  });

  // Handle specific error types
  if (error.name === 'ValidationError') {
    return res.status(400).json(handleValidationError(error));
  }
  if (error.name === 'JsonWebTokenError') {
    return res.status(401).json(handleJWTError(error));
  }
  if (error.name === 'TokenExpiredError') {
    return res.status(401).json(handleJWTExpiredError(error));
  }
  if (error.code === 11000) {
    return res.status(409).json(handleDuplicateKeyError(error));
  }
  if (error.name === 'CastError') {
    return res.status(400).json(handleCastError(error));
  }

  // Handle unknown errors
  return res.status(500).json(handleDefaultError(error));
};

module.exports = errorHandler;