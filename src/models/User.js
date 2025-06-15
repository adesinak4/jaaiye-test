const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  // Basic Information
  email: {
    type: String,
    required: [true, 'Please add an email'],
    unique: true,
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please add a valid email'
    ],
    trim: true,
    lowercase: true,
  },
  username: {
    type: String,
    unique: true,
    sparse: true,
    trim: true,
  },
  fullName: {
    type: String,
    trim: true,
  },

  // Authentication Methods
  password: {
    type: String,
    required: [true, 'Please add a password'],
    minlength: 6,
    select: false, // Password won't be returned in queries by default
  },
  refresh: {
    token: {
      type: String,
      select: false // Hidden by default
    },
    expiresAt: {
      type: Date,
      select: false
    }
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true,
  },
  appleId: {
    type: String,
    unique: true,
    sparse: true,
  },

  // Profile Information
  profilePicture: {
    emoji: {
      type: String,
      default: '👤'
    },
    color: {
      type: String,
      default: '#000000'
    }
  },

  // Security
  emailVerified: {
    type: Boolean,
    default: false,
  },
  verificationCode: {
    type: String,
    select: false,
  },
  verificationCodeExpires: {
    type: Date,
    select: false,
  },
  resetPasswordCode: {
    type: String,
    select: false,
  },
  resetPasswordExpires: {
    type: Date,
    select: false,
  },
  lastLogin: {
    type: Date,
  },

  // Account Status
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  },
  isBlocked: {
    type: Boolean,
    default: false,
  },
  role: {
    type: String,
    enum: ['user', 'admin'],
    default: 'user',
  },

  // Preferences
  preferences: {
    notifications: {
      push: {
        type: Boolean,
        default: true
      },
      email: {
        type: Boolean,
        default: true
      },
      inApp: {
        type: Boolean,
        default: true
      }
    }
  },

  // Metadata
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },

  // New fields
  refreshToken: {
    type: String
  },

  // Device Tokens for Push Notifications
  deviceTokens: [{
    token: String,
    platform: {
      type: String,
      enum: ['ios', 'android', 'web']
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }]
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// Hash password before saving
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Method to compare password
userSchema.methods.comparePassword = async function (candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

// Soft delete
userSchema.methods.softDelete = function () {
  this.isDeleted = true;
  this.deletedAt = new Date();
  this.isActive = false;
  return this.save();
};

// Restore account
userSchema.methods.restore = function () {
  this.isDeleted = false;
  this.deletedAt = null;
  this.isActive = true;
  return this.save();
};

// Query helper for non-deleted users
userSchema.query.notDeleted = function () {
  return this.where({ deletedAt: null });
};

// Query helper for active users
userSchema.query.active = function () {
  return this.where({ isActive: true });
};

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ appleId: 1 });
userSchema.index({ username: 1 });
userSchema.index({ deletedAt: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ deactivatedAt: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;