const User = require('../models/User');
const {
  generateToken,
  generateRefreshToken,
  generateVerificationCode,
  generateResetCode,
  isCodeExpired,
  verifyRefreshToken
} = require('../services/authService');
const { emailQueue } = require('../queues');
const logger = require('../utils/logger');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  successResponse
} = require('../utils/response');
const {
  ConflictError,
  AuthenticationError,
  ValidationError,
  NotFoundError
} = require('../middleware/errorHandler');
const { ERROR_MESSAGES, SUCCESS_MESSAGES, EMAIL_CONSTANTS } = require('../../constants');

// Internal helper to DRY resend flows
async function performResend(email, type) {
  const lowerType = String(type).toLowerCase();
  if (!['verification', 'reset'].includes(lowerType)) {
    throw new ValidationError("type must be either 'verification' or 'reset'");
  }

  const user = await User.findOne({ email }).select('+verification +resetPassword');

  if (lowerType === 'verification') {
    if (!user) {
      throw new NotFoundError(ERROR_MESSAGES.NOT_FOUND.USER);
    }
    if (user.emailVerified) {
      return { statusCode: 200, message: 'Email already verified', data: null };
    }

    const verificationCode = generateVerificationCode();
    user.verification = user.verification || {};
    user.verification.code = verificationCode;
    user.verification.expires = new Date(Date.now() + EMAIL_CONSTANTS.VERIFICATION_EXPIRY);
    await user.save();

    await emailQueue.sendVerificationEmailAsync(email, verificationCode);
    logger.info('Verification email resent', { email });

    return {
      statusCode: 200,
      message: SUCCESS_MESSAGES.EMAIL.VERIFICATION_SENT,
      data: { email, expiresIn: '10 minutes' }
    };
  }

  // type === 'reset'
  if (!user) {
    // Do not reveal if user exists
    return { statusCode: 200, message: 'If an account with this email exists, a reset code has been sent', data: null };
  }

  const resetCode = generateResetCode();
  user.resetPassword = user.resetPassword || {};
  user.resetPassword.code = resetCode;
  user.resetPassword.expires = new Date(Date.now() + EMAIL_CONSTANTS.PASSWORD_RESET_EXPIRY);
  await user.save();

  await emailQueue.sendPasswordResetEmailAsync(email, resetCode);
  logger.info('Password reset code resent', { email });

  return { statusCode: 200, message: 'If an account with this email exists, a reset code has been sent', data: null };
}

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
exports.register = asyncHandler(async (req, res) => {
  const { email, password, username, fullName } = req.body;

  // Check if user exists
  const userExists = await User.findOne({ email });
  if (userExists) {
    throw new ConflictError(ERROR_MESSAGES.AUTH.USER_EXISTS || 'User already exists with this email');
  }

  // Create user
  const user = await User.create({
    email,
    password,
    username,
    fullName
  });

  // Generate verification code
  const verificationCode = generateVerificationCode();
  user.verification = user.verification || {};
  user.verification.code = verificationCode;
  user.verification.expires = new Date(Date.now() + EMAIL_CONSTANTS.VERIFICATION_EXPIRY);
  await user.save();

  // Send verification email in background (faster API response)
  await emailQueue.sendVerificationEmailAsync(email, verificationCode);

  logger.info('User registered successfully', {
    email,
    userId: user._id
  });

  return successResponse(res, {
    email,
    expiresIn: "10 minutes"
  }, 201, SUCCESS_MESSAGES.USER.REGISTERED);
});

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // Check if user exists
  const user = await User.findOne({ email }).select('+password +verification');
  if (!user) {
    throw new AuthenticationError(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS);
  }

  // Check if password matches
  const isMatch = await user.comparePassword(password);
  if (!isMatch) {
    throw new AuthenticationError(ERROR_MESSAGES.AUTH.INVALID_CREDENTIALS);
  }

  // If email is not verified, reuse resend flow for verification
  if (!user.emailVerified) {
    const { data } = await performResend(email, 'verification');
    logger.info('Login attempted with unverified email', { email });
    return successResponse(res, data || { email, expiresIn: '10 minutes' }, 403, ERROR_MESSAGES.AUTH.EMAIL_NOT_VERIFIED);
  }

  // Generate tokens
  const accessToken = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Save refresh token to user
  user.refresh = {
    token: refreshToken,
    expiresAt: new Date(Date.now() + EMAIL_CONSTANTS.REFRESH_TOKEN_EXPIRY)
  };
  user.lastLogin = new Date(Date.now());
  await user.save();

  logger.info('User logged in successfully', {
    email,
    userId: user._id
  });

  return successResponse(res, {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      emailVerified: user.emailVerified,
      profilePicture: user.profilePicture
    }
  }, 200, SUCCESS_MESSAGES.USER.LOGGED_IN);
});

