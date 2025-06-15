const Notification = require('../models/Notification');
const notificationService = require('../services/notificationService');

// Register a new device token for push notifications
exports.registerDeviceToken = async (req, res, next) => {
  try {
    const { token, platform } = req.body;
    const userId = req.user._id;

    await notificationService.saveDeviceToken(userId, token, platform);

    res.status(200).json({
      success: true,
      message: 'Device token registered successfully'
    });
  } catch(error) {
    logger.error('Error registering device token', error)
    res.status(500).json({
      success: false,
      message: 'Error registering device token',
      error: error.message
    });
  }
};

// Remove a device token
exports.removeDeviceToken = async (req, res, next) => {
  try {
    const { token } = req.params;
    const userId = req.user._id;

    await notificationService.removeDeviceToken(userId, token);

    res.status(200).json({
      success: true,
      message: 'Device token removed successfully'
    });
  } catch(error) {
    logger.error('Error removing device token', error)
    res.status(500).json({
      success: false,
      message: 'Error removing device token',
      error: error.message
    });
  }
};

// Get user's notifications with filters
exports.getNotifications = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const {
      page = 1,
      limit = 10,
      read,
      type,
      priority
    } = req.query;

    const query = { user: userId };

    if (read !== undefined) {
      query.read = read === 'true';
    }

    if (type) {
      query.type = type;
    }

    if (priority) {
      query.priority = priority;
    }

    const notifications = await Notification.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Notification.countDocuments(query);

    res.status(200).json({
      success: true,
      notifications,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit)
    });
  } catch(error) {
    logger.error('Error fetching notifications', error)
    res.status(500).json({
      success: false,
      message: 'Error fetching notifications',
      error: error.message
    });
  }
};

// Mark notification as read
exports.markAsRead = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOne({
      _id: id,
      user: userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    notification.read = true;
    await notification.save();

    res.status(200).json({
      success: true,
      message: 'Notification marked as read'
    });
  } catch(error) {
    logger.error('Error marking notification as read', error)
    res.status(500).json({
      success: false,
      message: 'Error marking notification as read',
      error: error.message
    });
  }
};

// Bulk mark notifications as read
exports.bulkMarkAsRead = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { notificationIds } = req.body;

    const result = await Notification.updateMany(
      {
        _id: { $in: notificationIds },
        user: userId
      },
      { $set: { read: true } }
    );

    res.status(200).json({
      success: true,
      message: `${result.modifiedCount} notifications marked as read`
    });
  } catch(error) {
    logger.error('Error marking notifications as read', error)
    res.status(500).json({
      success: false,
      message: 'Error marking notifications as read',
      error: error.message
    });
  }
};

// Delete notification
exports.deleteNotification = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    const notification = await Notification.findOneAndDelete({
      _id: id,
      user: userId
    });

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found'
      });
    }

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully'
    });
  } catch(error) {
    logger.error('Error deleting notification', error)
    res.status(500).json({
      success: false,
      message: 'Error deleting notification',
      error: error.message
    });
  }
};

// Bulk delete notifications
exports.bulkDelete = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const { notificationIds } = req.body;

    const result = await Notification.deleteMany({
      _id: { $in: notificationIds },
      user: userId
    });

    res.status(200).json({
      success: true,
      message: `${result.deletedCount} notifications deleted`
    });
  } catch(error) {
    logger.error('Error deleting notifications', error)
    res.status(500).json({
      success: false,
      message: 'Error deleting notifications',
      error: error.message
    });
  }
};

// Create and send a new notification
exports.createNotification = async (userId, title, message, type, data = {}) => {
  try {
    const notification = new Notification({
      user: userId,
      title,
      message,
      type,
      data
    });

    await notification.save();

    // Send push notification to all registered devices
    const userNotification = await Notification.findOne({ user: userId });
    if (userNotification && userNotification.deviceTokens.length > 0) {
      const tokens = userNotification.deviceTokens.map(t => t.token);
      await notificationService.sendPushNotification(userId, {
        title,
        body: message,
        data
      });
    }

    return notification;
  } catch(error) {
    logger.error('Error creating notification', error)
    next(error);
  }
};