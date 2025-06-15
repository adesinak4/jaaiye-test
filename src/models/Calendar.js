const mongoose = require('mongoose');

const calendarSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: true,
    default: 'My Calendar'
  },
  color: {
    type: String,
    default: '#4285F4' // Google Calendar blue
  },
  isDefault: {
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
  timestamps: true
});

// Index for faster queries
calendarSchema.index({ user: 1 });
calendarSchema.index({ isDefault: 1 });

const Calendar = mongoose.model('Calendar', calendarSchema);

module.exports = Calendar;