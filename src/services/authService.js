const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');
const TokenBlacklist = require('../models/TokenBlacklist');

let googleClient;
function getGoogleClient() {
  if (!googleClient) {
    const clientId = process.env.GOOGLE_CLIENT_ID || undefined; // optional for server flows
    googleClient = new OAuth2Client(clientId);
  }
  return googleClient;
}

function getAllowedGoogleAudiences() {
  const list = process.env.GOOGLE_ALLOWED_AUDS || '';
  return list
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

exports.verifyGoogleIdToken = async function verifyGoogleIdToken(idToken) {
  const client = getGoogleClient();
  const audiences = getAllowedGoogleAudiences();
  const ticket = await client.verifyIdToken({ idToken, audience: audiences.length ? audiences : undefined });
  const payload = ticket.getPayload();
  return payload; // contains sub, email, email_verified, name, picture, etc.
};

exports.generateToken = (subject) => {
  const isObject = subject && typeof subject === 'object' && subject._id;
  const payload = isObject
    ? {
        id: subject._id,
        email: subject.email,
        username: subject.username,
        fullName: subject.fullName,
        role: subject.role,
        emailVerified: subject.emailVerified,
        profilePicture: subject.profilePicture
      }
    : { id: subject };
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d'
  });
};

exports.generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '90d'
  });
};

exports.verifyRefreshToken = (token) => {
  if (!token) {
    throw new Error('Refresh token is required');
  }
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    return decoded; // { id, iat, exp }
  } catch (err) {
    const error = new Error('Invalid refresh token');
    error.cause = err;
    throw error;
  }
};

exports.generateVerificationCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

exports.generateResetCode = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

exports.isCodeExpired = (expiresAt) => {
  return !expiresAt || new Date(expiresAt) < new Date();
};

exports.generateRandomPassword = (length = 32) => {
  return crypto.randomBytes(length).toString('hex');
};

// Blacklist helpers
exports.addToBlacklist = async (token, expiresAt) => {
  if (!token) return;
  const expDate = expiresAt ? new Date(expiresAt) : new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
  try {
    await TokenBlacklist.create({ token, expiresAt: expDate });
  } catch (e) {
    // ignore duplicate key errors
  }
};

exports.isBlacklisted = async (token) => {
  if (!token) return false;
  const found = await TokenBlacklist.findOne({ token });
  return !!found;
};

/**
 * Generate device fingerprint for rate limiting
 * Creates a unique identifier based on device characteristics (without IP)
 */
exports.generateDeviceFingerprint = (req) => {
  const userAgent = req.get('user-agent') || '';
  const acceptLanguage = req.get('accept-language') || '';
  const acceptEncoding = req.get('accept-encoding') || '';

  // Create a hash of the device characteristics (excluding IP for portability)
  const data = `${userAgent}-${acceptLanguage}-${acceptEncoding}`;
  const hash = crypto.createHash('sha256').update(data).digest('hex');

  return hash;
};

/**
 * Generate rate limit key combining IP and device fingerprint
 * This provides more granular rate limiting than just IP-based
 */
exports.rateLimitKey = (req) => {
  const ip = req.ip || req.connection.remoteAddress;
  const deviceFingerprint = exports.generateDeviceFingerprint(req);

  // Combine IP and device fingerprint for unique identification
  // This ensures rate limiting is both IP-aware and device-aware
  return `${ip}-${deviceFingerprint}`;
};