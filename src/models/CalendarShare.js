const mongoose = require('mongoose');

const calendarShareSchema = new mongoose.Schema({
  calendar: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Calendar',
    required: true
  },
  sharedWith: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  permission: {
    type: String,
    enum: ['view', 'edit', 'manage'],
    default: 'view'
  },
  status: {
    type: String,
    enum: ['pending', 'accepted', 'declined'],
    default: 'pending'
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
  timestamps: true
});

// Indexes
calendarShareSchema.index({ calendar: 1, sharedWith: 1 }, { unique: true });
calendarShareSchema.index({ sharedWith: 1, permission: 1 });

const CalendarShare = mongoose.model('CalendarShare', calendarShareSchema);

module.exports = CalendarShare;