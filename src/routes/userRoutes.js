const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { protect, admin } = require('../middleware/authMiddleware');
const {
  getProfile,
  updateProfile,
  changePassword,
  deleteUser,
  updateEmail,
  logout,
  // Friends functionality
  searchUsers,
  sendFriendRequest,
  getFriendRequests,
  respondToFriendRequest,
  getFriends,
  removeFriend,
  blockUser,
  unblockUser,
  updateFriendSettings
} = require('../controllers/userController');

// Validation middleware
const validatePassword = [
  body('currentPassword').notEmpty().withMessage('Current password is required'),
  body('newPassword').isLength({ min: 6 }).withMessage('New password must be at least 6 characters long')
];

const validateProfilePicture = [
  body('emoji').notEmpty().withMessage('Emoji is required'),
  body('color').notEmpty().withMessage('Color is required'),
];

const validateDeactivateAccount = [
  body('password').notEmpty().withMessage('Password is required to deactivate account')
];

const validateFriendRequest = [
  body('recipientId').isMongoId().withMessage('Valid recipient ID is required'),
  body('message').optional().isLength({ max: 200 }).withMessage('Message cannot exceed 200 characters')
];

const validateFriendRequestResponse = [
  body('action').isIn(['accept', 'decline']).withMessage('Action must be either "accept" or "decline"')
];

const validateFriendSettings = [
  body('allowFriendRequests').optional().isBoolean().withMessage('allowFriendRequests must be boolean'),
  body('allowRequestsFrom').optional().isIn(['everyone', 'friends_of_friends', 'nobody']).withMessage('Invalid allowRequestsFrom value'),
  body('showInSearch').optional().isBoolean().withMessage('showInSearch must be boolean')
];

// Protected routes
router.use(protect);

// User profile routes
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.put('/password', validatePassword, changePassword);
router.put('/email', updateEmail);
router.delete('/', validateDeactivateAccount, deleteUser);
router.post('/logout', logout);

// Friends functionality routes
router.get('/search', searchUsers);
router.post('/friend-request', validateFriendRequest, sendFriendRequest);
router.get('/friend-requests', getFriendRequests);
router.put('/friend-requests/:requestId', validateFriendRequestResponse, respondToFriendRequest);
router.get('/friends', getFriends);
router.delete('/friends/:friendId', removeFriend);
router.post('/block/:userId', blockUser);
router.post('/unblock/:userId', unblockUser);
router.put('/friend-settings', validateFriendSettings, updateFriendSettings);

module.exports = router;