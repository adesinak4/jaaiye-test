const mongoose = require('mongoose');

const recipientSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['email', 'notification'],
    required: true
  }
});

const scheduleSchema = new mongoose.Schema({
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
    required: true
  },
  lastSent: Date,
  nextSend: Date,
  timeZone: {
    type: String,
    default: 'UTC'
  }
});

const reportSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true
  },
  type: {
    type: String,
    enum: ['event', 'participant', 'calendar'],
    required: true
  },
  filters: {
    dateRange: {
      start: Date,
      end: Date
    },
    status: [String],
    eventTypes: [String],
    participants: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }],
    calendars: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Calendar'
    }]
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  schedule: scheduleSchema,
  recipients: [recipientSchema],
  format: {
    type: String,
    enum: ['pdf', 'html', 'csv'],
    default: 'pdf'
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'completed'],
    default: 'active'
  },
  lastGenerated: Date,
  nextGeneration: Date
}, {
  timestamps: true
});

// Indexes
reportSchema.index({ createdBy: 1, type: 1 });
reportSchema.index({ 'schedule.nextSend': 1 });
reportSchema.index({ status: 1, 'schedule.nextSend': 1 });

const Report = mongoose.model('Report', reportSchema);

module.exports = Report;