const mongoose = require('mongoose');
const crypto = require('crypto');

const apiKeySchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: () => crypto.randomBytes(32).toString('hex')
  },
  name: {
    type: String,
    required: true,
    default: 'Mobile API Key',
    trim: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  expiresAt: {
    type: Date,
    required: true,
    default: () => new Date(Date.now() + 365 * 24 * 60 * 60 * 1000) // 1 year from now
  },
  lastUsed: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Single index definition for key
apiKeySchema.index({ key: 1 }, { unique: true });

// Compound index for active and expiration
apiKeySchema.index({ isActive: 1, expiresAt: 1 });

const ApiKey = mongoose.model('ApiKey', apiKeySchema);

module.exports = ApiKey;