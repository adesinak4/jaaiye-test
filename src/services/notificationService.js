const User = require('../models/User');
const firebaseService = require('./firebaseService');
const deviceTokenService = require('./deviceTokenService');
const notificationQueue = require('../queues/notificationQueue');
const logger = require('../utils/logger');

// Shared error handler (DRY)
const handleServiceError = (error, operation) => {
  logger.error(`Notification service error in ${operation}:`, error);
  throw error;
};

// Validation helpers (Fail Fast)
const validateNotification = (notification) => {
  if (!notification?.title || !notification?.body) {
    throw new Error('Invalid notification: title and body are required');
  }
};

const validateUserId = (userId) => {
  if (!userId) {
    throw new Error('User ID is required');
  }
};

class NotificationService {
  // Send push notification (background processing for faster API responses)
  async sendPushNotification(userId, notification, data = {}) {
    try {
      validateUserId(userId);
      validateNotification(notification);

      // Check user preferences
      const user = await User.findById(userId).select('preferences deviceTokens');
      if (!user || !user.preferences?.notifications?.push) {
        return { success: false, reason: 'User not found or push notifications disabled' };
      }

      const deviceTokens = user.deviceTokens?.map(dt => dt.token) || [];
      if (deviceTokens.length === 0) {
        return { success: false, reason: 'No device tokens found' };
      }

      // Send via Firebase
      const response = await firebaseService.sendMulticastMessage(deviceTokens, notification, data);

      // Handle failed tokens in background
      if (response.failureCount > 0) {
        const failedTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(deviceTokens[idx]);
          }
        });

        // Remove failed tokens in background
        setImmediate(() => {
          deviceTokenService.removeFailedTokens(userId, failedTokens)
            .catch(error => logger.error('Background token cleanup failed:', error));
        });
      }

      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount
      };
    } catch (error) {
      return handleServiceError(error, 'sendPushNotification');
    }
  }

  // Create in-app notification
  async createInAppNotification(userId, notification) {
    try {
      validateUserId(userId);
      validateNotification(notification);

      const newNotification = {
        ...notification,
        read: false,
        createdAt: new Date()
      };

      const result = await User.updateOne(
        { _id: userId },
        { $push: { notifications: newNotification } }
      );

      if (result.matchedCount === 0) {
        throw new Error('User not found');
      }

      return { success: true, notification: newNotification };
    } catch (error) {
      return handleServiceError(error, 'createInAppNotification');
    }
  }

  // Send both push and in-app notifications (background processing)
  async sendNotification(userId, notification, data = {}) {
    // Add to queue for background processing (fire-and-forget)
    notificationQueue.addToQueue({
      type: 'both',
      userId,
      notification,
      data
    });

    // Return immediately for faster API response
    return { success: true, message: 'Notification queued for delivery' };
  }

  // Send push notification only (background processing)
  async sendPushNotificationAsync(userId, notification, data = {}) {
    notificationQueue.addToQueue({
      type: 'push',
      userId,
      notification,
      data
    });

    return { success: true, message: 'Push notification queued' };
  }

  // Send in-app notification only (background processing)
  async sendInAppNotificationAsync(userId, notification) {
    notificationQueue.addToQueue({
      type: 'inApp',
      userId,
      notification
    });

    return { success: true, message: 'In-app notification queued' };
  }

  // Device token management (delegated to device token service)
  async saveDeviceToken(userId, token, platform = 'web') {
    return deviceTokenService.saveDeviceToken(userId, token, platform);
  }

  async removeDeviceToken(userId, token) {
    return deviceTokenService.removeDeviceToken(userId, token);
  }

  async getUserDeviceTokens(userId) {
    return deviceTokenService.getUserDeviceTokens(userId);
  }

  // Mark notification as read
  async markNotificationAsRead(userId, notificationId) {
    try {
      validateUserId(userId);
      if (!notificationId) {
        throw new Error('Notification ID is required');
      }

      const result = await User.updateOne(
        { _id: userId, 'notifications._id': notificationId },
        { $set: { 'notifications.$.read': true } }
      );

      if (result.matchedCount === 0) {
        throw new Error('User or notification not found');
      }

      return { success: true };
    } catch (error) {
      return handleServiceError(error, 'markNotificationAsRead');
    }
  }

  // Get notification queue status
  getQueueStatus() {
    return notificationQueue.getStatus();
  }

  // Clear notification queue (for testing)
  clearQueue() {
    notificationQueue.clearQueue();
  }
}

// Create a single instance and export it
const notificationService = new NotificationService();

// Wire up the queue to use this service
notificationQueue.sendPushNotification = (userId, notification, data) =>
  notificationService.sendPushNotification(userId, notification, data);

notificationQueue.createInAppNotification = (userId, notification) =>
  notificationService.createInAppNotification(userId, notification);

module.exports = notificationService;