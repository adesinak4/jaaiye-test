const { validationResult } = require('express-validator');
const validationMiddleware = require('../../src/middleware/validationMiddleware');

// Mock express-validator
jest.mock('express-validator', () => ({
  validationResult: jest.fn()
}));

describe('ValidationMiddleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      body: {},
      headers: {}
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    mockNext = jest.fn();
  });

  describe('validate', () => {
    test('should continue if no validation errors', () => {
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => []
      });

      validationMiddleware.validate(mockReq, mockRes, mockNext);

      expect(validationResult).toHaveBeenCalledWith(mockReq);
      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    test('should return validation errors if present', () => {
      const errors = [
        { msg: 'Email is required', param: 'email', location: 'body' },
        { msg: 'Password must be at least 8 characters', param: 'password', location: 'body' }
      ];

      validationResult.mockReturnValue({
        isEmpty: () => false,
        array: () => errors
      });

      validationMiddleware.validate(mockReq, mockRes, mockNext);

      expect(validationResult).toHaveBeenCalledWith(mockReq);
      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        status: 'fail',
        message: 'Validation failed',
        errors: errors
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    test('should handle empty validation result', () => {
      validationResult.mockReturnValue({
        isEmpty: () => true,
        array: () => []
      });

      validationMiddleware.validate(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('sanitizeInput', () => {
    test('should sanitize request body', () => {
      mockReq.body = {
        email: '  TEST@EXAMPLE.COM  ',
        username: '  test_user  ',
        fullName: '  Test User  '
      };

      validationMiddleware.sanitizeInput(mockReq, mockRes, mockNext);

      expect(mockReq.body.email).toBe('test@example.com');
      expect(mockReq.body.username).toBe('test_user');
      expect(mockReq.body.fullName).toBe('Test User');
      expect(mockNext).toHaveBeenCalled();
    });

    test('should handle empty body', () => {
      mockReq.body = {};

      validationMiddleware.sanitizeInput(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('should handle null values', () => {
      mockReq.body = {
        email: null,
        username: undefined,
        fullName: ''
      };

      validationMiddleware.sanitizeInput(mockReq, mockRes, mockNext);

      expect(mockReq.body.email).toBe('');
      expect(mockReq.body.username).toBe('');
      expect(mockReq.body.fullName).toBe('');
      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('validatePagination', () => {
    test('should set default pagination values', () => {
      mockReq.query = {};

      validationMiddleware.validatePagination(mockReq, mockRes, mockNext);

      expect(mockReq.query.page).toBe('1');
      expect(mockReq.query.limit).toBe('20');
      expect(mockNext).toHaveBeenCalled();
    });

    test('should validate and set pagination values', () => {
      mockReq.query = {
        page: '2',
        limit: '10'
      };

      validationMiddleware.validatePagination(mockReq, mockRes, mockNext);

      expect(mockReq.query.page).toBe('2');
      expect(mockReq.query.limit).toBe('10');
      expect(mockNext).toHaveBeenCalled();
    });

    test('should handle invalid page number', () => {
      mockReq.query = {
        page: '-1',
        limit: '10'
      };

      validationMiddleware.validatePagination(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        status: 'fail',
        message: 'Page number must be a positive integer'
      });
    });

    test('should handle invalid limit', () => {
      mockReq.query = {
        page: '1',
        limit: '200'
      };

      validationMiddleware.validatePagination(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        status: 'fail',
        message: 'Limit must be between 1 and 100'
      });
    });
  });

  describe('validateSorting', () => {
    test('should set default sorting values', () => {
      mockReq.query = {};

      validationMiddleware.validateSorting(mockReq, mockRes, mockNext);

      expect(mockReq.query.sortBy).toBe('createdAt');
      expect(mockReq.query.sortOrder).toBe('desc');
      expect(mockNext).toHaveBeenCalled();
    });

    test('should validate and set sorting values', () => {
      mockReq.query = {
        sortBy: 'name',
        sortOrder: 'asc'
      };

      validationMiddleware.validateSorting(mockReq, mockRes, mockNext);

      expect(mockReq.query.sortBy).toBe('name');
      expect(mockReq.query.sortOrder).toBe('asc');
      expect(mockNext).toHaveBeenCalled();
    });

    test('should handle invalid sort order', () => {
      mockReq.query = {
        sortBy: 'name',
        sortOrder: 'invalid'
      };

      validationMiddleware.validateSorting(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        status: 'fail',
        message: 'Sort order must be either "asc" or "desc"'
      });
    });
  });
});