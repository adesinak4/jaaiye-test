const authService = require('../../src/services/authService');
const jwt = require('jsonwebtoken');
const User = require('../../src/models/User');

// Mock dependencies
jest.mock('jsonwebtoken');
jest.mock('../../src/models/User');
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

describe('AuthService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('generateToken', () => {
    test('should generate access token successfully', () => {
      const userId = 'user123';
      const mockToken = 'mock-access-token';

      jwt.sign.mockReturnValue(mockToken);

      const result = authService.generateToken(userId);

      expect(jwt.sign).toHaveBeenCalledWith(
        { id: userId },
        process.env.JWT_SECRET,
        { expiresIn: '15m' }
      );
      expect(result).toBe(mockToken);
    });
  });

  describe('generateRefreshToken', () => {
    test('should generate refresh token successfully', () => {
      const userId = 'user123';
      const mockToken = 'mock-refresh-token';

      jwt.sign.mockReturnValue(mockToken);

      const result = authService.generateRefreshToken(userId);

      expect(jwt.sign).toHaveBeenCalledWith(
        { id: userId },
        process.env.JWT_REFRESH_SECRET,
        { expiresIn: '30d' }
      );
      expect(result).toBe(mockToken);
    });
  });

  describe('verifyToken', () => {
    test('should verify token successfully', () => {
      const token = 'valid-token';
      const mockDecoded = { id: 'user123' };

      jwt.verify.mockReturnValue(mockDecoded);

      const result = authService.verifyToken(token);

      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_SECRET);
      expect(result).toEqual(mockDecoded);
    });

    test('should handle invalid token', () => {
      const token = 'invalid-token';

      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      expect(() => authService.verifyToken(token)).toThrow('Invalid token');
    });
  });

  describe('verifyRefreshToken', () => {
    test('should verify refresh token successfully', () => {
      const token = 'valid-refresh-token';
      const mockDecoded = { id: 'user123' };

      jwt.verify.mockReturnValue(mockDecoded);

      const result = authService.verifyRefreshToken(token);

      expect(jwt.verify).toHaveBeenCalledWith(token, process.env.JWT_REFRESH_SECRET);
      expect(result).toEqual(mockDecoded);
    });

    test('should handle invalid refresh token', () => {
      const token = 'invalid-refresh-token';

      jwt.verify.mockImplementation(() => {
        throw new Error('Invalid refresh token');
      });

      expect(() => authService.verifyRefreshToken(token)).toThrow('Invalid refresh token');
    });
  });

  describe('generateVerificationCode', () => {
    test('should generate 6-digit verification code', () => {
      const code = authService.generateVerificationCode();

      expect(code).toMatch(/^\d{6}$/);
      expect(parseInt(code)).toBeGreaterThanOrEqual(100000);
      expect(parseInt(code)).toBeLessThanOrEqual(999999);
    });
  });

  describe('generateResetCode', () => {
    test('should generate 6-digit reset code', () => {
      const code = authService.generateResetCode();

      expect(code).toMatch(/^\d{6}$/);
      expect(parseInt(code)).toBeGreaterThanOrEqual(100000);
      expect(parseInt(code)).toBeLessThanOrEqual(999999);
    });
  });

  describe('isCodeExpired', () => {
    test('should return true for expired code', () => {
      const expiredDate = new Date(Date.now() - 600000); // 10 minutes ago
      const result = authService.isCodeExpired(expiredDate);

      expect(result).toBe(true);
    });

    test('should return false for valid code', () => {
      const validDate = new Date(Date.now() + 600000); // 10 minutes from now
      const result = authService.isCodeExpired(validDate);

      expect(result).toBe(false);
    });

    test('should handle null date', () => {
      const result = authService.isCodeExpired(null);

      expect(result).toBe(true);
    });
  });

  describe('hashPassword', () => {
    test('should hash password successfully', async () => {
      const password = 'testpassword123';
      const hashedPassword = await authService.hashPassword(password);

      expect(hashedPassword).not.toBe(password);
      expect(hashedPassword).toMatch(/^\$2[aby]\$\d{1,2}\$[./A-Za-z0-9]{53}$/);
    });
  });

  describe('comparePassword', () => {
    test('should compare password successfully', async () => {
      const password = 'testpassword123';
      const hashedPassword = await authService.hashPassword(password);

      const result = await authService.comparePassword(password, hashedPassword);

      expect(result).toBe(true);
    });

    test('should return false for incorrect password', async () => {
      const password = 'testpassword123';
      const hashedPassword = await authService.hashPassword(password);

      const result = await authService.comparePassword('wrongpassword', hashedPassword);

      expect(result).toBe(false);
    });
  });
});