const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const providerProfileSchema = new mongoose.Schema({
  email: { type: String, trim: true, lowercase: true },
  name: { type: String, trim: true },
  picture: { type: String, trim: true },
  lastSignInAt: { type: Date }
}, { _id: false });

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

  // Provider linkage flags and profiles
  providerLinks: {
    google: { type: Boolean, default: false },
    apple: { type: Boolean, default: false }
  },
  providerProfiles: {
    google: { type: providerProfileSchema, default: undefined },
    apple: { type: providerProfileSchema, default: undefined }
  },

  // Google Calendar linkage (MVP)
  googleCalendar: {
    refreshToken: { type: String, select: false },
    accessToken: { type: String, select: false },
    expiryDate: { type: Date },
    scope: { type: String },
    jaaiyeCalendarId: { type: String },
    selectedCalendarIds: { type: [String], default: undefined },
    syncToken: { type: String, select: false },
    calendarMappings: [{
      googleCalendarId: { type: String, required: true },
      jaaiyeCalendarId: { type: mongoose.Schema.Types.ObjectId, ref: 'Calendar' },
      createdAt: { type: Date, default: Date.now }
    }],
    calendars: [{
      id: { type: String },
      syncToken: { type: String, select: false },
      channelId: { type: String, select: false },
      resourceId: { type: String, select: false },
      expiration: { type: Date }
    }]
  },

  ics: {
    token: { type: String, select: false }
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
  verification: {
    code: {
      type: String,
      select: false,
    },
    expires: {
      type: Date,
      select: false,
    },
  },
  resetPassword: {
    code: {
      type: String,
      select: false,
    },
    expires: {
      type: Date,
      select: false,
    },
  },
  lastLogin: {
    type: Date,
  },

  // Account Status
  deleted: {
    status: {
      type: Boolean,
      default: false
    },
    date: {
      type: Date,
      default: null
    },
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
    enum: ['superadmin', 'admin', 'user'],
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
  }],

  // Friends System
  friends: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    friendshipId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Friendship',
      required: true
    },
    addedAt: {
      type: Date,
      default: Date.now
    }
  }],
  friendSettings: {
    allowFriendRequests: {
      type: Boolean,
      default: true
    },
    allowRequestsFrom: {
      type: String,
      enum: ['everyone', 'friends_of_friends', 'nobody'],
      default: 'everyone'
    },
    showInSearch: {
      type: Boolean,
      default: true
    }
  }
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

// Role helpers
userSchema.methods.isSuperadmin = function () {
  return this.role === 'superadmin';
};

userSchema.methods.isAdmin = function () {
  return this.role === 'admin' || this.role === 'superadmin';
};

// Query helper for non-deleted users
userSchema.query.notDeleted = function () {
  return this.where({ deletedAt: null });
};

// Query helper for active users
userSchema.query.active = function () {
  return this.where({ isActive: true });
};

// Friend management methods
userSchema.methods.addFriend = function(friendId, friendshipId) {
  // Check if friend already exists
  const existingFriend = this.friends.find(friend =>
    friend.user.toString() === friendId.toString()
  );

  if (existingFriend) {
    throw new Error('User is already a friend');
  }

  this.friends.push({
    user: friendId,
    friendshipId: friendshipId
  });

  return this.save();
};

userSchema.methods.removeFriend = function(friendId) {
  this.friends = this.friends.filter(friend =>
    friend.user.toString() !== friendId.toString()
  );

  return this.save();
};

userSchema.methods.isFriend = function(userId) {
  return this.friends.some(friend =>
    friend.user.toString() === userId.toString()
  );
};

userSchema.methods.getFriendIds = function() {
  return this.friends.map(friend => friend.user.toString());
};

// Static method to search users for friend requests
userSchema.statics.searchForFriends = function(searchTerm, requestingUserId, limit = 20) {
  const searchRegex = new RegExp(searchTerm, 'i');

  return this.find({
    $and: [
      { _id: { $ne: requestingUserId } }, // Exclude self
      { isActive: true },
      { 'deleted.status': { $ne: true } },
      { 'friendSettings.showInSearch': true },
      {
        $or: [
          { username: searchRegex },
          { fullName: searchRegex },
          { email: searchRegex }
        ]
      }
    ]
  })
  .select('username fullName profilePicture email friendSettings')
  .limit(limit);
};

// Indexes
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ appleId: 1 });
userSchema.index({ username: 1 });
userSchema.index({ deletedAt: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ deactivatedAt: 1 });
userSchema.index({ 'friends.user': 1 });
userSchema.index({ 'friendSettings.allowFriendRequests': 1 });
userSchema.index({ 'friendSettings.showInSearch': 1 });
userSchema.index({ role: 1 });

const User = mongoose.model('User', userSchema);

module.exports = User;