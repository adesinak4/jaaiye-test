const {
  APP_CONSTANTS,
  EMAIL_CONSTANTS,
  QUEUE_CONSTANTS,
  VALIDATION_CONSTANTS,
  REPORT_CONSTANTS,
  API_CONSTANTS,
  ERROR_MESSAGES,
  SUCCESS_MESSAGES
} = require('../../constants');

describe('Constants', () => {
  describe('APP_CONSTANTS', () => {
    test('should have required properties', () => {
      expect(APP_CONSTANTS).toHaveProperty('APP_NAME');
      expect(APP_CONSTANTS).toHaveProperty('VERSION');
      expect(APP_CONSTANTS).toHaveProperty('ENVIRONMENT');
    });

    test('should have correct default values', () => {
      expect(APP_CONSTANTS.APP_NAME).toBe('Jaaiye');
      expect(APP_CONSTANTS.VERSION).toBe('1.0.0');
      // Environment will be 'test' when running tests
      expect(['development', 'test', 'production']).toContain(APP_CONSTANTS.ENVIRONMENT);
    });
  });

  describe('EMAIL_CONSTANTS', () => {
    test('should have required properties', () => {
      expect(EMAIL_CONSTANTS).toHaveProperty('VERIFICATION_EXPIRY');
      expect(EMAIL_CONSTANTS).toHaveProperty('PASSWORD_RESET_EXPIRY');
      expect(EMAIL_CONSTANTS).toHaveProperty('REFRESH_TOKEN_EXPIRY');
      expect(EMAIL_CONSTANTS).toHaveProperty('ACCESS_TOKEN_EXPIRY');
    });

    test('should have correct time values', () => {
      expect(EMAIL_CONSTANTS.VERIFICATION_EXPIRY).toBe(10 * 60 * 1000); // 10 minutes
      expect(EMAIL_CONSTANTS.PASSWORD_RESET_EXPIRY).toBe(60 * 60 * 1000); // 1 hour
      expect(EMAIL_CONSTANTS.REFRESH_TOKEN_EXPIRY).toBe(30 * 24 * 60 * 60 * 1000); // 30 days
      expect(EMAIL_CONSTANTS.ACCESS_TOKEN_EXPIRY).toBe(15 * 60 * 1000); // 15 minutes
    });
  });

  describe('QUEUE_CONSTANTS', () => {
    test('should have email queue constants', () => {
      expect(QUEUE_CONSTANTS.EMAIL).toHaveProperty('BATCH_SIZE');
      expect(QUEUE_CONSTANTS.EMAIL).toHaveProperty('BATCH_TIMEOUT');
      expect(QUEUE_CONSTANTS.EMAIL).toHaveProperty('MAX_RETRIES');

      expect(QUEUE_CONSTANTS.EMAIL.BATCH_SIZE).toBe(5);
      expect(QUEUE_CONSTANTS.EMAIL.BATCH_TIMEOUT).toBe(2000);
      expect(QUEUE_CONSTANTS.EMAIL.MAX_RETRIES).toBe(3);
    });

    test('should have report queue constants', () => {
      expect(QUEUE_CONSTANTS.REPORT).toHaveProperty('BATCH_SIZE');
      expect(QUEUE_CONSTANTS.REPORT).toHaveProperty('BATCH_TIMEOUT');
      expect(QUEUE_CONSTANTS.REPORT).toHaveProperty('MAX_RETRIES');

      expect(QUEUE_CONSTANTS.REPORT.BATCH_SIZE).toBe(3);
      expect(QUEUE_CONSTANTS.REPORT.BATCH_TIMEOUT).toBe(5000);
      expect(QUEUE_CONSTANTS.REPORT.MAX_RETRIES).toBe(2);
    });
  });

  describe('VALIDATION_CONSTANTS', () => {
    test('should have required properties', () => {
      expect(VALIDATION_CONSTANTS).toHaveProperty('PASSWORD_MIN_LENGTH');
      expect(VALIDATION_CONSTANTS).toHaveProperty('USERNAME_MIN_LENGTH');
      expect(VALIDATION_CONSTANTS).toHaveProperty('USERNAME_MAX_LENGTH');
      expect(VALIDATION_CONSTANTS).toHaveProperty('EMAIL_MAX_LENGTH');
      expect(VALIDATION_CONSTANTS).toHaveProperty('FULL_NAME_MAX_LENGTH');
    });

    test('should have correct values', () => {
      expect(VALIDATION_CONSTANTS.PASSWORD_MIN_LENGTH).toBe(8);
      expect(VALIDATION_CONSTANTS.USERNAME_MIN_LENGTH).toBe(3);
      expect(VALIDATION_CONSTANTS.USERNAME_MAX_LENGTH).toBe(30);
      expect(VALIDATION_CONSTANTS.EMAIL_MAX_LENGTH).toBe(254);
      expect(VALIDATION_CONSTANTS.FULL_NAME_MAX_LENGTH).toBe(100);
    });
  });

  describe('REPORT_CONSTANTS', () => {
    test('should have required properties', () => {
      expect(REPORT_CONSTANTS).toHaveProperty('TYPES');
      expect(REPORT_CONSTANTS).toHaveProperty('FORMATS');
      expect(REPORT_CONSTANTS).toHaveProperty('MAX_RECIPIENTS');
    });

    test('should have correct values', () => {
      expect(REPORT_CONSTANTS.TYPES).toEqual(['calendar', 'events', 'analytics', 'user']);
      expect(REPORT_CONSTANTS.FORMATS).toEqual(['pdf', 'csv', 'json']);
      expect(REPORT_CONSTANTS.MAX_RECIPIENTS).toBe(10);
    });
  });

  describe('API_CONSTANTS', () => {
    test('should have required properties', () => {
      expect(API_CONSTANTS).toHaveProperty('RATE_LIMIT_WINDOW_MS');
      expect(API_CONSTANTS).toHaveProperty('RATE_LIMIT_MAX_REQUESTS');
      expect(API_CONSTANTS).toHaveProperty('PAGINATION_DEFAULT_LIMIT');
      expect(API_CONSTANTS).toHaveProperty('PAGINATION_MAX_LIMIT');
    });

    test('should have correct values', () => {
      expect(API_CONSTANTS.RATE_LIMIT_WINDOW_MS).toBe(15 * 60 * 1000); // 15 minutes
      expect(API_CONSTANTS.RATE_LIMIT_MAX_REQUESTS).toBe(100);
      expect(API_CONSTANTS.PAGINATION_DEFAULT_LIMIT).toBe(20);
      expect(API_CONSTANTS.PAGINATION_MAX_LIMIT).toBe(100);
    });
  });

  describe('ERROR_MESSAGES', () => {
    test('should have validation error messages', () => {
      expect(ERROR_MESSAGES.VALIDATION).toHaveProperty('REQUIRED_FIELD');
      expect(ERROR_MESSAGES.VALIDATION).toHaveProperty('INVALID_EMAIL');
      expect(ERROR_MESSAGES.VALIDATION).toHaveProperty('PASSWORD_TOO_SHORT');
      expect(ERROR_MESSAGES.VALIDATION).toHaveProperty('USERNAME_TOO_SHORT');
      expect(ERROR_MESSAGES.VALIDATION).toHaveProperty('USERNAME_TOO_LONG');
    });

    test('should have auth error messages', () => {
      expect(ERROR_MESSAGES.AUTH).toHaveProperty('INVALID_CREDENTIALS');
      expect(ERROR_MESSAGES.AUTH).toHaveProperty('TOKEN_EXPIRED');
      expect(ERROR_MESSAGES.AUTH).toHaveProperty('UNAUTHORIZED');
      expect(ERROR_MESSAGES.AUTH).toHaveProperty('EMAIL_NOT_VERIFIED');
    });

    test('should have not found error messages', () => {
      expect(ERROR_MESSAGES.NOT_FOUND).toHaveProperty('USER');
      expect(ERROR_MESSAGES.NOT_FOUND).toHaveProperty('EVENT');
      expect(ERROR_MESSAGES.NOT_FOUND).toHaveProperty('CALENDAR');
      expect(ERROR_MESSAGES.NOT_FOUND).toHaveProperty('REPORT');
    });

    test('should have dynamic validation messages', () => {
      expect(ERROR_MESSAGES.VALIDATION.PASSWORD_TOO_SHORT).toContain('8');
      expect(ERROR_MESSAGES.VALIDATION.USERNAME_TOO_SHORT).toContain('3');
      expect(ERROR_MESSAGES.VALIDATION.USERNAME_TOO_LONG).toContain('30');
    });
  });

  describe('SUCCESS_MESSAGES', () => {
    test('should have user success messages', () => {
      expect(SUCCESS_MESSAGES.USER).toHaveProperty('REGISTERED');
      expect(SUCCESS_MESSAGES.USER).toHaveProperty('LOGGED_IN');
      expect(SUCCESS_MESSAGES.USER).toHaveProperty('EMAIL_VERIFIED');
      expect(SUCCESS_MESSAGES.USER).toHaveProperty('PASSWORD_RESET');
      expect(SUCCESS_MESSAGES.USER).toHaveProperty('PROFILE_UPDATED');
      expect(SUCCESS_MESSAGES.USER).toHaveProperty('LOGGED_OUT');
    });

    test('should have email success messages', () => {
      expect(SUCCESS_MESSAGES.EMAIL).toHaveProperty('VERIFICATION_SENT');
      expect(SUCCESS_MESSAGES.EMAIL).toHaveProperty('PASSWORD_RESET_SENT');
      expect(SUCCESS_MESSAGES.EMAIL).toHaveProperty('WELCOME_SENT');
    });

    test('should have report success messages', () => {
      expect(SUCCESS_MESSAGES.REPORT).toHaveProperty('QUEUED');
      expect(SUCCESS_MESSAGES.REPORT).toHaveProperty('GENERATED');
    });
  });
});