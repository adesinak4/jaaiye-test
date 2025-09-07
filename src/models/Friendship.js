const mongoose = require('mongoose');

const friendshipSchema = new mongoose.Schema({
  user1: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User1 is required'],
    index: true
  },
  user2: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'User2 is required'],
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'blocked'],
    default: 'active',
    index: true
  },
  // Track who initiated the friendship (for analytics/audit)
  initiatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Compound unique index to prevent duplicate friendships
// user1 and user2 are ordered by ObjectId to ensure consistency
friendshipSchema.index({ user1: 1, user2: 1 }, { unique: true });

// Index for efficient querying by user
friendshipSchema.index({ user1: 1, status: 1 });
friendshipSchema.index({ user2: 1, status: 1 });

// Pre-save middleware to ensure user1 < user2 (for consistency)
friendshipSchema.pre('save', async function(next) {
  // Ensure user1 is always the user with the smaller ObjectId
  if (this.user1.toString() > this.user2.toString()) {
    [this.user1, this.user2] = [this.user2, this.user1];
  }

  // Validate that both users exist and are active
  const User = mongoose.model('User');
  const [user1Doc, user2Doc] = await Promise.all([
    User.findById(this.user1).select('isActive deleted'),
    User.findById(this.user2).select('isActive deleted')
  ]);

  if (!user1Doc || !user2Doc) {
    const error = new Error('One or both users not found');
    error.statusCode = 404;
    return next(error);
  }

  if (!user1Doc.isActive || user1Doc.deleted?.status) {
    const error = new Error('User1 account is inactive or deleted');
    error.statusCode = 400;
    return next(error);
  }

  if (!user2Doc.isActive || user2Doc.deleted?.status) {
    const error = new Error('User2 account is inactive or deleted');
    error.statusCode = 400;
    return next(error);
  }

  next();
});

// Instance method to block the friendship
friendshipSchema.methods.block = function(blockedBy) {
  this.status = 'blocked';
  this.blockedBy = blockedBy;
  this.blockedAt = new Date();
  return this.save();
};

// Instance method to unblock the friendship
friendshipSchema.methods.unblock = function() {
  this.status = 'active';
  this.blockedBy = undefined;
  this.blockedAt = undefined;
  return this.save();
};

// Static method to create friendship between two users
friendshipSchema.statics.createFriendship = async function(user1Id, user2Id, initiatedBy) {
  // Ensure consistent ordering
  const [user1, user2] = user1Id.toString() < user2Id.toString()
    ? [user1Id, user2Id]
    : [user2Id, user1Id];

  // Check if friendship already exists
  const existingFriendship = await this.findOne({ user1, user2 });
  if (existingFriendship) {
    throw new Error('Friendship already exists');
  }

  // Create the friendship
  const friendship = new this({
    user1,
    user2,
    initiatedBy
  });

  return friendship.save();
};

// Static method to find friendship between two users
friendshipSchema.statics.findFriendship = function(user1Id, user2Id) {
  const [user1, user2] = user1Id.toString() < user2Id.toString()
    ? [user1Id, user2Id]
    : [user2Id, user1Id];

  return this.findOne({ user1, user2 });
};

// Static method to get all friends for a user
friendshipSchema.statics.getFriends = function(userId, status = 'active') {
  return this.find({
    $or: [
      { user1: userId, status },
      { user2: userId, status }
    ]
  })
  .populate('user1', 'username fullName profilePicture email')
  .populate('user2', 'username fullName profilePicture email')
  .sort({ createdAt: -1 });
};

// Static method to check if two users are friends
friendshipSchema.statics.areFriends = function(user1Id, user2Id) {
  return this.findFriendship(user1Id, user2Id)
    .then(friendship => friendship && friendship.status === 'active');
};

// Static method to remove friendship
friendshipSchema.statics.removeFriendship = function(user1Id, user2Id) {
  return this.findFriendship(user1Id, user2Id)
    .then(friendship => {
      if (!friendship) {
        throw new Error('Friendship not found');
      }
      return friendship.deleteOne();
    });
};

// Static method to get mutual friends between two users
friendshipSchema.statics.getMutualFriends = async function(user1Id, user2Id) {
  // Get friends of user1
  const user1Friends = await this.getFriends(user1Id);
  const user1FriendIds = user1Friends.map(friendship =>
    friendship.user1.toString() === user1Id.toString()
      ? friendship.user2.toString()
      : friendship.user1.toString()
  );

  // Get friends of user2
  const user2Friends = await this.getFriends(user2Id);
  const user2FriendIds = user2Friends.map(friendship =>
    friendship.user1.toString() === user2Id.toString()
      ? friendship.user2.toString()
      : friendship.user1.toString()
  );

  // Find intersection
  const mutualFriendIds = user1FriendIds.filter(id => user2FriendIds.includes(id));

  // Get user details for mutual friends
  const User = mongoose.model('User');
  return User.find({
    _id: { $in: mutualFriendIds },
    isActive: true,
    'deleted.status': { $ne: true }
  }).select('username fullName profilePicture email');
};

// Virtual to get the other user in the friendship
friendshipSchema.virtual('otherUser').get(function() {
  // This would need to be populated with the actual user data
  // The logic would depend on which user is requesting the data
  return null;
});

const Friendship = mongoose.model('Friendship', friendshipSchema);

module.exports = Friendship;
