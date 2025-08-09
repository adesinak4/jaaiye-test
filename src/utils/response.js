const logger = require('./logger');

// Standardized response helpers
const successResponse = (res, data, statusCode = 200, message = null) => {
  const response = {
    success: true,
    data
  };

  if (message) {
    response.message = message;
  }

  // Do not log success responses to reduce noise
  return res.status(statusCode).json(response);
};

const errorResponse = (res, error, statusCode = 400) => {
  const response = {
    success: false,
    error: error.message || 'An error occurred'
  };

  // Minimal, sanitized error log, warn for 4xx, error for 5xx
  const logPayload = {
    statusCode,
    errorMessage: error.message || 'An error occurred'
  };
  if (statusCode >= 500) {
    logger.error('Error Response', logPayload);
  } else {
    logger.warn('Error Response', logPayload);
  }

  return res.status(statusCode).json(response);
};

const notFoundResponse = (res, message = 'Resource not found') => {
  return errorResponse(res, { message }, 404);
};

const unauthorizedResponse = (res, message = 'Unauthorized') => {
  return errorResponse(res, { message }, 401);
};

const forbiddenResponse = (res, message = 'Forbidden') => {
  return errorResponse(res, { message }, 403);
};

const conflictResponse = (res, message = 'Conflict') => {
  return errorResponse(res, { message }, 409);
};

const validationErrorResponse = (res, errors) => {
  const response = {
    success: false,
    error: 'Validation failed',
    errors
  };

  logger.warn('Validation Error Response', {
    statusCode: 400,
    errorMessage: 'Validation failed'
  });

  return res.status(400).json(response);
};

// User response formatter (DRY)
const formatUserResponse = (user) => {
  if (!user) {
    return user; // Return null/undefined as is
  }

  return {
    id: user._id,
    email: user.email,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    emailVerified: user.emailVerified,
    profilePicture: user.profilePicture,
    isActive: user.isActive,
    isBlocked: user.isBlocked,
    preferences: user.preferences,
    createdAt: user.createdAt
  };
};

module.exports = {
  successResponse,
  errorResponse,
  notFoundResponse,
  unauthorizedResponse,
  forbiddenResponse,
  conflictResponse,
  validationErrorResponse,
  formatUserResponse
};