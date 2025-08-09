const { successResponse, errorResponse, formatUserResponse } = require('../../src/utils/response');

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

describe('Response Utils', () => {
  let mockRes;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
  });

  describe('successResponse', () => {
    test('should send success response', () => {
      const data = { result: 'success' };
      const message = 'User created successfully';
      const statusCode = 201;

      successResponse(mockRes, data, statusCode, message);

      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data,
        message
      });
    });

    test('should use default status code', () => {
      const data = { result: 'success' };

      successResponse(mockRes, data);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data
      });
    });

    test('should use default message', () => {
      const data = { result: 'success' };

      successResponse(mockRes, data, 200);

      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data
      });
    });
  });

  describe('errorResponse', () => {
    test('should send error response', () => {
      const error = { message: 'User not found' };
      const statusCode = 404;

      errorResponse(mockRes, error, statusCode);

      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'User not found'
      });
    });

    test('should use default status code', () => {
      const error = { message: 'Internal server error' };

      errorResponse(mockRes, error);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Internal server error'
      });
    });

    test('should handle error without message', () => {
      const error = {};

      errorResponse(mockRes, error);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'An error occurred'
      });
    });
  });

  describe('formatUserResponse', () => {
    test('should format user object correctly', () => {
      const user = {
        _id: 'user123',
        email: 'test@example.com',
        username: 'testuser',
        fullName: 'Test User',
        emailVerified: true,
        profilePicture: {
          emoji: '😀',
          color: '#FF5733'
        },
        createdAt: new Date('2023-01-01'),
        updatedAt: new Date('2023-01-02'),
        password: 'hashedpassword',
        verificationCode: '123456',
        resetPasswordCode: '654321'
      };

      const formattedUser = formatUserResponse(user);

      expect(formattedUser).toEqual({
        id: 'user123',
        email: 'test@example.com',
        username: 'testuser',
        fullName: 'Test User',
        emailVerified: true,
        profilePicture: {
          emoji: '😀',
          color: '#FF5733'
        },
        createdAt: new Date('2023-01-01')
      });
    });

    test('should handle user without optional fields', () => {
      const user = {
        _id: 'user123',
        email: 'test@example.com',
        username: 'testuser',
        fullName: 'Test User',
        emailVerified: false,
        createdAt: new Date('2023-01-01')
      };

      const formattedUser = formatUserResponse(user);

      expect(formattedUser).toEqual({
        id: 'user123',
        email: 'test@example.com',
        username: 'testuser',
        fullName: 'Test User',
        emailVerified: false,
        profilePicture: undefined,
        createdAt: new Date('2023-01-01')
      });
    });

    test('should handle null user', () => {
      const formattedUser = formatUserResponse(null);

      expect(formattedUser).toBeNull();
    });

    test('should handle undefined user', () => {
      const formattedUser = formatUserResponse(undefined);

      expect(formattedUser).toBeUndefined();
    });
  });
});