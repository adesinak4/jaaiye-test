const User = require('../models/User');
const logger = require('../utils/logger');

class DeviceTokenService {
  async saveDeviceToken(userId, token, platform = 'web') {
    try {
      if (!userId || !token) {
        throw new Error('User ID and token are required');
      }

      const tokenData = {
        token,
        platform,
        createdAt: new Date()
      };

      const result = await User.updateOne(
        { _id: userId },
        {
          $addToSet: {
            deviceTokens: tokenData
          }
        }
      );

      if (result.matchedCount === 0) {
        throw new Error('User not found');
      }

      logger.info(`Device token saved for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('Error saving device token:', error);
      throw error;
    }
  }

  async removeDeviceToken(userId, token) {
    try {
      if (!userId || !token) {
        throw new Error('User ID and token are required');
      }

      const result = await User.updateOne(
        { _id: userId },
        { $pull: { deviceTokens: { token } } }
      );

      if (result.matchedCount === 0) {
        throw new Error('User not found');
      }

      logger.info(`Device token removed for user ${userId}`);
      return true;
    } catch (error) {
      logger.error('Error removing device token:', error);
      throw error;
    }
  }

  async getUserDeviceTokens(userId) {
    try {
      const user = await User.findById(userId).select('deviceTokens');
      if (!user) {
        throw new Error('User not found');
      }

      return user.deviceTokens?.map(dt => dt.token) || [];
    } catch (error) {
      logger.error('Error getting user device tokens:', error);
      throw error;
    }
  }

  async removeFailedTokens(userId, failedTokens) {
    try {
      if (!failedTokens || failedTokens.length === 0) {
        return;
      }

      const result = await User.updateOne(
        { _id: userId },
        { $pull: { deviceTokens: { token: { $in: failedTokens } } } }
      );

      if (result.modifiedCount > 0) {
        logger.info(`Removed ${result.modifiedCount} failed tokens for user ${userId}`);
      }
    } catch (error) {
      logger.error('Error removing failed tokens:', error);
      throw error;
    }
  }

  async batchRemoveFailedTokens(failedTokenUpdates) {
    try {
      if (!failedTokenUpdates || failedTokenUpdates.length === 0) {
        return;
      }

      const bulkOps = failedTokenUpdates.map(update => ({
        updateOne: {
          filter: { _id: update.userId },
          update: { $pull: { deviceTokens: { token: { $in: update.failedTokens } } } }
        }
      }));

      const result = await User.bulkWrite(bulkOps);
      logger.info(`Batch removed failed tokens: ${result.modifiedCount} documents updated`);

      return result;
    } catch (error) {
      logger.error('Error batch removing failed tokens:', error);
      throw error;
    }
  }
}

module.exports = new DeviceTokenService();