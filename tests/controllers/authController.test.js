const authController = require('../../src/controllers/authController');
const User = require('../../src/models/User');
const { emailQueue } = require('../../src/queues');

// Mock dependencies
jest.mock('../../src/models/User');
jest.mock('../../src/queues');
jest.mock('../../src/services/authService', () => ({
  generateToken: jest.fn(() => 'mock-access-token'),
  generateRefreshToken: jest.fn(() => 'mock-refresh-token'),
  generateVerificationCode: jest.fn(() => '123456'),
  generateResetCode: jest.fn(() => '654321'),
  isCodeExpired: jest.fn(() => false),
  verifyRefreshToken: jest.fn(() => ({ id: 'user123' }))
}));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

describe('AuthController', () => {
  let mockReq, mockRes;

  beforeEach(() => {
    jest.clearAllMocks();

    mockReq = {
      body: {},
      user: { id: 'user123' }
    };

    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    // Reset User mock
    User.findOne.mockReset();
    User.create.mockReset();
    User.findById.mockReset();
  });

  describe('register', () => {
    test('should register new user successfully', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'TestPass123!',
        username: 'testuser',
        fullName: 'Test User'
      };

      User.findOne.mockResolvedValue(null);
      User.create.mockResolvedValue({
        _id: 'user123',
        email: 'test@example.com',
        save: jest.fn().mockResolvedValue(true)
      });

      await authController.register(mockReq, mockRes);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(User.create).toHaveBeenCalled();
      expect(emailQueue.sendVerificationEmailAsync).toHaveBeenCalledWith('test@example.com', '123456');
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });

    test('should throw error if user already exists', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'TestPass123!'
      };

      User.findOne.mockResolvedValue({ _id: 'existing-user' });

      await expect(authController.register(mockReq, mockRes))
        .rejects.toThrow('User already exists with this email');
    });
  });

  describe('login', () => {
    test('should login user successfully', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'TestPass123!'
      };

      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        username: 'testuser',
        fullName: 'Test User',
        emailVerified: true,
        profilePicture: null,
        comparePassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true)
      };

      User.findOne.mockResolvedValue(mockUser);

      await authController.login(mockReq, mockRes);

      expect(User.findOne).toHaveBeenCalledWith({ email: 'test@example.com' });
      expect(mockUser.comparePassword).toHaveBeenCalledWith('TestPass123!');
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    test('should throw error for invalid credentials', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'wrongpassword'
      };

      User.findOne.mockResolvedValue(null);

      await expect(authController.login(mockReq, mockRes))
        .rejects.toThrow('Invalid credentials');
    });

    test('should send verification email if email not verified', async () => {
      mockReq.body = {
        email: 'test@example.com',
        password: 'TestPass123!'
      };

      const mockUser = {
        _id: 'user123',
        email: 'test@example.com',
        emailVerified: false,
        comparePassword: jest.fn().mockResolvedValue(true),
        save: jest.fn().mockResolvedValue(true)
      };

      User.findOne.mockResolvedValue(mockUser);

      await authController.login(mockReq, mockRes);

      expect(emailQueue.sendVerificationEmailAsync).toHaveBeenCalledWith('test@example.com', '123456');
      expect(mockRes.status).toHaveBeenCalledWith(403);
    });
  });

  describe('verifyEmail', () => {
    test('should verify email successfully', async () => {
      mockReq.body = {
        email: 'test@example.com',
        code: '123456'
      };

      const mockUser = {
        email: 'test@example.com',
        emailVerified: false,
        verificationCode: '123456',
        verificationCodeExpires: new Date(Date.now() + 600000),
        save: jest.fn().mockResolvedValue(true)
      };

      User.findOne.mockResolvedValue(mockUser);

      await authController.verifyEmail(mockReq, mockRes);

      expect(mockUser.emailVerified).toBe(true);
      expect(mockUser.verificationCode).toBeUndefined();
      expect(emailQueue.sendWelcomeEmailAsync).toHaveBeenCalledWith('test@example.com');
    });

    test('should throw error for invalid verification code', async () => {
      mockReq.body = {
        email: 'test@example.com',
        code: 'wrong-code'
      };

      const mockUser = {
        email: 'test@example.com',
        emailVerified: false,
        verificationCode: '123456',
        verificationCodeExpires: new Date(Date.now() + 600000)
      };

      User.findOne.mockResolvedValue(mockUser);

      await expect(authController.verifyEmail(mockReq, mockRes))
        .rejects.toThrow('Invalid verification code');
    });
  });

  describe('forgotPassword', () => {
    test('should send reset email if user exists', async () => {
      mockReq.body = {
        email: 'test@example.com'
      };

      const mockUser = {
        email: 'test@example.com',
        save: jest.fn().mockResolvedValue(true)
      };

      User.findOne.mockResolvedValue(mockUser);

      await authController.forgotPassword(mockReq, mockRes);

      expect(emailQueue.sendPasswordResetEmailAsync).toHaveBeenCalledWith('test@example.com', '654321');
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    test('should not reveal if user exists or not', async () => {
      mockReq.body = {
        email: 'nonexistent@example.com'
      };

      User.findOne.mockResolvedValue(null);

      await authController.forgotPassword(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          message: "If an account with this email exists, a reset code has been sent"
        })
      );
    });
  });

  describe('resetPassword', () => {
    test('should reset password successfully', async () => {
      mockReq.body = {
        email: 'test@example.com',
        code: '654321',
        newPassword: 'NewPass123!'
      };

      const mockUser = {
        email: 'test@example.com',
        resetPasswordCode: '654321',
        resetPasswordExpires: new Date(Date.now() + 3600000),
        save: jest.fn().mockResolvedValue(true)
      };

      User.findOne.mockResolvedValue(mockUser);

      await authController.resetPassword(mockReq, mockRes);

      expect(mockUser.password).toBe('NewPass123!');
      expect(mockUser.resetPasswordCode).toBeUndefined();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    test('should throw error for invalid reset code', async () => {
      mockReq.body = {
        email: 'test@example.com',
        code: 'wrong-code',
        newPassword: 'NewPass123!'
      };

      const mockUser = {
        email: 'test@example.com',
        resetPasswordCode: '654321',
        resetPasswordExpires: new Date(Date.now() + 3600000)
      };

      User.findOne.mockResolvedValue(mockUser);

      await expect(authController.resetPassword(mockReq, mockRes))
        .rejects.toThrow('Invalid reset code');
    });
  });

  describe('refreshToken', () => {
    test('should refresh token successfully', async () => {
      mockReq.body = {
        refreshToken: 'valid-refresh-token'
      };

      const mockUser = {
        _id: 'user123',
        refresh: {
          token: 'valid-refresh-token',
          expiresAt: new Date(Date.now() + 2592000000)
        },
        save: jest.fn().mockResolvedValue(true)
      };

      User.findById.mockResolvedValue(mockUser);

      await authController.refreshToken(mockReq, mockRes);

      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: {
            accessToken: 'mock-access-token',
            refreshToken: 'mock-refresh-token'
          }
        })
      );
    });

    test('should throw error for invalid refresh token', async () => {
      mockReq.body = {
        refreshToken: 'invalid-refresh-token'
      };

      User.findById.mockResolvedValue(null);

      await expect(authController.refreshToken(mockReq, mockRes))
        .rejects.toThrow('Invalid refresh token');
    });
  });

  describe('resendVerification', () => {
    test('should resend verification email', async () => {
      mockReq.body = {
        email: 'test@example.com'
      };

      const mockUser = {
        email: 'test@example.com',
        emailVerified: false,
        save: jest.fn().mockResolvedValue(true)
      };

      User.findOne.mockResolvedValue(mockUser);

      await authController.resendVerification(mockReq, mockRes);

      expect(emailQueue.sendVerificationEmailAsync).toHaveBeenCalledWith('test@example.com', '123456');
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });

    test('should not resend if email already verified', async () => {
      mockReq.body = {
        email: 'test@example.com'
      };

      const mockUser = {
        email: 'test@example.com',
        emailVerified: true
      };

      User.findOne.mockResolvedValue(mockUser);

      await authController.resendVerification(mockReq, mockRes);

      expect(emailQueue.sendVerificationEmailAsync).not.toHaveBeenCalled();
      expect(mockRes.status).toHaveBeenCalledWith(200);
    });
  });
});