const User = require('../models/User');
const Friendship = require('../models/Friendship');
const FriendRequest = require('../models/FriendRequest');
const { generateVerificationCode } = require('../services/authService');
const { sendPushNotification, createInAppNotification } = require('../services/notificationService');
const firebaseService = require('../services/firebaseService');
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
const { NotFoundError, ConflictError, ValidationError, AuthenticationError, BadRequestError } = require('../middleware/errorHandler');
const { EMAIL_CONSTANTS } = require('../../constants');

// @desc    Get Firebase token
// @route   GET /api/users/firebase-token
// @access  Private
exports.getFirebaseToken = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  const firebaseToken = await firebaseService.generateToken(user._id.toString());
  return successResponse(res, { firebaseToken });
});

// @desc    Get current user profile
// @route   GET /api/users/profile
// @access  Private
exports.getProfile = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id).select('+googleCalendar.refreshToken');

  if (!user) {
    throw new NotFoundError('User not found');
  }

  logger.info('User profile retrieved', {
    userId: req.user.id,
    email: user.email
  });

  const userResponse = formatUserResponse(user);
  console.log(user)
  userResponse.isGoogleCalendarLinked = !!(user.googleCalendar && user.googleCalendar.refreshToken);

  return successResponse(res, { user: userResponse });
});

