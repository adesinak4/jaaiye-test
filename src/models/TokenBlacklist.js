const mongoose = require('mongoose');

const blacklistSchema = new mongoose.Schema({
  token: { type: String, required: true, index: true },
  expiresAt: { type: Date, expires: 0 } // Auto-delete when expiresAt passes
});

module.exports = mongoose.model('TokenBlacklist', blacklistSchema);