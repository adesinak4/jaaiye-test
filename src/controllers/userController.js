const User = require('../models/User');
const { generateVerificationCode } = require('../services/authService');
const { sendPushNotification, createInAppNotification } = require('../services/notificationService');
const logger = require('../utils/logger');
const { emailQueue } = require('../queues');
const { addToBlacklist } = require('../services/authService');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  successResponse,
  errorResponse,
  notFoundResponse,
  conflictResponse,
  formatUserResponse
} = require('../utils/response');
const { NotFoundError, ConflictError, ValidationError, AuthenticationError } = require('../middleware/errorHandler');
const { EMAIL_CONSTANTS } = require('../../constants');

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
exports.getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  logger.info('User profile retrieved', {
    userId: req.user.id,
    email: user.email
  });

  return successResponse(res, { user: formatUserResponse(user) });
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
exports.updateProfile = asyncHandler(async (req, res) => {
  const { username, fullName, preferences } = req.body;
  const user = await User.findById(req.user.id);

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // If changing username, check if it's available
  if (username && username !== user.username) {
    const usernameExists = await User.findOne({ username });
    if (usernameExists) {
      throw new ConflictError('Username already taken');
    }
    user.username = username;
  }

  // If changing full name
  if (fullName) {
    user.fullName = fullName;
  }

  if (preferences) {
    user.preferences = preferences;
  }

  await user.save();

  logger.info('User profile updated', {
    userId: req.user.id,
    updatedFields: { username, fullName, preferences }
  });

  return successResponse(res, { user: formatUserResponse(user) });
});

// @desc    Change password
// @route   PUT /api/users/password
// @access  Private
exports.changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = await User.findById(req.user.id).select('+password');

  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Verify current password
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw new AuthenticationError('Current password is incorrect');
  }

  // Update password
  user.password = newPassword;
  await user.save();

  logger.info('User password changed', {
    userId: req.user.id
  });

  return successResponse(res, null, 200, 'Password updated successfully');
});

// @desc    Delete user account (Soft delete)
// @route   DELETE /api/users
// @access  Private
exports.deleteUser = asyncHandler(async (req, res) => {
  // Verify password
  const user = await User.findById(req.user.id).select('+password +refresh.token +refresh.expiresAt');

  if (!(await user.comparePassword(req.body.password))) {
    throw new AuthenticationError('Invalid password');
  }

  // Revoke tokens (implementation depends on your auth system)
  await addToBlacklist(user.refresh.token, user.refresh.expiresAt);
  await User.findByIdAndUpdate(req.user.id, { $unset: { 'refresh.token': 1, 'refresh.expiresAt': 1 } });

  // Soft delete
  await user.softDelete();

  // Send account deactivation email in background
  await emailQueue.sendAccountDeactivationEmailAsync(user.email);

  logger.info('User account deleted', {
    userId: req.user.id,
    email: user.email
  });

  return res.status(204).end();
});

// @desc    Update user email
// @route   PUT /api/users/email
// @access  Private
exports.updateEmail = asyncHandler(async (req, res) => {
  const { email, currentPassword } = req.body;

  // Validate input
  if (!email || !currentPassword) {
    throw new ValidationError('Email and current password are required');
  }

  const user = await User.findById(req.user.id).select('+password +verification');
  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (user.email === email) {
    throw new ConflictError('New email cannot be the same as the current email');
  }

  // Check if email is already taken
  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new ConflictError('Email is already in use');
  }

  // Verify current password
  const isMatch = await user.comparePassword(currentPassword);
  if (!isMatch) {
    throw new AuthenticationError('Current password is incorrect');
  }

  const verificationCode = generateVerificationCode();

  const previousEmail = user.email;
  // Update email and set as unverified
  user.email = email;
  user.emailVerified = false;
  user.verification = user.verification || {};
  user.verification.code = verificationCode;
  user.verification.expires = new Date(Date.now() + EMAIL_CONSTANTS.VERIFICATION_EXPIRY);
  await user.save();

  // Send verification email in background (faster API response)
  await emailQueue.sendVerificationEmailAsync(user.email, verificationCode);

  // Send notification in background (faster API response)
  const notification = {
    title: 'Email Update',
    body: 'Please verify your new email address',
    data: { type: 'email_update' }
  };

  // Use background processing for faster response
  await sendPushNotification(user._id, notification);
  await createInAppNotification(user._id, notification);

  logger.info('User email updated', {
    userId: req.user.id,
    oldEmail: previousEmail,
    newEmail: email
  });

  return successResponse(res, null, 200, 'Email updated. Please verify your new email address.');
});

// @desc    Update profile picture
// @route   PUT /api/users/profile-picture
// @access  Private
exports.updateProfilePicture = asyncHandler(async (req, res) => {
  const { emoji, color } = req.body;

  if (!emoji || !color) {
    throw new ValidationError('Please provide both emoji and color');
  }

  // Validate color format
  const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  if (!colorRegex.test(color)) {
    throw new ValidationError('Invalid color format. Please use hex color code (e.g., #FF0000)');
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Update profile picture
  user.profilePicture = { emoji, color };
  await user.save();

  // Send notification in background (faster API response)
  const notification = {
    title: 'Profile Updated',
    body: 'Your profile picture has been updated',
    data: { type: 'profile_update' }
  };

  // Use background processing for faster response
  await sendPushNotification(user._id, notification);
  await createInAppNotification(user._id, notification);

  logger.info('User profile picture updated', {
    userId: req.user.id,
    emoji,
    color
  });

  return successResponse(res, user.profilePicture);
});

// @desc    Logout user
// @route   POST /api/users/logout
// @access  Private
exports.logout = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('+refresh.token +refresh.expiresAt');

  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (!user.refresh?.token) {
    logger.info('User has already logged out', { userId: req.user.id });
    return successResponse(res, null, 200, 'User has already logged out');
  }

  // Clear refresh token
  await addToBlacklist(user.refresh.token, user.refresh.expiresAt);
  await User.findByIdAndUpdate(req.user.id, { $unset: { 'refresh.token': 1, 'refresh.expiresAt': 1 } });

  // Send notification in background (faster API response)
  const notification = {
    title: 'Security Alert',
    body: 'You have been logged out',
    data: { type: 'logout' }
  };

  // Use background processing for faster response
  await sendPushNotification(user._id, notification);
  await createInAppNotification(user._id, notification);

  logger.info('User logged out', {
    userId: req.user.id,
    email: user.email
  });

  return successResponse(res, null, 200, 'Logged out successfully');
});