// @desc    Update user profile
// @route   PUT /api/users/profile
// @access  Private
exports.updateProfile = asyncHandler(async (req, res) => {
  const { username, fullName, preferences, emoji, color } = req.body;
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

  // Validate color format
  const colorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
  if (!colorRegex.test(color)) {
    throw new ValidationError('Invalid color format. Please use hex color code (e.g., #FF0000)');
  }

  // If changing full name
  if (fullName) {
    user.fullName = fullName;
  }

  if (preferences) {
    user.preferences = preferences;
  }

  if (emoji && color) {
    user.profilePicture = { emoji, color };
  }

  await user.save();

  // Send notification in background (faster API response)
  const notification = {
    title: 'Profile Updated',
    body: 'Your profile has been updated',
    data: { type: 'profile_update' }
  };

  // Use background processing for faster response
  await sendPushNotification(user._id, notification);
  await createInAppNotification(user._id, notification);

  logger.info('User profile updated', {
    userId: req.user.id,
    updatedFields: { username, fullName, preferences, emoji, color }
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

// ==================== FRIENDS FUNCTIONALITY ====================

// @desc    Search users for friend requests
// @route   GET /api/users/search
// @access  Private
exports.searchUsers = asyncHandler(async (req, res) => {
  const { query, limit = 20 } = req.query;
  const userId = req.user.id;

  if (!query || query.trim().length < 2) {
    throw new ValidationError('Search query must be at least 2 characters long');
  }

  const searchRegex = new RegExp(query.trim(), 'i');

  const users = await User.find({
    $and: [
      { _id: { $ne: userId } }, // Exclude current user
      { isDeleted: { $ne: true } }, // Exclude deleted users
      { isActive: true }, // Only active users
      { 'friendSettings.showInSearch': true }, // Only users who allow search
      {
        $or: [
          { username: searchRegex },
          { fullName: searchRegex },
          { email: searchRegex }
        ]
      }
    ]
  })
    .select('username fullName profilePicture email')
    .limit(parseInt(limit));

  // Check friendship status for each user
  const usersWithStatus = await Promise.all(
    users.map(async (user) => {
      const friendship = await Friendship.findFriendship(userId, user._id);
      const friendRequest = await FriendRequest.findOne({
        $or: [
          { requester: userId, recipient: user._id },
          { requester: user._id, recipient: userId }
        ],
        status: 'pending'
      });

      return {
        ...formatUserResponse(user),
        friendshipStatus: friendship ? friendship.status : null,
        friendRequestStatus: friendRequest ? friendRequest.status : null,
        isFriend: friendship && friendship.status === 'active'
      };
    })
  );

  logger.info('User search performed', {
    userId,
    query,
    resultsCount: usersWithStatus.length
  });

  return successResponse(res, { users: usersWithStatus });
});

// @desc    Send friend request
// @route   POST /api/users/friend-request
// @access  Private
exports.sendFriendRequest = asyncHandler(async (req, res) => {
  const { recipientId, message } = req.body;
  const requesterId = req.user.id;

  if (requesterId === recipientId) {
    throw new BadRequestError('Cannot send friend request to yourself');
  }

  // Check if recipient exists
  const recipient = await User.findById(recipientId);
  if (!recipient) {
    throw new NotFoundError('User not found');
  }

  // Check if recipient allows friend requests
  if (!recipient.friendSettings.allowFriendRequests) {
    throw new BadRequestError('This user does not accept friend requests');
  }

  // Check if already friends
  const existingFriendship = await Friendship.findFriendship(requesterId, recipientId);
  if (existingFriendship && existingFriendship.status === 'active') {
    throw new ConflictError('You are already friends with this user');
  }

  // Check if there's already a pending request
  const existingRequest = await FriendRequest.findOne({
    $or: [
      { requester: requesterId, recipient: recipientId },
      { requester: recipientId, recipient: requesterId }
    ],
    status: 'pending'
  });

  if (existingRequest) {
    throw new ConflictError('Friend request already exists');
  }

  // Create friend request
  const friendRequest = await FriendRequest.create({
    requester: requesterId,
    recipient: recipientId,
    message: message?.trim()
  });

  // Send notification to recipient
  const requester = await User.findById(requesterId).select('username fullName');
  await sendPushNotification(recipientId, {
    title: 'New Friend Request',
    body: `${requester.username || requester.fullName} wants to be your friend`,
    data: { type: 'friend_request', requestId: friendRequest._id }
  });

  await createInAppNotification(recipientId, {
    title: 'New Friend Request',
    body: `${requester.username || requester.fullName} wants to be your friend`,
    data: { type: 'friend_request', requestId: friendRequest._id }
  });

  logger.info('Friend request sent', {
    requesterId,
    recipientId,
    requestId: friendRequest._id
  });

  return successResponse(res, { requestId: friendRequest._id }, 201, 'Friend request sent');
});

// @desc    Get friend requests
// @route   GET /api/users/friend-requests
// @access  Private
exports.getFriendRequests = asyncHandler(async (req, res) => {
  const { type = 'received' } = req.query; // 'received' or 'sent'
  const userId = req.user.id;

  const query = type === 'sent'
    ? { requester: userId, status: 'pending' }
    : { recipient: userId, status: 'pending' };

  const requests = await FriendRequest.find(query)
    .populate('requester', 'username fullName profilePicture')
    .populate('recipient', 'username fullName profilePicture')
    .sort({ createdAt: -1 });

  logger.info('Friend requests retrieved', {
    userId,
    type,
    count: requests.length
  });

  return successResponse(res, { requests });
});

// @desc    Respond to friend request
// @route   PUT /api/users/friend-requests/:requestId
// @access  Private
exports.respondToFriendRequest = asyncHandler(async (req, res) => {
  const { requestId } = req.params;
  const { action } = req.body; // 'accept' or 'decline'
  const userId = req.user.id;

  const friendRequest = await FriendRequest.findById(requestId);
  if (!friendRequest) {
    throw new NotFoundError('Friend request not found');
  }

  // Check if user is the recipient
  if (friendRequest.recipient.toString() !== userId) {
    throw new BadRequestError('You can only respond to friend requests sent to you');
  }

  if (friendRequest.status !== 'pending') {
    throw new BadRequestError('Friend request has already been processed');
  }

  if (action === 'accept') {
    // Create friendship
    const friendship = await Friendship.createFriendship(
      friendRequest.requester,
      friendRequest.recipient,
      friendRequest.requester
    );

    // Add friends to both users' friends arrays
    const [requester, recipient] = await Promise.all([
      User.findById(friendRequest.requester),
      User.findById(friendRequest.recipient)
    ]);

    await Promise.all([
      requester.addFriend(recipient._id, friendship._id),
      recipient.addFriend(requester._id, friendship._id)
    ]);

    // Update friend request status
    friendRequest.status = 'accepted';
    await friendRequest.save();

    // Send notification to requester
    await sendPushNotification(friendRequest.requester, {
      title: 'Friend Request Accepted',
      body: `${recipient.username || recipient.fullName} accepted your friend request`,
      data: { type: 'friend_request_accepted', friendshipId: friendship._id }
    });

    logger.info('Friend request accepted', {
      requestId,
      requesterId: friendRequest.requester,
      recipientId: friendRequest.recipient,
      friendshipId: friendship._id
    });

    return successResponse(res, { friendshipId: friendship._id }, 200, 'Friend request accepted');
  } else if (action === 'decline') {
    friendRequest.status = 'declined';
    await friendRequest.save();

    logger.info('Friend request declined', {
      requestId,
      requesterId: friendRequest.requester,
      recipientId: friendRequest.recipient
    });

    return successResponse(res, null, 200, 'Friend request declined');
  } else {
    throw new ValidationError('Invalid action. Must be "accept" or "decline"');
  }
});

// @desc    Get friends list
// @route   GET /api/users/friends
// @access  Private
exports.getFriends = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const friendships = await Friendship.getFriends(userId);

  const friends = friendships.map(friendship => {
    const friend = friendship.user1._id.toString() === userId
      ? friendship.user2
      : friendship.user1;

    return {
      ...formatUserResponse(friend),
      friendshipId: friendship._id,
      addedAt: friendship.createdAt
    };
  });

  logger.info('Friends list retrieved', {
    userId,
    friendsCount: friends.length
  });

  return successResponse(res, { friends });
});

// @desc    Remove friend
// @route   DELETE /api/users/friends/:friendId
// @access  Private
exports.removeFriend = asyncHandler(async (req, res) => {
  const { friendId } = req.params;
  const userId = req.user.id;

  // Find friendship
  const friendship = await Friendship.findFriendship(userId, friendId);
  if (!friendship) {
    throw new NotFoundError('Friendship not found');
  }

  // Remove from both users' friends arrays
  const [user, friend] = await Promise.all([
    User.findById(userId),
    User.findById(friendId)
  ]);

  await Promise.all([
    user.removeFriend(friendId),
    friend.removeFriend(userId)
  ]);

  // Delete friendship
  await Friendship.findByIdAndDelete(friendship._id);

  logger.info('Friend removed', {
    userId,
    friendId,
    friendshipId: friendship._id
  });

  return successResponse(res, null, 200, 'Friend removed successfully');
});

// @desc    Block user
// @route   POST /api/users/block/:userId
// @access  Private
exports.blockUser = asyncHandler(async (req, res) => {
  const { userId: blockUserId } = req.params;
  const currentUserId = req.user.id;

  if (currentUserId === blockUserId) {
    throw new BadRequestError('Cannot block yourself');
  }

  // Check if user exists
  const userToBlock = await User.findById(blockUserId);
  if (!userToBlock) {
    throw new NotFoundError('User not found');
  }

  // Find existing friendship
  const friendship = await Friendship.findFriendship(currentUserId, blockUserId);

  if (friendship) {
    // Block existing friendship
    await friendship.block(currentUserId);
  } else {
    // Create blocked friendship
    await Friendship.createFriendship(currentUserId, blockUserId, currentUserId);
    const newFriendship = await Friendship.findFriendship(currentUserId, blockUserId);
    await newFriendship.block(currentUserId);
  }

  logger.info('User blocked', {
    currentUserId,
    blockedUserId: blockUserId
  });

  return successResponse(res, null, 200, 'User blocked successfully');
});

// @desc    Unblock user
// @route   POST /api/users/unblock/:userId
// @access  Private
exports.unblockUser = asyncHandler(async (req, res) => {
  const { userId: unblockUserId } = req.params;
  const currentUserId = req.user.id;

  const friendship = await Friendship.findFriendship(currentUserId, unblockUserId);
  if (!friendship) {
    throw new NotFoundError('Friendship not found');
  }

  if (friendship.status !== 'blocked') {
    throw new BadRequestError('User is not blocked');
  }

  await friendship.unblock();

  logger.info('User unblocked', {
    currentUserId,
    unblockedUserId: unblockUserId
  });

  return successResponse(res, null, 200, 'User unblocked successfully');
});

// @desc    Update friend settings
// @route   PUT /api/users/friend-settings
// @access  Private
exports.updateFriendSettings = asyncHandler(async (req, res) => {
  const { allowFriendRequests, allowRequestsFrom, showInSearch } = req.body;
  const userId = req.user.id;

  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  if (allowFriendRequests !== undefined) {
    user.friendSettings.allowFriendRequests = allowFriendRequests;
  }

  if (allowRequestsFrom !== undefined) {
    if (!['everyone', 'friends_of_friends', 'nobody'].includes(allowRequestsFrom)) {
      throw new ValidationError('Invalid allowRequestsFrom value');
    }
    user.friendSettings.allowRequestsFrom = allowRequestsFrom;
  }

  if (showInSearch !== undefined) {
    user.friendSettings.showInSearch = showInSearch;
  }

  await user.save();

  logger.info('Friend settings updated', {
    userId,
    settings: user.friendSettings
  });

  return successResponse(res, { friendSettings: user.friendSettings }, 200, 'Friend settings updated');
});