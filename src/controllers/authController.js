const User = require('../models/User');
const {
  generateToken,
  generateRefreshToken,
  generateVerificationCode,
  generateResetCode,
  isCodeExpired,
  verifyRefreshToken
} = require('../services/authService');
const emailService = require('../services/emailService');
const logger = require('../utils/logger');

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
exports.register = async (req, res, next) => {
  try {
    const { email, password, username, fullName } = req.body;

    // Check if user exists
    const userExists = await User.findOne({ email });
    if (userExists) {
      logger.error('User already exists', new Error('User already exists'), 400, { email });
      return res.status(400).json({
        success: false,
        error: 'User already exists with this email'
      });
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
    user.verificationCode = verificationCode;
    user.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    // Send verification email
    await emailService.sendVerificationEmail(email, verificationCode);

    res.status(201).json({
      success: true,
      message: "Account created. Verification code sent to email.",
      data: {
        email,
        expiresIn: "10 minutes"
      }
    });
  } catch (error) {
    logger.error('Registration failed', error, 500, { email: req.body.email });
    next(error); // Let the error handler middleware handle it
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res, next) => {
  try {
    const { email, password } = req.body;

    // Check if user exists
    const user = await User.findOne({ email }).select('+password');
    if (!user) {
      logger.error('Invalid credentials', new Error('User not found'), 401, { email });
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check if password matches
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      logger.error('Invalid credentials', new Error('Invalid password'), 401, { email });
      return res.status(401).json({
        success: false,
        error: 'Invalid credentials'
      });
    }

    // Check if email is verified
    if (!user.emailVerified) {
      // Generate new verification code
      const verificationCode = generateVerificationCode();
      user.verificationCode = verificationCode;
      user.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
      await user.save();

      // Send new verification email
      await emailService.sendVerificationEmail(email, verificationCode);

      logger.error('Email not verified', new Error('Email not verified'), 403, { email });
      return res.status(403).json({
        success: false,
        error: 'Email not verified',
        message: 'A new verification code has been sent to your email'
      });
    }

    // Update last login
    user.lastLogin = new Date();

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    user.refresh = {
      token: refreshToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    };
    await user.save();

    res.json({
      success: true,
      token,
      refreshToken
    });
  } catch (error) {
    logger.error('Login failed', error, 500, { email: req.body.email });
    next(error); // Let the error handler middleware handle it
  }
};

// @desc    Refresh token
// @route   POST /api/auth/refresh-token
// @access  Public
exports.refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(401).json({
        success: false,
        error: 'Refresh token is required'
      });
    }

    // Verify refresh token
    const decoded = await verifyRefreshToken(refreshToken);

    // Get user
    const user = await User.findById(decoded.id);
    if (!user) {
      return res.status(401).json({
        success: false,
        error: 'Invalid refresh token'
      });
    }

    // Generate new tokens
    const token = generateToken(user._id);

    res.json({
      success: true,
      token
    });
  } catch (error) {
    logger.error('Invalid refresh token', error);
    next(error);
  }
};

// @desc    Verify email
// @route   POST /api/auth/verify-email
// @access  Public
exports.verifyEmail = async (req, res, next) => {
  try {
    const { code } = req.body;

    if (!code) {
      logger.error('Missing verification code', new Error('Code is required'), 400);
      return res.status(400).json({
        success: false,
        error: 'Verification code is required'
      });
    }

    // Find user by verification code
    const user = await User.findOne({
      verificationCode: code,
      verificationCodeExpires: { $gt: new Date() }
    });

    if (!user) {
      logger.error('Invalid verification code', new Error('Code not found or expired'), 400, { code });
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired verification code'
      });
    }

    // Update user
    user.emailVerified = true;
    user.verificationCode = undefined;
    user.verificationCodeExpires = undefined;

    // Generate tokens
    const token = generateToken(user._id);
    const refreshToken = generateRefreshToken(user._id);
    user.refresh = {
      token: refreshToken,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
    };
    await user.save();
    await emailService.sendWelcomeEmail(user.email);

    res.json({
      success: true,
      token,
      refreshToken
    });
  } catch (error) {
    logger.error('Email verification failed', error, 500, { code: req.body.code });
    next(error); // Let the error handler middleware handle it
  }
};

// @desc    Resend verification code
// @route   POST /api/auth/resend-verification
// @access  Public
exports.resendVerification = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Check if previous code is still valid
    if (user.verificationCode && !isCodeExpired(user.verificationCodeExpires)) {
      return res.status(400).json({
        success: false,
        error: 'Previous verification code is still valid'
      });
    }

    // Generate new verification code
    const verificationCode = generateVerificationCode();
    user.verificationCode = verificationCode;
    user.verificationCodeExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    // Send verification email
    await emailService.sendVerificationEmail(email, verificationCode);

    res.json({
      success: true,
      message: 'Verification code sent successfully'
    });
  } catch (error) {
    logger.error(error);
    next(error);
  }
};

// @desc    Forgot password
// @route   POST /api/auth/forgot-password
// @access  Public
exports.forgotPassword = async (req, res, next) => {
  try {
    const { email } = req.body;

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({
        success: false,
        error: 'User not found'
      });
    }

    // Generate reset code
    const resetCode = generateResetCode();
    user.resetPasswordCode = resetCode;
    user.resetPasswordExpires = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
    await user.save();

    // Send reset code email
    await emailService.sendPasswordResetEmail(email, resetCode);

    res.json({
      success: true,
      message: 'Password reset code sent to email'
    });
  } catch (error) {
    logger.error(error);
    next(error);
  }
};

// @desc    Reset password
// @route   POST /api/auth/reset-password
// @access  Public
exports.resetPassword = async (req, res, next) => {
  try {
    const { code, password } = req.body;

    const user = await User.findOne({
      resetPasswordCode: code,
      resetPasswordExpires: { $gt: Date.now() }
    });

    if (!user) {
      logger.error('Invalid reset code', new Error('Code not found or expired'), 400, { code });
      return res.status(400).json({
        success: false,
        error: 'Invalid or expired reset code'
      });
    }

    user.password = password;
    user.resetPasswordCode = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    res.json({
      success: true,
      message: 'Password reset successful'
    });
  } catch (error) {
    logger.error('Password reset failed', error, 500, { code: req.body.code });
    next(error); // Let the error handler middleware handle it
  }
};

// @desc    Google OAuth callback
// @route   GET /api/auth/google/callback
// @access  Public
exports.googleCallback = (req, res, next) => {
  const token = generateToken(req.user._id);
  const refreshToken = generateRefreshToken(req.user._id);

  // Redirect to frontend with tokens
  res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}&refreshToken=${refreshToken}`);
};

// @desc    Apple OAuth callback
// @route   GET /api/auth/apple/callback
// @access  Public
exports.appleCallback = (req, res, next) => {
  const token = generateToken(req.user._id);
  const refreshToken = generateRefreshToken(req.user._id);

  // Redirect to frontend with tokens
  res.redirect(`${process.env.FRONTEND_URL}/auth/callback?token=${token}&refreshToken=${refreshToken}`);
};