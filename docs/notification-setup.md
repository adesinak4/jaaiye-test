# Notification Setup Guide

## Firebase Cloud Messaging (FCM) Setup

### 1. Firebase Project Setup
1. Go to [Firebase Console](https://console.firebase.google.com)
2. Create a new project or select an existing one
3. Enable billing for the project (required for FCM)

### 2. Android Setup
1. In Firebase Console, go to Project Settings
2. Under "Your apps", click the Android icon
3. Fill in:
   - Android package name: com.yourcompany.yourapp
   - App nickname (optional)
   - Debug signing certificate SHA-1 (optional for development)
4. Download `google-services.json` and place it in your Android app's module root directory

### 3. iOS Setup
1. In Firebase Console, go to Project Settings
2. Under "Your apps", click the iOS icon
3. Fill in:
   - iOS bundle ID: com.yourcompany.yourapp
   - App nickname (optional)
4. Download `GoogleService-Info.plist` and add it to your Xcode project

### 4. Server Setup
1. In Firebase Console, go to Project Settings > Service Accounts
2. Click "Generate New Private Key"
3. Save the downloaded JSON file securely
4. Add these to your `.env` file:
   ```env
   FIREBASE_PROJECT_ID=your_project_id
   FIREBASE_PRIVATE_KEY=your_private_key
   FIREBASE_CLIENT_EMAIL=your_client_email
   ```

## Apple Push Notification Service (APNs) Setup

### 1. Apple Developer Account
1. Go to [Apple Developer Portal](https://developer.apple.com)
2. Navigate to "Certificates, Identifiers & Profiles"
3. Select "Keys" in the sidebar
4. Click the "+" button to create a new key
5. Enable "Apple Push Notifications service (APNs)"
6. Download the .p8 file and note the Key ID

### 2. Server Configuration
Add these to your `.env` file:
```env
APPLE_TEAM_ID=your_team_id
APPLE_KEY_ID=your_key_id
APPLE_PRIVATE_KEY=your_private_key
APPLE_BUNDLE_ID=com.yourcompany.yourapp
```

## Environment Variables

After completing both setups, ensure these are in your `.env` file:

```env
# Firebase
FIREBASE_PROJECT_ID=your_project_id
FIREBASE_PRIVATE_KEY=your_private_key
FIREBASE_CLIENT_EMAIL=your_client_email

# Apple Push Notifications
APPLE_TEAM_ID=your_team_id
APPLE_KEY_ID=your_key_id
APPLE_PRIVATE_KEY=your_private_key
APPLE_BUNDLE_ID=com.yourcompany.yourapp
```

## Testing Notifications

### 1. Firebase Test Message
1. In Firebase Console, go to Cloud Messaging
2. Click "Send your first message"
3. Fill in:
   - Notification title
   - Notification text
   - Target: Single device
   - FCM registration token: Your device token

### 2. Apple Test Message
1. Use the APNs tester tool
2. Fill in:
   - Device token
   - Topic (bundle ID)
   - Payload
   - Authentication method: Token
   - Key ID and Team ID

## Important Notes

1. **Security**
   - Never commit private keys or certificates to version control
   - Use environment variables for sensitive data
   - Regularly rotate your keys and certificates

2. **Testing**
   - Test notifications in development environment first
   - Use test devices and tokens
   - Test different notification types and payloads

3. **Production**
   - Use production certificates and keys
   - Monitor notification delivery rates
   - Set up error logging and monitoring

4. **Best Practices**
   - Handle notification permissions properly
   - Implement notification grouping
   - Support both foreground and background notifications
   - Handle notification actions
   - Implement proper error handling
   - Monitor notification delivery rates