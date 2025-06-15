const mongoose = require('mongoose');

const eventAnalyticsSchema = new mongoose.Schema({
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  views: {
    type: Number,
    default: 0
  },
  responses: {
    accepted: {
      type: Number,
      default: 0
    },
    declined: {
      type: Number,
      default: 0
    },
    pending: {
      type: Number,
      default: 0
    }
  },
  engagement: {
    comments: {
      type: Number,
      default: 0
    },
    attachments: {
      type: Number,
      default: 0
    },
    updates: {
      type: Number,
      default: 0
    }
  },
  timeSpent: {
    type: Number,
    default: 0
  },
  uniqueViewers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  lastViewed: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
eventAnalyticsSchema.index({ event: 1, createdAt: 1 });
eventAnalyticsSchema.index({ 'responses.accepted': 1 });

const EventAnalytics = mongoose.model('EventAnalytics', eventAnalyticsSchema);

module.exports = EventAnalytics;