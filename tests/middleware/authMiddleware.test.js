const jwt = require('jsonwebtoken');
const User = require('../../src/models/User');
const authMiddleware = require('../../src/middleware/authMiddleware');

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('../../src/models/User');

describe('AuthMiddleware', () => {
  let mockReq, mockRes, mockNext;

  beforeEach(() => {
    mockReq = {
      headers: {},
      user: null
    };
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();

    // Clear mocks
    jest.clearAllMocks();
  });

  describe('protect', () => {
    test('should authenticate user with valid token', async () => {
      const token = 'valid-token';
      const userId = 'user123';
      const user = { _id: userId, email: 'test@example.com', isActive: true };

      mockReq.headers.authorization = `Bearer ${token}`;
      jwt.verify.mockReturnValue({ id: userId });

      // Mock the User.findById().select() chain
      const mockSelect = jest.fn().mockResolvedValue(user);
      User.findById.mockReturnValue({ select: mockSelect });

      await authMiddleware.protect(mockReq, mockRes, mockNext);

      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(mockSelect).toHaveBeenCalledWith('-password');
      expect(mockReq.user).toEqual(user);
      expect(mockNext).toHaveBeenCalled();
    });

    test('should handle missing authorization header', async () => {
      await authMiddleware.protect(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Not authorized to access this route'
      });
    });

    test('should handle invalid token format', async () => {
      mockReq.headers.authorization = 'InvalidFormat token';

      await authMiddleware.protect(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Not authorized to access this route'
      });
    });

    test('should handle invalid token', async () => {
      const token = 'invalid-token';
      mockReq.headers.authorization = `Bearer ${token}`;
      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await authMiddleware.protect(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Not authorized to access this route'
      });
    });

    test('should handle user not found', async () => {
      const token = 'valid-token';
      const userId = 'user123';

      mockReq.headers.authorization = `Bearer ${token}`;
      jwt.verify.mockReturnValue({ id: userId });

      // Mock the User.findById().select() chain to return null
      const mockSelect = jest.fn().mockResolvedValue(null);
      User.findById.mockReturnValue({ select: mockSelect });

      await authMiddleware.protect(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'User not found'
      });
    });

    test('should handle inactive user', async () => {
      const token = 'valid-token';
      const userId = 'user123';
      const user = { _id: userId, email: 'test@example.com', isActive: false };

      mockReq.headers.authorization = `Bearer ${token}`;
      jwt.verify.mockReturnValue({ id: userId });

      // Mock the User.findById().select() chain
      const mockSelect = jest.fn().mockResolvedValue(user);
      User.findById.mockReturnValue({ select: mockSelect });

      await authMiddleware.protect(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(401);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'User account is deactivated'
      });
    });
  });

  describe('admin', () => {
    test('should authorize admin user', () => {
      mockReq.user = { role: 'admin' };

      authMiddleware.admin(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('should deny access for non-admin user', () => {
      mockReq.user = { role: 'user' };

      authMiddleware.admin(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Not authorized as admin'
      });
    });
  });

  describe('verified', () => {
    test('should authorize verified user', () => {
      mockReq.user = { emailVerified: true };

      authMiddleware.verified(mockReq, mockRes, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    test('should deny access for unverified user', () => {
      mockReq.user = { emailVerified: false };

      authMiddleware.verified(mockReq, mockRes, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(403);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: false,
        error: 'Please verify your email first'
      });
    });
  });
});