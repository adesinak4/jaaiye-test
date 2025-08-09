// Application constants
const APP_CONSTANTS = {
  APP_NAME: process.env.APP_NAME || 'Jaaiye',
  VERSION: '1.0.0',
  ENVIRONMENT: process.env.NODE_ENV || 'development'
};

// Email constants
const EMAIL_CONSTANTS = {
  VERIFICATION_EXPIRY: 10 * 60 * 1000, // 10 minutes
  PASSWORD_RESET_EXPIRY: 60 * 60 * 1000, // 1 hour
  REFRESH_TOKEN_EXPIRY: 30 * 24 * 60 * 60 * 1000, // 30 days
  ACCESS_TOKEN_EXPIRY: 15 * 60 * 1000 // 15 minutes
};

// Queue constants
const QUEUE_CONSTANTS = {
  EMAIL: {
    BATCH_SIZE: 5,
    BATCH_TIMEOUT: 2000,
    MAX_RETRIES: 3
  },
  REPORT: {
    BATCH_SIZE: 3,
    BATCH_TIMEOUT: 5000,
    MAX_RETRIES: 2
  }
};

// Validation constants
const VALIDATION_CONSTANTS = {
  PASSWORD_MIN_LENGTH: 8,
  USERNAME_MIN_LENGTH: 3,
  USERNAME_MAX_LENGTH: 30,
  EMAIL_MAX_LENGTH: 254,
  FULL_NAME_MAX_LENGTH: 100
};

// Report constants
const REPORT_CONSTANTS = {
  TYPES: ['calendar', 'events', 'analytics', 'user'],
  FORMATS: ['pdf', 'csv', 'json'],
  MAX_RECIPIENTS: 10
};

// API constants
const API_CONSTANTS = {
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
  PAGINATION_DEFAULT_LIMIT: 20,
  PAGINATION_MAX_LIMIT: 100
};

// Error messages
const ERROR_MESSAGES = {
  VALIDATION: {
    REQUIRED_FIELD: 'This field is required',
    INVALID_EMAIL: 'Please provide a valid email address',
    PASSWORD_TOO_SHORT: `Password must be at least ${VALIDATION_CONSTANTS.PASSWORD_MIN_LENGTH} characters`,
    USERNAME_TOO_SHORT: `Username must be at least ${VALIDATION_CONSTANTS.USERNAME_MIN_LENGTH} characters`,
    USERNAME_TOO_LONG: `Username must be no more than ${VALIDATION_CONSTANTS.USERNAME_MAX_LENGTH} characters`
  },
  AUTH: {
    INVALID_CREDENTIALS: 'Invalid credentials',
    TOKEN_EXPIRED: 'Token has expired',
    UNAUTHORIZED: 'Unauthorized access',
    EMAIL_NOT_VERIFIED: 'Please verify your email before logging in',
    USER_EXISTS: 'User already exists with this email'
  },
  NOT_FOUND: {
    USER: 'User not found',
    EVENT: 'Event not found',
    CALENDAR: 'Calendar not found',
    REPORT: 'Report not found'
  }
};

// Success messages
const SUCCESS_MESSAGES = {
  USER: {
    REGISTERED: 'Account created successfully',
    LOGGED_IN: 'Login successful',
    EMAIL_VERIFIED: 'Email verified successfully',
    PASSWORD_RESET: 'Password reset successfully',
    PROFILE_UPDATED: 'Profile updated successfully',
    LOGGED_OUT: 'Logged out successfully'
  },
  EMAIL: {
    VERIFICATION_SENT: 'Verification code sent to email',
    PASSWORD_RESET_SENT: 'Password reset code sent to email',
    WELCOME_SENT: 'Welcome email sent'
  },
  REPORT: {
    QUEUED: 'Report generation has been queued',
    GENERATED: 'Report generated successfully'
  }
};

module.exports = {
  APP_CONSTANTS,
  EMAIL_CONSTANTS,
  QUEUE_CONSTANTS,
  VALIDATION_CONSTANTS,
  REPORT_CONSTANTS,
  API_CONSTANTS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
};