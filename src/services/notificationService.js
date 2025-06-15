const admin = require('firebase-admin');
const User = require('../models/User');
const serviceAccount = require("../config/jaaiye-test-firebase-adminsdk-fbsvc-88032ddc85.json");

class NotificationService {
  constructor() {
    // Initialize Firebase Admin if not already initialized
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    }
  }

  // Send push notification
  async sendPushNotification(userId, notification) {
    try {
      const user = await User.findById(userId);
      if (!user || !user.preferences?.notifications?.push) {
        return;
      }

      // Get user's device tokens (you'll need to store these when user logs in from a device)
      const deviceTokens = user.deviceTokens || [];
      if (deviceTokens.length === 0) {
        return;
      }

      const message = {
        notification: {
          title: notification.title,
          body: notification.body,
        },
        data: notification.data || {},
        tokens: deviceTokens,
      };

      const response = await admin.messaging().sendMulticast(message);

      // Handle failed tokens
      if (response.failureCount > 0) {
        const failedTokens = [];
        response.responses.forEach((resp, idx) => {
          if (!resp.success) {
            failedTokens.push(deviceTokens[idx]);
          }
        });
        // Remove failed tokens from user's device tokens
        await User.updateOne(
          { _id: userId },
          { $pull: { deviceTokens: { $in: failedTokens } } }
        );
      }

      return response;
    } catch(error) {
      console.error('Error sending push notification:', err);
      next(error);
    }
  }

  // Save device token for a user
  async saveDeviceToken(userId, token, platform) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      // Add token if not already present
      if (!user.deviceTokens.includes(token, platform)) {
        await User.updateOne(
          { _id: userId },
          { $addToSet: { deviceTokens: token } }
        );
      }

      return true;
    } catch(error) {
      console.error('Error saving device token:', err);
      next(error);
    }
  }

  // Remove device token for a user
  async removeDeviceToken(userId, token) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      await User.updateOne(
        { _id: userId },
        { $pull: { deviceTokens: token } }
      );

      return true;
    } catch(error) {
      console.error('Error removing device token:', err);
      next(error);
    }
  }

  // Create in-app notification
  async createInAppNotification(userId, notification) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      const newNotification = {
        ...notification,
        read: false,
        createdAt: new Date()
      };

      await User.updateOne(
        { _id: userId },
        { $push: { notifications: newNotification } }
      );

      return newNotification;
    } catch(error) {
      console.error('Error creating in-app notification:', err);
      next(error);
    }
  }

  // Mark notification as read
  async markNotificationAsRead(userId, notificationId) {
    try {
      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      await User.updateOne(
        { _id: userId, 'notifications._id': notificationId },
        { $set: { 'notifications.$.read': true } }
      );

      return true;
    } catch(error) {
      console.error('Error marking notification as read:', err);
      next(error);
    }
  }
}

// Create a single instance and export it
const notificationService = new NotificationService();
module.exports = notificationService;