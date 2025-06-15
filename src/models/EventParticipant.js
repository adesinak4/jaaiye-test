const mongoose = require('mongoose');

const eventParticipantSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  role: {
    type: String,
    enum: ['organizer', 'attendee'],
    default: 'attendee'
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined', 'tentative'],
    default: 'pending'
  },
  responseTime: {
    type: Date
  },
  reminders: [{
    time: {
      type: Number, // minutes before event
      required: true
    },
    type: {
      type: String,
      enum: ['push', 'email'],
      default: 'push'
    },
    sent: {
      type: Boolean,
      default: false
    }
  }],
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for faster queries
eventParticipantSchema.index({ event: 1, user: 1 }, { unique: true });
eventParticipantSchema.index({ user: 1, status: 1 });

const EventParticipant = mongoose.model('EventParticipant', eventParticipantSchema);

module.exports = EventParticipant;