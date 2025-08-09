const User = require('../../src/models/User');
const deviceTokenService = require('../../src/services/deviceTokenService');

// Mock dependencies
jest.mock('../../src/models/User');
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

describe('DeviceTokenService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('saveDeviceToken', () => {
    test('should save device token successfully', async () => {
      const userId = 'user123';
      const token = 'device-token-123';
      const platform = 'ios';

      User.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      const result = await deviceTokenService.saveDeviceToken(userId, token, platform);

      expect(User.updateOne).toHaveBeenCalledWith(
        { _id: userId },
        {
          $addToSet: {
            deviceTokens: {
              token,
              platform,
              createdAt: expect.any(Date)
            }
          }
        }
      );
      expect(result).toBe(true);
    });

    test('should handle user not found', async () => {
      const userId = 'user123';
      const token = 'device-token-123';

      User.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

      await expect(deviceTokenService.saveDeviceToken(userId, token))
        .rejects.toThrow('User not found');
    });

    test('should handle missing parameters', async () => {
      await expect(deviceTokenService.saveDeviceToken(null, 'token'))
        .rejects.toThrow('User ID and token are required');

      await expect(deviceTokenService.saveDeviceToken('userId', null))
        .rejects.toThrow('User ID and token are required');
    });
  });

  describe('removeDeviceToken', () => {
    test('should remove device token successfully', async () => {
      const userId = 'user123';
      const token = 'device-token-123';

      User.updateOne.mockResolvedValue({ matchedCount: 1, modifiedCount: 1 });

      const result = await deviceTokenService.removeDeviceToken(userId, token);

      expect(User.updateOne).toHaveBeenCalledWith(
        { _id: userId },
        { $pull: { deviceTokens: { token } } }
      );
      expect(result).toBe(true);
    });

    test('should handle user not found', async () => {
      const userId = 'user123';
      const token = 'device-token-123';

      User.updateOne.mockResolvedValue({ matchedCount: 0, modifiedCount: 0 });

      await expect(deviceTokenService.removeDeviceToken(userId, token))
        .rejects.toThrow('User not found');
    });

    test('should handle missing parameters', async () => {
      await expect(deviceTokenService.removeDeviceToken(null, 'token'))
        .rejects.toThrow('User ID and token are required');

      await expect(deviceTokenService.removeDeviceToken('userId', null))
        .rejects.toThrow('User ID and token are required');
    });
  });

  describe('getUserDeviceTokens', () => {
    test('should get user device tokens', async () => {
      const userId = 'user123';
      const mockUser = {
        deviceTokens: [
          { token: 'token1', platform: 'ios' },
          { token: 'token2', platform: 'android' }
        ]
      };

      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      const tokens = await deviceTokenService.getUserDeviceTokens(userId);

      expect(User.findById).toHaveBeenCalledWith(userId);
      expect(tokens).toEqual(['token1', 'token2']);
    });

    test('should return empty array for user with no tokens', async () => {
      const userId = 'user123';
      const mockUser = { deviceTokens: [] };

      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(mockUser)
      });

      const tokens = await deviceTokenService.getUserDeviceTokens(userId);

      expect(tokens).toEqual([]);
    });

    test('should handle user not found', async () => {
      const userId = 'user123';

      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      await expect(deviceTokenService.getUserDeviceTokens(userId))
        .rejects.toThrow('User not found');
    });
  });

  describe('removeFailedTokens', () => {
    test('should remove failed tokens successfully', async () => {
      const userId = 'user123';
      const failedTokens = ['token1', 'token2'];

      User.updateOne.mockResolvedValue({ modifiedCount: 2 });

      await deviceTokenService.removeFailedTokens(userId, failedTokens);

      expect(User.updateOne).toHaveBeenCalledWith(
        { _id: userId },
        { $pull: { deviceTokens: { token: { $in: failedTokens } } } }
      );
    });

    test('should handle empty failed tokens array', async () => {
      const userId = 'user123';
      const failedTokens = [];

      await deviceTokenService.removeFailedTokens(userId, failedTokens);

      expect(User.updateOne).not.toHaveBeenCalled();
    });
  });

  describe('batchRemoveFailedTokens', () => {
    test('should batch remove failed tokens', async () => {
      const failedTokenUpdates = [
        { userId: 'user1', failedTokens: ['token1', 'token2'] },
        { userId: 'user2', failedTokens: ['token3'] }
      ];

      User.bulkWrite.mockResolvedValue({ modifiedCount: 3 });

      const result = await deviceTokenService.batchRemoveFailedTokens(failedTokenUpdates);

      expect(User.bulkWrite).toHaveBeenCalledWith([
        {
          updateOne: {
            filter: { _id: 'user1' },
            update: { $pull: { deviceTokens: { token: { $in: ['token1', 'token2'] } } } }
          }
        },
        {
          updateOne: {
            filter: { _id: 'user2' },
            update: { $pull: { deviceTokens: { token: { $in: ['token3'] } } } }
          }
        }
      ]);
      expect(result.modifiedCount).toBe(3);
    });

    test('should handle empty updates array', async () => {
      const failedTokenUpdates = [];

      await deviceTokenService.batchRemoveFailedTokens(failedTokenUpdates);

      expect(User.bulkWrite).not.toHaveBeenCalled();
    });
  });
});