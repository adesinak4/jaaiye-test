const mongoose = require('mongoose');

const ticketSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  ticketTypeId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  ticketTypeName: {
    type: String,
    required: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  quantity: {
    type: Number,
    default: 1,
    min: 1,
    max: 10
  },
  qrCode: {
    type: String, // Base64 encoded QR code or URL
    required: true
  },
  ticketData: {
    type: String, // JSON string containing ticket metadata
    required: true
  },
  publicId: {
    type: String,
    index: true
  },
  status: {
    type: String,
    enum: ['active', 'used', 'cancelled'],
    default: 'active'
  },
  usedAt: {
    type: Date,
    default: null
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
ticketSchema.methods.markAsUsed = function() {
  this.status = 'used';
  this.usedAt = new Date();
  return this.save();
};

ticketSchema.methods.cancel = function() {
  this.status = 'cancelled';
  return this.save();
};

// Static methods
ticketSchema.statics.findByUser = function(userId) {
  return this.find({ userId }).populate('eventId', 'title startTime endTime venue image').sort({ createdAt: -1 });
};

ticketSchema.statics.findByEvent = function(eventId) {
  return this.find({ eventId }).populate('userId', 'fullName email').sort({ createdAt: -1 });
};

ticketSchema.statics.findActiveByUser = function(userId) {
  return this.find({ userId, status: 'active' }).populate('eventId', 'title startTime endTime venue image').sort({ createdAt: -1 });
};

// Indexes for faster queries
ticketSchema.index({ userId: 1, createdAt: -1 });
ticketSchema.index({ eventId: 1, createdAt: -1 });
ticketSchema.index({ status: 1 });
ticketSchema.index({ ticketTypeId: 1 });
ticketSchema.index({ userId: 1, eventId: 1, ticketTypeId: 1 }); // Prevent duplicate tickets of same type
ticketSchema.index({ publicId: 1 });

const Ticket = mongoose.model('Ticket', ticketSchema);

module.exports = Ticket;
