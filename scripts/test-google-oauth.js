const dotenv = require('dotenv');
const { google } = require('googleapis');

// Load environment variables
dotenv.config();

function testGoogleOAuthConfig() {
  console.log('🔍 Google OAuth Configuration Test\n');

  // Check required environment variables
  const requiredVars = [
    'GOOGLE_CLIENT_ID',
    'GOOGLE_CLIENT_SECRET',
    'GOOGLE_REDIRECT_URI'
  ];

  const missingVars = [];
  const config = {};

  requiredVars.forEach(varName => {
    const value = process.env[varName];
    if (!value) {
      missingVars.push(varName);
      config[varName] = '❌ MISSING';
    } else {
      config[varName] = `✅ ${value.substring(0, 20)}...`;
    }
  });

  console.log('📋 Environment Variables:');
  Object.entries(config).forEach(([key, value]) => {
    console.log(`  ${key}: ${value}`);
  });

  if (missingVars.length > 0) {
    console.log(`\n❌ Missing required variables: ${missingVars.join(', ')}`);
    console.log('Please check your .env file and ensure all Google OAuth variables are set.');
    return false;
  }

  console.log('\n✅ All required environment variables are present!');

  // Test OAuth2 client creation
  try {
    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    console.log('\n🔧 OAuth2 Client:');
    console.log(`  Client ID: ${oauth2Client._clientId ? '✅ Valid' : '❌ Invalid'}`);
    console.log(`  Client Secret: ${oauth2Client._clientSecret ? '✅ Valid' : '❌ Invalid'}`);
    console.log(`  Redirect URI: ${oauth2Client._redirectUri ? '✅ Valid' : '❌ Invalid'}`);

    // Generate authorization URL
    const authUrl = oauth2Client.generateAuthUrl({
      access_type: 'offline',
      scope: [
        'https://www.googleapis.com/auth/calendar',
        'https://www.googleapis.com/auth/calendar.events',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile'
      ],
      prompt: 'consent'
    });

    console.log('\n🔗 Authorization URL:');
    console.log(`  ${authUrl.substring(0, 100)}...`);

    console.log('\n✅ OAuth2 client created successfully!');
    console.log('\n📝 Next steps:');
    console.log('1. Visit the authorization URL in a browser');
    console.log('2. Grant permissions to your Google account');
    console.log('3. Copy the authorization code from the redirect URL');
    console.log('4. Use the code to test your /api/v1/google/link endpoint');

    return true;

  } catch (error) {
    console.log('\n❌ Failed to create OAuth2 client:');
    console.log(`  Error: ${error.message}`);
    return false;
  }
}

// Common OAuth error explanations
function explainOAuthErrors() {
  console.log('\n📚 Common OAuth Error Explanations:\n');

  const errors = {
    'invalid_grant': {
      description: 'The authorization code has expired or was already used',
      solution: 'Get a fresh authorization code from Google'
    },
    'unauthorized_client': {
      description: 'Your OAuth client is not authorized for this request',
      solution: 'Check Google Cloud Console OAuth consent screen and credentials'
    },
    'invalid_client': {
      description: 'Invalid client ID or secret',
      solution: 'Verify GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env'
    },
    'access_denied': {
      description: 'User denied the permission request',
      solution: 'User must grant calendar permissions in Google OAuth flow'
    },
    'redirect_uri_mismatch': {
      description: 'Redirect URI doesn\'t match what\'s configured in Google Cloud',
      solution: 'Update GOOGLE_REDIRECT_URI or Google Cloud Console settings'
    }
  };

  Object.entries(errors).forEach(([error, info]) => {
    console.log(`🔴 ${error}:`);
    console.log(`   Description: ${info.description}`);
    console.log(`   Solution: ${info.solution}\n`);
  });
}

// Run the test
if (require.main === module) {
  const success = testGoogleOAuthConfig();

  if (success) {
    explainOAuthErrors();
  } else {
    console.log('\n❌ Configuration test failed. Please fix the issues above.');
    process.exit(1);
  }
}

module.exports = { testGoogleOAuthConfig, explainOAuthErrors };
