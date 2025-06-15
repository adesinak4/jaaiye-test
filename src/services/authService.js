const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const TokenBlacklist = require('../models/TokenBlacklist');

class AuthService {
  // Generate JWT Token
  generateToken(id) {
    return jwt.sign({ id }, process.env.JWT_SECRET, {
      expiresIn: process.env.JWT_EXPIRES_IN,
    });
  }

  // Generate Refresh Token
  generateRefreshToken(id) {
    return jwt.sign({ id }, process.env.JWT_REFRESH_SECRET, {
      expiresIn: process.env.JWT_REFRESH_EXPIRES_IN,
    });
  }

  // Generate verification code (6 digits)
  generateVerificationCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Generate password reset code
  generateResetCode() {
    return Math.floor(100000 + Math.random() * 900000).toString();
  }

  // Generate API Key
  generateApiKey() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Format user object for response (removes sensitive data)
  formatUserResponse(user) {
    return {
      id: user._id,
      email: user.email,
      username: user.username,
      fullName: user.fullName,
      emailVerified: user.emailVerified,
      profilePicture: user.profilePicture,
      createdAt: user.createdAt
    };
  }

  // Check if code is expired
  isCodeExpired(expiryDate) {
    return new Date(expiryDate) < new Date();
  }

  // Generate device fingerprint
  generateDeviceFingerprint(req) {
    const userAgent = req.headers['user-agent'];
    const ip = req.ip;
    return crypto.createHash('sha256').update(userAgent + ip).digest('hex');
  }

  async addToBlacklist(token, expiresAt) {
    await TokenBlacklist.create({ token, expiresAt });
  };

  // Verify refresh token
  async verifyRefreshToken(refreshToken) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) {
        throw new Error('Invalid refresh token');
      }
      return user;
    } catch(error) {
      throw new Error('Invalid refresh token');
    }
  }

  // Handle social authentication
  async handleSocialAuth(profile, provider) {
    const email = profile.email;
    let user = await User.findOne({ email });

    if (!user) {
      // Create new user
      user = await User.create({
        email,
        emailVerified: true,
        fullName: profile.name,
        [provider + 'Id']: profile.id,
        apiKey: this.generateApiKey()
      });
    } else {
      // Update existing user
      user[provider + 'Id'] = profile.id;
      await user.save();
    }

    return user;
  }
}

module.exports = new AuthService();