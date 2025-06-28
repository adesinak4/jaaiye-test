# Authentication Setup Guide

## Apple Sign In Setup

### 1. Apple Developer Account Setup
1. Go to [Apple Developer Portal](https://developer.apple.com)
2. Sign in with your Apple ID
3. If you don't have an Apple Developer account, enroll in the Apple Developer Program ($99/year)

### 2. Create App ID
1. Navigate to "Certificates, Identifiers & Profiles"
2. Click on "Identifiers" in the sidebar
3. Click the "+" button to create a new identifier
4. Select "App IDs" and click "Continue"
5. Choose "App" and click "Continue"
6. Fill in the following:
   - Description: Your app name
   - Bundle ID: com.yourcompany.yourapp (must be unique)
7. Under "Capabilities", enable "Sign In with Apple"
8. Click "Continue" and then "Register"

### 3. Create Service ID
1. In "Identifiers", click the "+" button again
2. Select "Services IDs" and click "Continue"
3. Fill in:
   - Description: Your app name + " Sign In"
   - Identifier: com.yourcompany.yourapp.signin
4. Click "Continue" and then "Register"
5. Click on the newly created Service ID
6. Enable "Sign In with Apple"
7. Click "Configure" and add:
   - Domain: yourdomain.com
   - Return URLs: https://yourdomain.com/auth/apple/callback
8. Click "Save"

### 4. Generate Private Key
1. In "Certificates, Identifiers & Profiles", select "Keys"
2. Click the "+" button
3. Fill in:
   - Key Name: Sign In with Apple Key
   - Enable "Sign In with Apple"
4. Click "Configure" and select your App ID
5. Click "Save" and then "Continue"
6. Download the key file (.p8) - **SAVE THIS SECURELY**
7. Note down the Key ID shown on the page

### 5. Get Team ID
1. Go to "Membership" in the sidebar
2. Note down your Team ID

## Google Sign In Setup

### 1. Google Cloud Console Setup
1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable billing for the project (required for OAuth)

### 2. Configure OAuth Consent Screen
1. In the sidebar, go to "APIs & Services" > "OAuth consent screen"
2. Select "External" user type
3. Fill in the required information:
   - App name
   - User support email
   - Developer contact email
4. Add authorized domains
5. Add application logo (optional)
6. Save and continue

### 3. Create OAuth Client ID
1. In the sidebar, go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth client ID"
3. Select application type:
   - For web: "Web application"
   - For mobile: "Android" or "iOS"
4. Fill in the details:
   - Name: Your app name
   - For web:
     - Authorized JavaScript origins: https://yourdomain.com
     - Authorized redirect URIs: https://yourdomain.com/auth/google/callback
   - For Android:
     - Package name: com.yourcompany.yourapp
     - SHA-1 certificate fingerprint (from your keystore)
   - For iOS:
     - Bundle ID: com.yourcompany.yourapp
5. Click "Create"
6. Note down the Client ID and Client Secret

### 4. Enable Required APIs
1. In the sidebar, go to "APIs & Services" > "Library"
2. Enable these APIs:
   - Google+ API
   - Google People API

## Environment Variables

After completing both setups, add these to your `.env` file:

```env
# Apple
APPLE_TEAM_ID=your_team_id
APPLE_KEY_ID=your_key_id
APPLE_PRIVATE_KEY=your_private_key
APPLE_BUNDLE_ID=com.yourcompany.yourapp

# Google
GOOGLE_CLIENT_ID=your_client_id
GOOGLE_CLIENT_SECRET=your_client_secret
```

## Important Notes

1. **Security**
   - Never commit your private keys or secrets to version control
   - Store them securely and use environment variables
   - Regularly rotate your keys and secrets

2. **Testing**
   - Test the authentication flow thoroughly in development
   - Use test accounts provided by Apple and Google
   - Test error scenarios and edge cases

3. **Production**
   - Update redirect URIs to your production domain
   - Ensure all domains are properly verified
   - Monitor authentication logs for suspicious activity

4. **Compliance**
   - Follow Apple's [Human Interface Guidelines](https://developer.apple.com/design/human-interface-guidelines/sign-in-with-apple)
   - Follow Google's [Brand Guidelines](https://developers.google.com/identity/branding-guidelines)
   - Implement proper privacy policy and terms of service