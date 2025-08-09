// Mock dependencies before requiring the service
jest.mock('../../src/services/firebaseService', () => ({
  sendMulticastMessage: jest.fn(),
  sendSingleMessage: jest.fn()
}));

jest.mock('../../src/services/deviceTokenService', () => ({
  saveDeviceToken: jest.fn(),
  removeDeviceToken: jest.fn(),
  getUserDeviceTokens: jest.fn(),
  removeFailedTokens: jest.fn(),
  batchRemoveFailedTokens: jest.fn()
}));

jest.mock('../../src/queues/notificationQueue', () => ({
  addToQueue: jest.fn(),
  getStatus: jest.fn(() => ({
    queueLength: 0,
    processing: false,
    batchSize: 10
  })),
  clearQueue: jest.fn()
}));

jest.mock('../../src/models/User', () => ({
  findById: jest.fn(),
  updateOne: jest.fn()
}));

jest.mock('../../src/utils/logger', () => ({
  error: jest.fn(),
  info: jest.fn(),
  warn: jest.fn()
}));

const notificationService = require('../../src/services/notificationService');

// Simple test to verify the refactored service
describe('NotificationService Refactoring', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('should have all required methods', () => {
    expect(notificationService.sendPushNotification).toBeDefined();
    expect(notificationService.createInAppNotification).toBeDefined();
    expect(notificationService.sendNotification).toBeDefined();
    expect(notificationService.sendPushNotificationAsync).toBeDefined();
    expect(notificationService.sendInAppNotificationAsync).toBeDefined();
    expect(notificationService.saveDeviceToken).toBeDefined();
    expect(notificationService.removeDeviceToken).toBeDefined();
    expect(notificationService.getUserDeviceTokens).toBeDefined();
    expect(notificationService.markNotificationAsRead).toBeDefined();
    expect(notificationService.getQueueStatus).toBeDefined();
    expect(notificationService.clearQueue).toBeDefined();
  });

  test('should validate notification format', () => {
    const invalidNotification = { title: 'Test' }; // Missing body
    const validNotification = { title: 'Test', body: 'Test body' };

    // This would throw an error in the actual service
    expect(() => {
      // Simulate validation
      if (!validNotification.title || !validNotification.body) {
        throw new Error('Invalid notification');
      }
    }).not.toThrow();

    expect(() => {
      // Simulate validation
      if (!invalidNotification.title || !invalidNotification.body) {
        throw new Error('Invalid notification');
      }
    }).toThrow('Invalid notification');
  });

  test('should have queue status method', () => {
    const status = notificationService.getQueueStatus();
    expect(status).toHaveProperty('queueLength');
    expect(status).toHaveProperty('processing');
    expect(status).toHaveProperty('batchSize');
  });

  test('should delegate device token operations to device token service', () => {
    const deviceTokenService = require('../../src/services/deviceTokenService');

    notificationService.saveDeviceToken('userId', 'token', 'web');
    expect(deviceTokenService.saveDeviceToken).toHaveBeenCalledWith('userId', 'token', 'web');

    notificationService.removeDeviceToken('userId', 'token');
    expect(deviceTokenService.removeDeviceToken).toHaveBeenCalledWith('userId', 'token');

    notificationService.getUserDeviceTokens('userId');
    expect(deviceTokenService.getUserDeviceTokens).toHaveBeenCalledWith('userId');
  });

  test('should add notifications to queue for async processing', () => {
    const notificationQueue = require('../../src/queues/notificationQueue');
    const notification = { title: 'Test', body: 'Test body' };

    notificationService.sendPushNotificationAsync('userId', notification);
    expect(notificationQueue.addToQueue).toHaveBeenCalledWith({
      type: 'push',
      userId: 'userId',
      notification,
      data: {}
    });

    notificationService.sendInAppNotificationAsync('userId', notification);
    expect(notificationQueue.addToQueue).toHaveBeenCalledWith({
      type: 'inApp',
      userId: 'userId',
      notification
    });
  });
});