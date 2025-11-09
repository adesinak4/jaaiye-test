const mongoose = require('mongoose');

// Replace with your MongoDB connection string
const MONGO_URI = 'mongodb+srv://jaaiye:gJPxfCyNAtSLJ5S6@jaaiye.ftf2rnr.mongodb.net/?retryWrites=true&w=majority&appName=jaaiye';

const connectDB = async () => {
  await mongoose.connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('MongoDB connected');
};

// Define schemas (simplified for this script)
const User = mongoose.model('User', new mongoose.Schema({
  fullName: String,
  email: String
}));

const Ticket = mongoose.model('Ticket', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  eventId: mongoose.Schema.Types.ObjectId,
  ticketTypeName: String,
  price: Number,
  quantity: Number,
  status: String
}));

const Transaction = mongoose.model('Transaction', new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  provider: String,
  reference: String,
  amount: Number,
  status: String
}));

const fetchUserData = async () => {
  const users = await User.find();

  for (const user of users) {
    const tickets = await Ticket.find({ userId: user._id });
    const transactions = await Transaction.find({ userId: user._id }).where('status').equals('pending');

    console.log(`\n👤 ${user.fullName} (${user.email})`);
    console.log('🎟 Tickets:');
    tickets.forEach(ticket => {
      console.log(`  - ${ticket.ticketTypeName} | ₦${ticket.price} x${ticket.quantity} | Status: ${ticket.status}`);
    });

    console.log('💳 Transactions:');
    transactions.forEach(tx => {
      console.log(`  - ${tx.provider} | Ref: ${tx.reference} | ₦${tx.amount} | Status: ${tx.status}`);
    });
  }
};

const run = async () => {
  await connectDB();
  await fetchUserData();
  mongoose.disconnect();
};

run();

