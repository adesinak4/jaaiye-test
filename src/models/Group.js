const mongoose = require('mongoose');

const groupMemberSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['admin', 'member'],
    default: 'member'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  },
  addedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, { _id: false });

const groupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Group name is required'],
    trim: true,
    maxlength: [100, 'Group name cannot exceed 100 characters']
  },
  description: {
    type: String,
    trim: true,
    maxlength: [500, 'Description cannot exceed 500 characters']
  },
  creator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  members: [groupMemberSchema],
  events: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event'
  }],
  settings: {
    allowMemberInvites: {
      type: Boolean,
      default: true
    },
    allowMemberEventCreation: {
      type: Boolean,
      default: true
    },
    defaultEventParticipation: {
      type: String,
      enum: ['auto_add', 'invite_only'],
      default: 'invite_only'
    }
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
groupSchema.index({ creator: 1, isActive: 1 });
groupSchema.index({ 'members.user': 1, isActive: 1 });
groupSchema.index({ name: 'text', description: 'text' });

// Virtual for member count
groupSchema.virtual('memberCount').get(function() {
  return this.members.length;
});

// Virtual for event count
groupSchema.virtual('eventCount').get(function() {
  return this.events.length;
});

// Pre-save middleware to ensure creator is always an admin member
groupSchema.pre('save', function(next) {
  if (this.isNew) {
    // Add creator as admin member
    this.members.push({
      user: this.creator,
      role: 'admin',
      joinedAt: new Date(),
      addedBy: this.creator
    });
  }
  next();
});

// Instance method to add a member
groupSchema.methods.addMember = function(userId, addedByUserId, role = 'member') {
  // Check if user is already a member
  const existingMember = this.members.find(member =>
    member.user.toString() === userId.toString()
  );

  if (existingMember) {
    throw new Error('User is already a member of this group');
  }

  this.members.push({
    user: userId,
    role,
    joinedAt: new Date(),
    addedBy: addedByUserId
  });

  return this.save();
};

// Instance method to remove a member
groupSchema.methods.removeMember = function(userId) {
  const memberIndex = this.members.findIndex(member =>
    member.user.toString() === userId.toString()
  );

  if (memberIndex === -1) {
    throw new Error('User is not a member of this group');
  }

  // Prevent removing the creator
  if (this.members[memberIndex].user.toString() === this.creator.toString()) {
    throw new Error('Cannot remove the group creator');
  }

  this.members.splice(memberIndex, 1);
  return this.save();
};

// Instance method to update member role
groupSchema.methods.updateMemberRole = function(userId, newRole) {
  const member = this.members.find(member =>
    member.user.toString() === userId.toString()
  );

  if (!member) {
    throw new Error('User is not a member of this group');
  }

  // Prevent changing creator's role
  if (member.user.toString() === this.creator.toString()) {
    throw new Error('Cannot change the group creator\'s role');
  }

  member.role = newRole;
  return this.save();
};

// Instance method to check if user is a member
groupSchema.methods.isMember = function(userId) {
  return this.members.some(member =>
    member.user.toString() === userId.toString()
  );
};

// Instance method to check if user is an admin
groupSchema.methods.isAdmin = function(userId) {
  const member = this.members.find(member =>
    member.user.toString() === userId.toString()
  );
  return member && member.role === 'admin';
};

// Instance method to check if user can add members
groupSchema.methods.canAddMembers = function(userId) {
  return this.settings.allowMemberInvites && this.isMember(userId);
};

// Instance method to check if user can create events
groupSchema.methods.canCreateEvents = function(userId) {
  return this.settings.allowMemberEventCreation && this.isMember(userId);
};

// Instance method to add an event
groupSchema.methods.addEvent = function(eventId) {
  if (!this.events.includes(eventId)) {
    this.events.push(eventId);
    return this.save();
  }
  return Promise.resolve(this);
};

// Instance method to remove an event
groupSchema.methods.removeEvent = function(eventId) {
  this.events = this.events.filter(id => id.toString() !== eventId.toString());
  return this.save();
};

// Static method to get groups for a user
groupSchema.statics.getUserGroups = function(userId, includeInactive = false) {
  const query = {
    'members.user': userId
  };

  if (!includeInactive) {
    query.isActive = true;
  }

  return this.find(query)
    .populate('creator', 'username fullName profilePicture')
    .populate('members.user', 'username fullName profilePicture')
    .populate('events', 'title startTime endTime location')
    .sort({ updatedAt: -1 });
};

// Static method to search groups
groupSchema.statics.searchGroups = function(searchTerm, userId, limit = 20) {
  const searchRegex = new RegExp(searchTerm, 'i');

  return this.find({
    $and: [
      { isActive: true },
      { 'members.user': userId }, // User must be a member to search
      {
        $or: [
          { name: searchRegex },
          { description: searchRegex }
        ]
      }
    ]
  })
  .populate('creator', 'username fullName profilePicture')
  .populate('members.user', 'username fullName profilePicture')
  .limit(limit)
  .sort({ updatedAt: -1 });
};

// Static method to create group from event participants
groupSchema.statics.createFromEvent = async function(eventId, groupName, creatorId) {
  const Event = require('./Event');
  const event = await Event.findById(eventId).populate('participants.user');

  if (!event) {
    throw new Error('Event not found');
  }

  // Create the group
  const group = new this({
    name: groupName,
    description: `Group created from event: ${event.title}`,
    creator: creatorId
  });

  await group.save();

  // Add all event participants as group members
  const participantPromises = event.participants.map(participant =>
    group.addMember(participant.user._id, creatorId, 'member')
  );

  await Promise.all(participantPromises);

  // Add the event to the group
  await group.addEvent(eventId);

  return group;
};

const Group = mongoose.model('Group', groupSchema);

module.exports = Group;
