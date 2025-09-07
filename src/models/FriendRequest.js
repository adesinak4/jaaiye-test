const mongoose = require('mongoose');

const friendRequestSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Requester is required'],
    index: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Recipient is required'],
    index: true
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'cancelled'],
    default: 'pending',
    index: true
  },
  message: {
    type: String,
    trim: true,
    maxlength: [200, 'Message cannot exceed 200 characters']
  },
  expiresAt: {
    type: Date,
    default: function() {
      // Auto-expire after 7 days
      return new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    },
    index: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound index to prevent duplicate requests
friendRequestSchema.index({ requester: 1, recipient: 1 }, { unique: true });

// Index for efficient querying of requests by recipient and status
friendRequestSchema.index({ recipient: 1, status: 1, createdAt: -1 });

// Index for cleanup of expired requests
friendRequestSchema.index({ status: 1, expiresAt: 1 });

// Virtual for checking if request is expired
friendRequestSchema.virtual('isExpired').get(function() {
  return this.expiresAt < new Date();
});

// Pre-save middleware to validate request
friendRequestSchema.pre('save', async function(next) {
  // Prevent self-requests
  if (this.requester.toString() === this.recipient.toString()) {
    const error = new Error('Cannot send friend request to yourself');
    error.statusCode = 400;
    return next(error);
  }

  // Check if users exist and are active
  const User = mongoose.model('User');
  const [requester, recipient] = await Promise.all([
    User.findById(this.requester).select('isActive deleted'),
    User.findById(this.recipient).select('isActive deleted')
  ]);

  if (!requester || !recipient) {
    const error = new Error('One or both users not found');
    error.statusCode = 404;
    return next(error);
  }

  if (!requester.isActive || requester.deleted?.status) {
    const error = new Error('Requester account is inactive or deleted');
    error.statusCode = 400;
    return next(error);
  }

  if (!recipient.isActive || recipient.deleted?.status) {
    const error = new Error('Recipient account is inactive or deleted');
    error.statusCode = 400;
    return next(error);
  }

  next();
});

// Instance method to accept the request
friendRequestSchema.methods.accept = async function() {
  if (this.status !== 'pending') {
    throw new Error('Only pending requests can be accepted');
  }

  if (this.isExpired) {
    throw new Error('Request has expired');
  }

  this.status = 'accepted';
  return this.save();
};

// Instance method to decline the request
friendRequestSchema.methods.decline = async function() {
  if (this.status !== 'pending') {
    throw new Error('Only pending requests can be declined');
  }

  this.status = 'declined';
  return this.save();
};

// Instance method to cancel the request
friendRequestSchema.methods.cancel = async function() {
  if (this.status !== 'pending') {
    throw new Error('Only pending requests can be cancelled');
  }

  this.status = 'cancelled';
  return this.save();
};

// Static method to get pending requests for a user
friendRequestSchema.statics.getPendingRequests = function(userId, type = 'received') {
  const query = { status: 'pending' };

  if (type === 'received') {
    query.recipient = userId;
  } else if (type === 'sent') {
    query.requester = userId;
  } else {
    query.$or = [
      { requester: userId },
      { recipient: userId }
    ];
  }

  return this.find(query)
    .populate('requester', 'username fullName profilePicture email')
    .populate('recipient', 'username fullName profilePicture email')
    .sort({ createdAt: -1 });
};

// Static method to check if request exists between two users
friendRequestSchema.statics.requestExists = function(requesterId, recipientId) {
  return this.findOne({
    $or: [
      { requester: requesterId, recipient: recipientId },
      { requester: recipientId, recipient: requesterId }
    ],
    status: { $in: ['pending', 'accepted'] }
  });
};

// Static method to cleanup expired requests
friendRequestSchema.statics.cleanupExpired = function() {
  return this.updateMany(
    {
      status: 'pending',
      expiresAt: { $lt: new Date() }
    },
    { status: 'cancelled' }
  );
};

const FriendRequest = mongoose.model('FriendRequest', friendRequestSchema);

module.exports = FriendRequest;
