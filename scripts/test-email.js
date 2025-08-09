#!/usr/bin/env node

require('dotenv').config();
const emailService = require('../src/services/emailService');

async function testEmailConfiguration() {
  console.log('🔍 Testing Email Configuration...\n');

  // Check configuration
  const configInfo = emailService.getConfigInfo();
  console.log('📋 Configuration Status:');
  console.log(`  Email User: ${configInfo.hasEmailUser ? '✅ Set' : '❌ Missing'}`);
  console.log(`  Email Pass: ${configInfo.hasEmailPass ? '✅ Set' : '❌ Missing'}`);
  console.log(`  SMTP Host: ${configInfo.hasSmtpHost ? '✅ Set' : '❌ Using Gmail'}`);
  console.log(`  SMTP User: ${configInfo.hasSmtpUser ? '✅ Set' : '❌ Using Email User'}`);
  console.log(`  SMTP Pass: ${configInfo.hasSmtpPass ? '✅ Set' : '❌ Using Email Pass'}`);
  console.log(`  App Name: ${configInfo.appName}\n`);

  if (!configInfo.hasEmailUser || !configInfo.hasEmailPass) {
    console.log('❌ Email configuration is incomplete!');
    console.log('Please set the following environment variables:');
    console.log('  EMAIL_USER=your-email@gmail.com');
    console.log('  EMAIL_PASS=your-app-password');
    console.log('\nFor Gmail, you need to:');
    console.log('1. Enable 2-Factor Authentication');
    console.log('2. Generate an App Password');
    console.log('3. Use the App Password instead of your regular password');
    return;
  }

  // Test connection
  console.log('🔗 Testing Email Connection...');
  try {
    const result = await emailService.testConnection();
    if (result.success) {
      console.log('✅ Email configuration is working!');
    } else {
      console.log('❌ Email configuration failed:');
      console.log(`   ${result.message}`);
      console.log(`   Error: ${result.error}`);
    }
  } catch (error) {
    console.log('❌ Email test failed:', error.message);
  }

  console.log('\n📝 Troubleshooting Tips:');
  console.log('1. For Gmail: Use App Password instead of regular password');
  console.log('2. Check firewall settings');
  console.log('3. Verify internet connection');
  console.log('4. Try different SMTP settings (see .env.example)');
}

// Run the test
testEmailConfiguration().catch(console.error);