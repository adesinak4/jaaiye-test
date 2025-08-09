const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

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

exports.generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '30d'
  });
};

exports.generateRefreshToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRE || '90d'
  });
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