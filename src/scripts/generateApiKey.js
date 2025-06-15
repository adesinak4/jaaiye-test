require('dotenv').config();
const mongoose = require('mongoose');
const ApiKey = require('../models/ApiKey');

async function generateApiKey() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB successfully');

    // Check if an active key already exists
    const existingKey = await ApiKey.findOne({ isActive: true });
    if (existingKey) {
      console.log('\n⚠️  Warning: An active API key already exists:');
      console.log('Key:', existingKey.key);
      console.log('Created:', existingKey.createdAt);
      console.log('Expires:', existingKey.expiresAt);

      const shouldProceed = await new Promise((resolve) => {
        const readline = require('readline').createInterface({
          input: process.stdin,
          output: process.stdout
        });
        readline.question('\nDo you want to generate a new key and deactivate the existing one? (y/n): ', (answer) => {
          readline.close();
          resolve(answer.toLowerCase() === 'y');
        });
      });

      if (!shouldProceed) {
        console.log('Operation cancelled');
        await mongoose.disconnect();
        process.exit(0);
      }

      // Deactivate the existing key
      existingKey.isActive = false;
      await existingKey.save();
      console.log('\n✅ Deactivated existing API key');
    }

    // Create a new API key
    console.log('\nGenerating new API key...');
    const apiKey = await ApiKey.create({});

    console.log('\n✅ API Key generated successfully!');
    console.log('----------------------------------------');
    console.log('Key:', apiKey.key);
    console.log('Created:', apiKey.createdAt);
    console.log('Expires:', apiKey.expiresAt);
    console.log('----------------------------------------');
    console.log('\n⚠️  Important: Save this key securely!');
    console.log('It will not be shown again.');

    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  } catch(error) {
    console.error('\n❌ Error:', err.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('Could not connect to MongoDB. Please check your connection string and ensure MongoDB is running.');
    }
    process.exit(1);
  }
}

// Run the function
generateApiKey();