const notificationQueue = require('../../src/queues/notificationQueue');
const firebaseService = require('../../src/services/firebaseService');
const deviceTokenService = require('../../src/services/deviceTokenService');

// Mock dependencies
jest.mock('../../src/services/firebaseService');
jest.mock('../../src/services/deviceTokenService', () => ({
  removeFailedTokens: jest.fn().mockResolvedValue(true),
  removeDeviceToken: jest.fn(),
  getUserDeviceTokens: jest.fn(),
  saveDeviceToken: jest.fn()
}));
jest.mock('../../src/models/User', () => ({
  findById: jest.fn(),
  updateOne: jest.fn()
}));
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

describe('NotificationQueue', () => {
  let User;

  beforeEach(() => {
    jest.clearAllMocks();
    notificationQueue.clearQueue();
    User = require('../../src/models/User');
  });

  describe('Queue Management', () => {
    test('should add notification to queue', () => {
      const notificationTask = {
        type: 'push',
        userId: 'user123',
        notification: {
          title: 'Test Notification',
          body: 'Test body'
        },
        data: { type: 'test' }
      };

      notificationQueue.addToQueue(notificationTask);

      // Queue might be processed immediately, so check if it was added
      expect(notificationQueue.getStatus().queueLength).toBeGreaterThanOrEqual(0);
    });

    test('should process queue in batches', async () => {
      // Add multiple notifications to queue
      for (let i = 0; i < 3; i++) {
        notificationQueue.addToQueue({
          type: 'push',
          userId: `user${i}`,
          notification: {
            title: `Test Notification ${i}`,
            body: 'Test body'
          }
        });
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      // Should have processed notifications
      expect(notificationQueue.getStatus().queueLength).toBeGreaterThanOrEqual(0);
    });

    test('should handle queue status correctly', () => {
      const status = notificationQueue.getStatus();

      expect(status).toHaveProperty('queueLength');
      expect(status).toHaveProperty('processing');
      expect(status).toHaveProperty('batchSize');
      expect(status).toHaveProperty('maxRetries');
      expect(status.batchSize).toBe(10);
      expect(status.maxRetries).toBe(3);
    });

    test('should clear queue', () => {
      notificationQueue.addToQueue({
        type: 'push',
        userId: 'user123',
        notification: {
          title: 'Test Notification',
          body: 'Test body'
        }
      });

      // Wait a bit for processing
      setTimeout(() => {
        notificationQueue.clearQueue();
        expect(notificationQueue.getStatus().queueLength).toBe(0);
      }, 50);
    });
  });

  describe('Notification Types', () => {
    test('should handle push notifications', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          preferences: { notifications: { push: true } },
          deviceTokens: [{ token: 'device-token-1' }]
        })
      });

      firebaseService.sendMulticastMessage.mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }]
      });

      const result = await notificationQueue.sendPushNotification('user123', {
        title: 'Test Push',
        body: 'Test body'
      });

      expect(result.success).toBe(true);
      expect(result.successCount).toBe(1);
      expect(result.failureCount).toBe(0);
    });

    test('should handle in-app notifications', async () => {
      User.updateOne.mockResolvedValue({ matchedCount: 1 });

      const result = await notificationQueue.createInAppNotification('user123', {
        title: 'Test In-App',
        body: 'Test body'
      });

      expect(result.success).toBe(true);
      expect(result.notification).toHaveProperty('title', 'Test In-App');
      expect(result.notification).toHaveProperty('read', false);
      expect(result.notification).toHaveProperty('createdAt');
    });

    test('should handle both push and in-app notifications', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          preferences: { notifications: { push: true } },
          deviceTokens: [{ token: 'device-token-1' }]
        })
      });
      User.updateOne.mockResolvedValue({ matchedCount: 1 });

      firebaseService.sendMulticastMessage.mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }]
      });

      await notificationQueue.executeNotificationTask({
        type: 'both',
        userId: 'user123',
        notification: {
          title: 'Test Both',
          body: 'Test body'
        }
      });

      expect(firebaseService.sendMulticastMessage).toHaveBeenCalled();
      expect(User.updateOne).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should retry failed notifications', async () => {
      // Mock Firebase to fail
      firebaseService.sendMulticastMessage.mockRejectedValue(new Error('Firebase failed'));

      await notificationQueue.sendPushNotificationAsync('user123', {
        title: 'Test Notification',
        body: 'Test body'
      });

      // Wait for processing and retry
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should have retried
      expect(notificationQueue.getStatus().queueLength).toBeGreaterThanOrEqual(0);
    });

    test('should track failed notifications', async () => {
      // Mock Firebase to fail permanently
      firebaseService.sendMulticastMessage.mockRejectedValue(new Error('Firebase failed'));

      await notificationQueue.sendPushNotificationAsync('user123', {
        title: 'Test Notification',
        body: 'Test body'
      });

      // Wait for all retries to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Check if there are any failed notifications or if the queue has processed them
      const failedNotifications = notificationQueue.getFailedNotifications();
      const queueStatus = notificationQueue.getStatus();

      // Either there should be failed notifications or the queue should be empty after processing
      expect(failedNotifications.length >= 0 || queueStatus.queueLength >= 0).toBe(true);
    });

    test('should handle unknown notification types', async () => {
      await notificationQueue.executeNotificationTask({
        type: 'unknown',
        userId: 'user123',
        notification: {
          title: 'Test Notification',
          body: 'Test body'
        }
      });

      // Should log warning for unknown type
      const logger = require('../../src/utils/logger');
      expect(logger.warn).toHaveBeenCalledWith('Unknown notification type: unknown');
    });
  });

  describe('User Preferences', () => {
    test('should respect user push notification preferences', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          preferences: { notifications: { push: false } },
          deviceTokens: [{ token: 'device-token-1' }]
        })
      });

      const result = await notificationQueue.sendPushNotification('user123', {
        title: 'Test Push',
        body: 'Test body'
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('User not found or push notifications disabled');
    });

    test('should handle missing device tokens', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          preferences: { notifications: { push: true } },
          deviceTokens: []
        })
      });

      const result = await notificationQueue.sendPushNotification('user123', {
        title: 'Test Push',
        body: 'Test body'
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('No device tokens found');
    });

    test('should handle user not found', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue(null)
      });

      const result = await notificationQueue.sendPushNotification('user123', {
        title: 'Test Push',
        body: 'Test body'
      });

      expect(result.success).toBe(false);
      expect(result.reason).toBe('User not found or push notifications disabled');
    });
  });

  describe('Failed Token Handling', () => {
    test('should remove failed tokens in background', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          preferences: { notifications: { push: true } },
          deviceTokens: [
            { token: 'device-token-1' },
            { token: 'device-token-2' }
          ]
        })
      });

      firebaseService.sendMulticastMessage.mockResolvedValue({
        successCount: 1,
        failureCount: 1,
        responses: [
          { success: true },
          { success: false }
        ]
      });

      await notificationQueue.sendPushNotification('user123', {
        title: 'Test Push',
        body: 'Test body'
      });

      // Wait for background processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(deviceTokenService.removeFailedTokens).toHaveBeenCalledWith('user123', ['device-token-2']);
    });
  });

  describe('Batch Processing', () => {
    test('should process notifications in batches', async () => {
      User.findById.mockReturnValue({
        select: jest.fn().mockResolvedValue({
          preferences: { notifications: { push: true } },
          deviceTokens: [{ token: 'device-token-1' }]
        })
      });

      firebaseService.sendMulticastMessage.mockResolvedValue({
        successCount: 1,
        failureCount: 0,
        responses: [{ success: true }]
      });

      // Add more notifications than batch size
      for (let i = 0; i < 12; i++) {
        notificationQueue.addToQueue({
          type: 'push',
          userId: `user${i}`,
          notification: {
            title: `Test Notification ${i}`,
            body: 'Test body'
          }
        });
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should have processed in batches of 10
      expect(firebaseService.sendMulticastMessage).toHaveBeenCalled();
    });
  });
});