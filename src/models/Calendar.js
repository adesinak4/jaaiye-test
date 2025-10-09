const mongoose = require('mongoose');

const calendarSchema = new mongoose.Schema({
  // Deprecated alias maintained for backward compatibility with older data
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // Source of truth for ownership
  owner: {
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
  // Reserved for future sharing (kept minimal while we enforce one-per-user)
  sharedWith: [{
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    role: { type: String, enum: ['viewer', 'editor'], default: 'viewer' },
    addedAt: { type: Date, default: Date.now }
  }],
  // Google mappings for this Jaaiye calendar
  google: {
    linkedIds: { type: [String], default: [] },
    primaryId: { type: String }
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

// Backfill hook: if legacy `user` is present and `owner` missing, set owner=user
calendarSchema.pre('validate', function(next) {
  if (!this.owner && this.user) {
    this.owner = this.user;
  }
  next();
});

// Indexes
calendarSchema.index({ owner: 1 }, { unique: true }); // enforce one calendar per user
calendarSchema.index({ isDefault: 1 });

const Calendar = mongoose.model('Calendar', calendarSchema);

module.exports = Calendar;