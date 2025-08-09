const mongoose = require('mongoose');

const externalMappingSchema = new mongoose.Schema({
  google: {
    calendarId: { type: String },
    eventId: { type: String },
    etag: { type: String }
  }
}, { _id: false });

const eventSchema = new mongoose.Schema({
  calendar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Calendar',
    required: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  startTime: {
    type: Date,
    required: true
  },
  endTime: {
    type: Date,
    required: true
  },
  isAllDay: {
    type: Boolean,
    default: false
  },
  location: {
    type: String,
    trim: true
  },
  category: {
    type: String,
    enum: ['hangout', 'meeting', 'appointment', 'task', 'reminder', 'other'],
    default: 'other'
  },
  privacy: {
    type: String,
    enum: ['private', 'friends', 'public'],
    default: 'private'
  },
  status: {
    type: String,
    enum: ['scheduled', 'cancelled', 'completed'],
    default: 'scheduled'
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
  external: { type: externalMappingSchema, default: undefined },
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
eventSchema.index({ calendar: 1, startTime: 1 });
eventSchema.index({ calendar: 1, endTime: 1 });
eventSchema.index({ status: 1 });

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;