// @desc    Verify email
// @route   POST /api/auth/verify-email
// @access  Public
exports.verifyEmail = asyncHandler(async (req, res) => {
  const { code } = req.body;

  const user = await User.findOne({ 'verification.code': code }).select('+verification.code +verification.expires');
  if (!user) {
    throw new NotFoundError(ERROR_MESSAGES.NOT_FOUND.USER);
  }

  if (user.emailVerified) {
    return successResponse(res, null, 200, "Email already verified");
  }

  if (!user.verification.code || user.verification.code !== code) {
    throw new ValidationError('Invalid verification code');
  }

  if (isCodeExpired(user.verification.expires)) {
    throw new ValidationError('Verification code has expired');
  }

  // Mark email as verified
  user.emailVerified = true;
  user.verification.code = undefined;
  user.verification.expires = undefined;
  // Send welcome email in background
  await emailQueue.sendWelcomeEmailAsync(user);

  // Generate tokens
  const accessToken = generateToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  // Save refresh token to user
  user.refresh = {
    token: refreshToken,
    expiresAt: new Date(Date.now() + EMAIL_CONSTANTS.REFRESH_TOKEN_EXPIRY)
  };
  user.lastLogin = new Date(Date.now());
  await user.save();

  logger.info('Email verified successfully', { email: user.email });

  return successResponse(res, {
    accessToken,
    refreshToken,
    user: {
      id: user._id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      emailVerified: user.emailVerified,
      profilePicture: user.profilePicture
    }
  }, 200,  SUCCESS_MESSAGES.USER.EMAIL_VERIFIED);
});

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    // Don't reveal if user exists or not for security
    return successResponse(res, null, 200, "If an account with this email exists, a reset code has been sent");
  }

  // Generate reset code
  const resetCode = generateResetCode();
  user.resetPassword = user.resetPassword || {};
  user.resetPassword.code = resetCode;
  user.resetPassword.expires = new Date(Date.now() + EMAIL_CONSTANTS.PASSWORD_RESET_EXPIRY);
  await user.save();

  // Send reset email in background
  await emailQueue.sendPasswordResetEmailAsync(email, resetCode);

  logger.info('Password reset requested', { email });

  return successResponse(res, null, 200, "If an account with this email exists, a reset code has been sent");
});

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = asyncHandler(async (req, res) => {
  const { code, password } = req.body;

  const user = await User.findOne({ 'resetPassword.code': code }).select('+resetPassword +password');
  if (!user) {
    throw new NotFoundError(ERROR_MESSAGES.NOT_FOUND.USER);
  }

  if (!user.resetPassword.code || user.resetPassword.code !== code) {
    throw new ValidationError('Invalid reset code');
  }

  if (isCodeExpired(user.resetPassword.expires)) {
    throw new ValidationError('Reset code has expired');
  }

  // Update password
  user.password = password;
  user.resetPassword.code = undefined;
  user.resetPassword.expires = undefined;
  await user.save();

  logger.info('Password reset successfully', { email: user.email });

  return successResponse(res, null, 200, SUCCESS_MESSAGES.USER.PASSWORD_RESET);
});

// @desc    Refresh token
// @route   POST /api/auth/refresh
// @access  Public
exports.refreshToken = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;

  if (!refreshToken) {
    throw new ValidationError('Refresh token is required');
  }

  const decoded = verifyRefreshToken(refreshToken);
  const user = await User.findById(decoded.id).select('+refresh.token +refresh.expiresAt');

  if (!user || !user.refresh || user.refresh.token !== refreshToken) {
    throw new AuthenticationError('Invalid refresh token');
  }

  if (isCodeExpired(user.refresh.expiresAt)) {
    throw new AuthenticationError(ERROR_MESSAGES.AUTH.TOKEN_EXPIRED);
  }

  // Generate new tokens
  const newAccessToken = generateToken(user._id);
  const newRefreshToken = generateRefreshToken(user._id);

  // Update refresh token
  user.refresh = {
    token: newRefreshToken,
    expiresAt: new Date(Date.now() + EMAIL_CONSTANTS.REFRESH_TOKEN_EXPIRY)
  };
  await user.save();

  logger.info('Token refreshed successfully', { userId: user._id });

  return successResponse(res, {
    accessToken: newAccessToken,
    refreshToken: newRefreshToken
  }, 200, "Token refreshed successfully");
});

// @desc    Resend (verification or reset)
// @route   POST /api/auth/resend
// @access  Public
exports.resend = asyncHandler(async (req, res) => {
  const { email, type } = req.body;

  if (!email || !type) {
    throw new ValidationError('Email and type are required');
  }

  const result = await performResend(email, type);
  return successResponse(res, result.data, result.statusCode, result.message);
});