const express = require('express');
const router = express.Router();
const passport = require('passport');
const {
  register,
  login,
  verifyEmail,
  forgotPassword,
  resetPassword,
  refreshToken,
  googleCallback,
  appleCallback,
  getMe
} = require('../controllers/authController');
const {
  registerValidator,
  loginValidator,
  verifyEmailValidator,
  forgotPasswordValidator,
  resetPasswordValidator
} = require('../validators/authValidators');
const { validate } = require('../middleware/validationMiddleware');
const { protect } = require('../middleware/authMiddleware');
const {
  apiLimiter,
  securityHeaders,
  sanitizeRequest
} = require('../middleware/securityMiddleware');

// Apply security middleware to all routes
router.use(securityHeaders);
router.use(sanitizeRequest);

// Public routes
router.post('/register', apiLimiter, registerValidator, validate, register);
router.post('/login', apiLimiter, loginValidator, validate, login);
router.post('/refresh-token', apiLimiter, refreshToken);
router.post('/verify-email', apiLimiter, verifyEmailValidator, validate, verifyEmail);
router.post('/forgot-password', apiLimiter, forgotPasswordValidator, validate, forgotPassword);
router.post('/reset-password', apiLimiter, resetPasswordValidator, validate, resetPassword);

// OAuth routes
router.get('/google', apiLimiter, passport.authenticate('google', { scope: ['profile', 'email'] }));
router.get('/google/callback', passport.authenticate('google', { failureRedirect: '/login' }), googleCallback);

router.get('/apple', apiLimiter, passport.authenticate('apple', { scope: ['name', 'email'] }));
router.get('/apple/callback', passport.authenticate('apple', { failureRedirect: '/login' }), appleCallback);

module.exports = router;