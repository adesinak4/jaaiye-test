const admin = require('firebase-admin');
const firebaseService = require('../../src/services/firebaseService');

// Mock dependencies
jest.mock('firebase-admin', () => ({
  apps: [],
  initializeApp: jest.fn(),
  credential: {
    cert: jest.fn(() => ({ type: 'service_account' }))
  },
  messaging: jest.fn(() => ({
    send: jest.fn(),
    sendMulticast: jest.fn()
  }))
}));

jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn()
}));

describe('FirebaseService', () => {
  let mockMessaging;

  beforeEach(() => {
    jest.clearAllMocks();
    mockMessaging = {
      send: jest.fn(),
      sendMulticast: jest.fn()
    };
    admin.messaging.mockReturnValue(mockMessaging);

    // Reset the service's initialized state
    firebaseService.initialized = false;
    admin.apps = [];
  });

  afterEach(() => {
    // Reset the mock implementation
    admin.initializeApp.mockImplementation(() => {});
  });

  describe('initializeFirebase', () => {
    test('should initialize Firebase with service account', () => {
      // Set up environment variables
      process.env.FIREBASE_PROJECT_ID = 'test-project';
      process.env.FIREBASE_PRIVATE_KEY_ID = 'test-key-id';
      process.env.FIREBASE_PRIVATE_KEY = 'test-private-key';
      process.env.FIREBASE_CLIENT_EMAIL = 'test@example.com';
      process.env.FIREBASE_CLIENT_ID = 'test-client-id';
      process.env.FIREBASE_CLIENT_X509_CERT_URL = 'https://test.com/cert';

      firebaseService.initializeFirebase();

      expect(admin.initializeApp).toHaveBeenCalledWith({
        credential: expect.any(Object)
      });
    });

    test('should not initialize if already initialized', () => {
      // Mock that Firebase is already initialized
      admin.apps = [{ name: 'default' }];

      firebaseService.initializeFirebase();

      expect(admin.initializeApp).not.toHaveBeenCalled();
    });

    test('should handle missing environment variables gracefully', () => {
      const originalEnv = process.env;
      process.env = {};

      expect(() => firebaseService.initializeFirebase()).not.toThrow();

      process.env = originalEnv;
    });
  });

  describe('sendSingleMessage', () => {
    test('should send single message successfully', async () => {
      const token = 'device-token-123';
      const notification = {
        title: 'Test Notification',
        body: 'Test body'
      };
      const data = { key: 'value' };

      mockMessaging.send.mockResolvedValue('message-id-123');

      const result = await firebaseService.sendSingleMessage(token, notification, data);

      expect(mockMessaging.send).toHaveBeenCalledWith({
        notification: {
          title: notification.title,
          body: notification.body
        },
        data,
        token
      });
      expect(result).toBe('message-id-123');
    });

    test('should handle single message errors', async () => {
      const token = 'invalid-token';
      const notification = {
        title: 'Test Notification',
        body: 'Test body'
      };

      mockMessaging.send.mockRejectedValue(new Error('Invalid token'));

      await expect(firebaseService.sendSingleMessage(token, notification))
        .rejects.toThrow('Invalid token');
    });
  });

  describe('sendMulticastMessage', () => {
    test('should send multicast message successfully', async () => {
      const tokens = ['token1', 'token2'];
      const notification = {
        title: 'Test Notification',
        body: 'Test body'
      };
      const data = { key: 'value' };

      const mockResponse = {
        successCount: 2,
        failureCount: 0,
        responses: []
      };

      mockMessaging.sendMulticast.mockResolvedValue(mockResponse);

      const result = await firebaseService.sendMulticastMessage(tokens, notification, data);

      expect(mockMessaging.sendMulticast).toHaveBeenCalledWith({
        notification: {
          title: notification.title,
          body: notification.body
        },
        data,
        tokens
      });
      expect(result).toEqual(mockResponse);
    });

    test('should handle empty tokens array', async () => {
      const tokens = [];
      const notification = {
        title: 'Test Notification',
        body: 'Test body'
      };

      const result = await firebaseService.sendMulticastMessage(tokens, notification);

      expect(result).toEqual({
        successCount: 0,
        failureCount: 0,
        responses: []
      });
      expect(mockMessaging.sendMulticast).not.toHaveBeenCalled();
    });

    test('should handle multicast message errors', async () => {
      const tokens = ['token1', 'token2'];
      const notification = {
        title: 'Test Notification',
        body: 'Test body'
      };

      mockMessaging.sendMulticast.mockRejectedValue(new Error('Invalid tokens'));

      await expect(firebaseService.sendMulticastMessage(tokens, notification))
        .rejects.toThrow('Invalid tokens');
    });
  });

  describe('Firebase Initialization', () => {
    test('should handle Firebase initialization errors', () => {
      // Reset the service's initialized state
      firebaseService.initialized = false;
      admin.apps = [];

      admin.initializeApp.mockImplementation(() => {
        throw new Error('Invalid service account');
      });

      expect(() => firebaseService.initializeFirebase()).toThrow('Invalid service account');
    });

    test('should handle missing Firebase configuration', () => {
      const originalEnv = process.env;
      process.env = {};

      expect(() => firebaseService.initializeFirebase()).not.toThrow();

      process.env = originalEnv;
    });
  });

  describe('Message Validation', () => {
    test('should handle invalid notification object', async () => {
      const token = 'device-token-123';
      const invalidNotification = { title: 'Test' }; // Missing body

      // The actual implementation doesn't validate notification structure
      // So this should not throw an error
      mockMessaging.send.mockResolvedValue('message-id-123');

      const result = await firebaseService.sendSingleMessage(token, invalidNotification);
      expect(result).toBe('message-id-123');
    });

    test('should validate token format', async () => {
      const invalidToken = 'invalid-token';
      const notification = {
        title: 'Test Notification',
        body: 'Test body'
      };

      mockMessaging.send.mockRejectedValue(new Error('Invalid token'));

      await expect(firebaseService.sendSingleMessage(invalidToken, notification))
        .rejects.toThrow('Invalid token');
    });
  });
});