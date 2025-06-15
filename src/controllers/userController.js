const User = require('../models/User');
const { sendVerificationEmail } = require('../services/emailService');
const { sendPushNotification, createInAppNotification } = require('../services/notificationService');
const logger = require('../utils/logger');
const emailService = require('../services/emailService');
const { addToBlacklist } = require('../services/authService');

let notification;

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
exports.getProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      logger.error('User not found', new Error('User not found'), 404, { error: error.stack });
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        emailVerified: user.emailVerified,
        profilePicture: user.profilePicture,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    logger.error('Failed to get user profile', error, 500, { error: error.stack });
    next(error);
  }
};

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
exports.updateProfile = async (req, res, next) => {
  try {
    const { username, fullName } = req.body;
    const user = await User.findById(req.user.id);

    if (!user) {
      logger.error('User not found', new Error('User not found'), 404, { error: error.stack });
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // If changing username, check if it's available
    if (username && username !== user.username) {
      const usernameExists = await User.findOne({ username });
      if (usernameExists) {
        logger.error('Username already exists', new Error('Username taken'), 409, { username });
        return res.status(409).json({
          success: false,
          error: 'Username already taken'
        });
      }
      user.username = username;
    }

    // If changing full name
    if (fullName) {
      user.fullName = fullName;
    }

    await user.save();

    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        username: user.username,
        fullName: user.fullName,
        emailVerified: user.emailVerified,
        profilePicture: user.profilePicture,
        createdAt: user.createdAt
      }
    });
  } catch (error) {
    logger.error('Failed to update profile', error, 500, { error: error.stack });
    next(error);
  }
};

// @desc    Change password
// @route   PUT /api/users/password
// @access  Private
exports.changePassword = async (req, res, next) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user.id).select('+password');

    if (!user) {
      logger.error('User not found', new Error('User not found'), 404, { error: error.stack });
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Verify current password
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      logger.error('Invalid current password', new Error('Invalid password'), 401, { error: error.stack });
      return res.status(401).json({
        success: false,
        error: 'Current password is incorrect'
      });
    }

    // Update password
    user.password = newPassword;
    await user.save();

    res.json({
      success: true,
      message: 'Password updated successfully'
    });
  } catch (error) {
    logger.error('Failed to change password', error, 500, { error: error.stack });
    next(error);
  }
};

// @desc    Delete user account (Soft delete)
// @route   DELETE /api/users
// @access  Private
exports.deleteUser = async (req, res, next) => {
  try {
    // Verify password
    const user = await User.findById(req.user.id).select('+password +refresh.token +refresh.expiresAt');
    if (!(await user.comparePassword(req.body.password))) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid password'
      });
    }

    // Revoke tokens (implementation depends on your auth system)
    await addToBlacklist(user.refresh.token, user.refresh.expiresAt);
    await User.findByIdAndUpdate(req.user.id, { $unset: { 'refresh.token': 1, 'refresh.expiresAt': 1 } });

    // Soft delete
    await user.softDelete();
    await emailService.sendAccountDeactivationEmail(user.email)

    res.status(204).end();
  } catch (error) {
    logger.error(`Account deletion failed: ${error.message}`);
    next(error);
  }
};

// @desc    Update user email
// @route   PUT /api/users/email
// @access  Private
exports.updateEmail = async (req, res, next) => {
  try {
    const { email, currentPassword } = req.body;

    // Validate input
    if (!email || !currentPassword) {
      return res.status(400).json({
        success: false,
        error: 'Email and current password are required'
      });
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }
    console.log(user);

    // Check if email is already taken
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        success: false,
        error: 'Email is already in use'
      });
    }

    // Update email and set as unverified
    user.email = email;
    user.emailVerified = false;

    // If changing password
    if (currentPassword) {
      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) {
        logger.error('Invalid current password', new Error('Invalid password'), 401, { error: error.stack });
        return res.status(401).json({
          success: false,
          error: 'Current password is incorrect'
        });
      }
    }
    console.log(isMatch);

    await user.save();

    // Send verification email
    await sendVerificationEmail(user);

    notification = {
      title: 'Email Update',
      body: 'Please verify your new email address',
      data: { type: 'email_update' }
    }

    // Send notification
    await sendPushNotification(user._id, notification);
    await createInAppNotification(user._id, notification);

    res.json({
      success: true,
      message: 'Email updated. Please verify your new email address.'
    });
  } catch (error) {
    console.error('Error updating email', error.stack);
    res.status(500).json({
      success: false,
      error: error.message,
      // stack: error.stack
    });
  }
};

// @desc    Update profile picture
// @route   PUT /api/users/profile-picture
// @access  Private
exports.updateProfilePicture = async (req, res, next) => {
  try {
    const { emoji, color } = req.body;

    if (!emoji || !color) {
      logger.error('Missing required fields', new Error('Missing fields'), 400, {
        userId: req.user.id,
        providedFields: { emoji, color }
      });
      return res.status(400).json({
        success: false,
        error: 'Please provide both emoji and color'
      });
    }

    // Validate color format
    const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
    if (!colorRegex.test(color)) {
      logger.error('Invalid color format', new Error('Invalid color'), 400, {
        userId: req.user.id,
        color
      });
      return res.status(400).json({
        success: false,
        error: 'Invalid color format. Please use hex color code (e.g., #FF0000)'
      });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      logger.error('User not found', new Error('User not found'), 404, { error: error.stack });
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Update profile picture
    user.profilePicture = {
      emoji,
      color
    };
    await user.save();

    notification = {
      title: 'Profile Updated',
      body: 'Your profile picture has been updated',
      data: { type: 'profile_update' }
    }

    // Send notification
    await sendPushNotification(user._id, notification);
    await createInAppNotification(user._id, notification);

    res.json({
      success: true,
      data: user.profilePicture
    });
  } catch (error) {
    logger.error('Failed to update profile picture', error, 500, { error: error.stack });
    next(error);
  }
};

// @desc    Logout user
// @route   POST /api/users/logout
// @access  Private
exports.logout = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id).select('+refresh.token +refresh.expiresAt');
    if (!user) {
      logger.error('User not found', new Error('User not found'), 404, { error: error.stack });
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    if (!user.refresh?.token) {
      logger.info('User has already logged out.')
      return res.status(200).json({
        success: true,
        message: 'User has already logged out'
      });
    }

    // Clear refresh token
    await addToBlacklist(user.refresh.token, user.refresh.expiresAt);
    await User.findByIdAndUpdate(req.user.id, { $unset: { 'refresh.token': 1, 'refresh.expiresAt': 1 } });

    // Send notification
    notification = {
      title: 'Security Alert',
      body: 'You have been logged out',
      data: { type: 'logout' }
    }
    await sendPushNotification(user._id, notification);
    await createInAppNotification(user._id, notification);

    res.json({
      success: true,
      message: 'Logged out successfully'
    });
  } catch (error) {
    logger.error('Failed to logout', error, 500, { error: error.stack });
    next(error);
  }
};