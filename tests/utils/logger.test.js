// Mock winston
const mockLogger = {
  error: jest.fn(),
  warn: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

jest.mock('winston', () => ({
  createLogger: jest.fn(() => mockLogger),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn(),
    colorize: jest.fn(),
    simple: jest.fn()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

describe('Logger', () => {
  let logger;

  beforeEach(() => {
    // Clear any mocks
    jest.clearAllMocks();
    // Re-require the logger to get a fresh instance
    jest.resetModules();
    logger = require('../../src/utils/logger');
  });

  describe('Logger Configuration', () => {
    test('should have required log levels', () => {
      expect(logger.error).toBeDefined();
      expect(logger.warn).toBeDefined();
      expect(logger.info).toBeDefined();
      expect(logger.debug).toBeDefined();
    });

    test('should be functions', () => {
      expect(typeof logger.error).toBe('function');
      expect(typeof logger.warn).toBe('function');
      expect(typeof logger.info).toBe('function');
      expect(typeof logger.debug).toBe('function');
    });
  });

  describe('Logging Methods', () => {
    test('should not throw when calling log methods', () => {
      expect(() => logger.error('Test error message')).not.toThrow();
      expect(() => logger.warn('Test warning message')).not.toThrow();
      expect(() => logger.info('Test info message')).not.toThrow();
      expect(() => logger.debug('Test debug message')).not.toThrow();
    });
  });

  describe('Log Format', () => {
    test('should handle objects in log messages', () => {
      const testObject = { key: 'value', number: 123 };
      expect(() => logger.info('Test message', testObject)).not.toThrow();
    });

    test('should handle arrays in log messages', () => {
      const testArray = ['item1', 'item2', 'item3'];
      expect(() => logger.info('Test message', testArray)).not.toThrow();
    });
  });

  describe('Environment Handling', () => {
    test('should work in development environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      expect(() => logger.info('Development test message')).not.toThrow();

      process.env.NODE_ENV = originalEnv;
    });

    test('should work in production environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      expect(() => logger.info('Production test message')).not.toThrow();

      process.env.NODE_ENV = originalEnv;
    });

    test('should work in test environment', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'test';

      expect(() => logger.info('Test environment message')).not.toThrow();

      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Error Handling', () => {
    test('should handle null messages', () => {
      expect(() => logger.info(null)).not.toThrow();
    });

    test('should handle undefined messages', () => {
      expect(() => logger.info(undefined)).not.toThrow();
    });

    test('should handle empty string messages', () => {
      expect(() => logger.info('')).not.toThrow();
    });
  });
});