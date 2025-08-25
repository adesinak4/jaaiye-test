const express = require('express');
const router = express.Router();
const {
  register,
  login,
  verifyEmail,
  forgotPassword,
  resetPassword,
  refreshToken,
  resend,
  googleSignInViaIdToken
} = require('../controllers/authController');

const {
  registerValidator,
  loginValidator,
  verifyEmailValidator,
  forgotPasswordValidator,
  resetPasswordValidator,
  resendVerificationValidator
} = require('../validators/authValidators');
const { validate } = require('../middleware/validationMiddleware');
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
router.post('/resend', apiLimiter, resendVerificationValidator, validate, resend);

// Google sign-in/up via ID token (mobile sends idToken)
router.post('/google/signin', apiLimiter, googleSignInViaIdToken);

module.exports = router;