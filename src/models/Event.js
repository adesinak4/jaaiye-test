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
    default: null
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
    enum: ['hangout', 'event'],
    default: 'event'
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
  // New fields for ticketing system
  ticketTypes: [{
    name: {
      type: String,
      required: true,
      trim: true
    },
    description: {
      type: String,
      trim: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    capacity: {
      type: Number,
      default: null // null means unlimited
    },
    soldCount: {
      type: Number,
      default: 0,
      min: 0
    },
    isActive: {
      type: Boolean,
      default: true
    },
    salesStartDate: {
      type: Date,
      default: null
    },
    salesEndDate: {
      type: Date,
      default: null
    }
  }],
  // Legacy field for backward compatibility
  ticketFee: {
    type: mongoose.Schema.Types.Mixed, // Can be "free", number, or null
    default: null
  },
  attendeeCount: {
    type: Number,
    default: 0,
    min: 0
  },
  image: {
    type: String, // Cloudinary URL
    default: null
  },
  venue: {
    type: String,
    trim: true
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
  createdBy: {
    type: String,
    default: 'Jaaiye',
    trim: true
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

// Instance methods
eventSchema.methods.incrementAttendeeCount = function() {
  this.attendeeCount += 1;
  return this.save();
};

eventSchema.methods.addTicketType = function(ticketTypeData) {
  this.ticketTypes.push(ticketTypeData);
  return this.save();
};

eventSchema.methods.updateTicketType = function(ticketTypeId, updateData) {
  const ticketType = this.ticketTypes.id(ticketTypeId);
  if (!ticketType) {
    throw new Error('Ticket type not found');
  }
  Object.assign(ticketType, updateData);
  return this.save();
};

eventSchema.methods.removeTicketType = function(ticketTypeId) {
  this.ticketTypes.pull(ticketTypeId);
  return this.save();
};

eventSchema.methods.incrementTicketSales = function(ticketTypeId, quantity = 1) {
  const ticketType = this.ticketTypes.id(ticketTypeId);
  if (!ticketType) {
    throw new Error('Ticket type not found');
  }

  // Check capacity
  if (ticketType.capacity && (ticketType.soldCount + quantity) > ticketType.capacity) {
    throw new Error('Ticket capacity exceeded');
  }

  ticketType.soldCount += quantity;
  this.attendeeCount += quantity;
  return this.save();
};

eventSchema.methods.decrementTicketSales = function(ticketTypeId, quantity = 1) {
  const ticketType = this.ticketTypes.id(ticketTypeId);
  if (!ticketType) {
    throw new Error('Ticket type not found');
  }

  ticketType.soldCount = Math.max(0, ticketType.soldCount - quantity);
  this.attendeeCount = Math.max(0, this.attendeeCount - quantity);
  return this.save();
};

eventSchema.methods.getAvailableTicketTypes = function() {
  const now = new Date();
  return this.ticketTypes.filter(ticketType => {
    if (!ticketType.isActive) return false;

    // Check sales date range
    if (ticketType.salesStartDate && now < ticketType.salesStartDate) return false;
    if (ticketType.salesEndDate && now > ticketType.salesEndDate) return false;

    // Check capacity
    if (ticketType.capacity && ticketType.soldCount >= ticketType.capacity) return false;

    return true;
  });
};

// Static methods
eventSchema.statics.findByCategory = function(category) {
  return this.find({ category, status: 'scheduled' }).sort({ startTime: 1 });
};

// Indexes for faster queries
eventSchema.index({ calendar: 1, startTime: 1 });
eventSchema.index({ calendar: 1, endTime: 1 });
eventSchema.index({ status: 1 });
eventSchema.index({ category: 1 });
eventSchema.index({ attendeeCount: 1 });

const Event = mongoose.model('Event', eventSchema);

module.exports = Event;