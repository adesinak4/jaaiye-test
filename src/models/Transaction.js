const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
  provider: { type: String, enum: ['paystack', 'flutterwave', 'payaza'], required: true },
  reference: { type: String, required: true },
  amount: { type: Number, required: true },
  currency: { type: String, default: 'NGN' },
  status: { type: String, enum: ['pending', 'successful', 'failed', 'cancelled', 'completed'], default: 'pending' },
  sessionId: { type: String },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event', required: true },
  ticketTypeId: { type: mongoose.Schema.Types.ObjectId, required: false },
  quantity: { type: Number, default: 1 },
  metadata: { type: Object },
  raw: { type: Object },
}, { timestamps: true });

transactionSchema.index({ provider: 1, reference: 1 }, { unique: true });
transactionSchema.index({ userId: 1, createdAt: -1 });
transactionSchema.index({ eventId: 1, createdAt: -1 });

const Transaction = mongoose.model('Transaction', transactionSchema);

module.exports = Transaction;


