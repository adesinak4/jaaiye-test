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
  logout
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

// Protected routes
router.use(protect);

// User profile routes
router.get('/profile', getProfile);
router.put('/profile', updateProfile);
router.put('/password', validatePassword, changePassword);
router.put('/email', updateEmail);
router.delete('/', validateDeactivateAccount, deleteUser);
router.post('/logout', logout);

module.exports = router;