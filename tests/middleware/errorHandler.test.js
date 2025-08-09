const errorHandler = require('../../src/middleware/errorHandler');
const logger = require('../../src/utils/logger');

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
}));

describe('ErrorHandler', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      method: 'POST',
      url: '/api/test',
      headers: { 'user-agent': 'test-agent' },
      body: { test: 'data' }
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    mockNext = jest.fn();
  });

  describe('Custom Error Classes', () => {
    test('should create AppError with correct properties', () => {
      const error = new errorHandler.AppError('Test error', 400);

      expect(error.message).toBe('Test error');
      expect(error.statusCode).toBe(400);
      expect(error.status).toBe('fail');
      expect(error.isOperational).toBe(true);
    });

    test('should create ValidationError with correct properties', () => {
      const error = new errorHandler.ValidationError('Validation failed');

      expect(error.message).toBe('Validation failed');
      expect(error.statusCode).toBe(422);
      expect(error.status).toBe('fail');
    });

    test('should create NotFoundError with correct properties', () => {
      const error = new errorHandler.NotFoundError('Resource not found');

      expect(error.message).toBe('Resource not found');
      expect(error.statusCode).toBe(404);
      expect(error.status).toBe('fail');
    });

    test('should create AuthenticationError with correct properties', () => {
      const error = new errorHandler.AuthenticationError('Authentication failed');

      expect(error.message).toBe('Authentication failed');
      expect(error.statusCode).toBe(401);
      expect(error.status).toBe('fail');
    });

    test('should create AuthorizationError with correct properties', () => {
      const error = new errorHandler.AuthorizationError('Authorization failed');

      expect(error.message).toBe('Authorization failed');
      expect(error.statusCode).toBe(403);
      expect(error.status).toBe('fail');
    });

    test('should create ConflictError with correct properties', () => {
      const error = new errorHandler.ConflictError('Conflict occurred');

      expect(error.message).toBe('Conflict occurred');
      expect(error.statusCode).toBe(409);
      expect(error.status).toBe('fail');
    });
  });

  describe('Error Handler Middleware', () => {
    test('should handle operational errors', () => {
      const error = new errorHandler.AppError('Test error', 400);

      errorHandler.errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        status: 'fail',
        message: 'Test error'
      });
      expect(logger.error).toHaveBeenCalled();
    });

    test('should handle validation errors', () => {
      const error = new errorHandler.ValidationError('Validation failed');

      errorHandler.errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        status: 'fail',
        message: 'Validation failed'
      });
    });

    test('should handle not found errors', () => {
      const error = new errorHandler.NotFoundError('Resource not found');

      errorHandler.errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        status: 'fail',
        message: 'Resource not found'
      });
    });

    test('should handle authentication errors', () => {
      const error = new errorHandler.AuthenticationError('Authentication failed');

      errorHandler.errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        status: 'fail',
        message: 'Authentication failed'
      });
    });

    test('should handle authorization errors', () => {
      const error = new errorHandler.AuthorizationError('Authorization failed');

      errorHandler.errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        status: 'fail',
        message: 'Authorization failed'
      });
    });

    test('should handle conflict errors', () => {
      const error = new errorHandler.ConflictError('Conflict occurred');

      errorHandler.errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        status: 'fail',
        message: 'Conflict occurred'
      });
    });

    test('should handle JWT errors', () => {
      const error = new Error('jwt malformed');

      errorHandler.errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        status: 'fail',
        message: 'Invalid token'
      });
    });

    test('should handle JWT expired errors', () => {
      const error = new Error('jwt expired');

      errorHandler.errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        status: 'fail',
        message: 'Token expired'
      });
    });

    test('should handle CastError (MongoDB)', () => {
      const error = new Error('Cast to ObjectId failed');
      error.name = 'CastError';

      errorHandler.errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        status: 'fail',
        message: 'Invalid ID format'
      });
    });

    test('should handle ValidationError (MongoDB)', () => {
      const error = new Error('Validation failed');
      error.name = 'ValidationError';

      errorHandler.errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        status: 'fail',
        message: 'Validation failed'
      });
    });

    test('should handle duplicate key errors', () => {
      const error = new Error('Duplicate field value');
      error.code = 11000;

      errorHandler.errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(409);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        status: 'fail',
        message: 'Duplicate field value'
      });
    });

    test('should handle generic errors in development', () => {
      process.env.NODE_ENV = 'development';
      const error = new Error('Generic error');

      errorHandler.errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        status: 'error',
        message: 'Generic error',
        stack: error.stack
      });

      process.env.NODE_ENV = 'test';
    });

    test('should handle generic errors in production', () => {
      process.env.NODE_ENV = 'production';
      const error = new Error('Generic error');

      errorHandler.errorHandler(error, mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        status: 'error',
        message: 'Internal server error'
      });

      process.env.NODE_ENV = 'test';
    });
  });

  describe('Error Logging', () => {
    test('should log operational errors', () => {
      const error = new errorHandler.AppError('Test error', 400);

      errorHandler.errorHandler(error, mockReq, mockRes, mockNext);

      expect(logger.error).toHaveBeenCalledWith(
        'Operational error',
        expect.objectContaining({
          error: error.message,
          statusCode: error.statusCode,
          stack: error.stack,
          request: expect.objectContaining({
            method: mockReq.method,
            url: mockReq.url
          })
        })
      );
    });

    test('should log programming errors', () => {
      const error = new Error('Programming error');

      errorHandler.errorHandler(error, mockReq, mockRes, mockNext);

      expect(logger.error).toHaveBeenCalledWith(
        'Programming error',
        expect.objectContaining({
          error: error.message,
          stack: error.stack,
          request: expect.objectContaining({
            method: mockReq.method,
            url: mockReq.url
          })
        })
      );
    });
  });
});