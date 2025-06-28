# Calendar System Phase 2 Setup Guide

## Prerequisites
1. MongoDB database with proper indexes
2. Firebase project for push notifications
3. Email service configured
4. User authentication system in place

## External Service Setup

### 1. Firebase Configuration
- Create a new Firebase project or use existing one
- Enable Cloud Messaging
- Generate server key
- Add to environment variables:
  ```
  FIREBASE_PROJECT_ID=your_project_id
  FIREBASE_PRIVATE_KEY=your_private_key
  FIREBASE_CLIENT_EMAIL=your_client_email
  ```

### 2. Email Service Configuration
- Configure SMTP settings
- Add to environment variables:
  ```
  EMAIL_HOST=smtp.example.com
  EMAIL_PORT=587
  EMAIL_USER=your_email@example.com
  EMAIL_PASS=your_email_password
  EMAIL_FROM=noreply@yourdomain.com
  ```

## Database Setup

### 1. Indexes to Add
```javascript
// CalendarShare collection
db.calendarshares.createIndex({ calendar: 1, sharedWith: 1 }, { unique: true });
db.calendarshares.createIndex({ sharedWith: 1, permission: 1 });

// EventParticipant collection (additional indexes)
db.eventparticipants.createIndex({ user: 1, event: 1 }, { unique: true });
db.eventparticipants.createIndex({ event: 1, status: 1 });
```

### 2. Data Migration
If existing events need to be shared:
```javascript
// Migration script to add default privacy settings
db.events.updateMany(
  { privacy: { $exists: false } },
  { $set: { privacy: 'private' } }
);
```

## API Rate Limits
Configure rate limits for calendar sharing endpoints:
```
RATE_LIMIT_SHARE_WINDOW_MS=3600000  // 1 hour
RATE_LIMIT_SHARE_MAX_REQUESTS=100   // 100 requests per hour
```

## Testing Setup

### 1. Test Users
Create test users with different permission levels:
- User A: Calendar owner
- User B: Friend with full access
- User C: Friend with basic access
- User D: Friend with free/busy access

### 2. Test Scenarios
1. Calendar Sharing
   - Share calendar with different permission levels
   - Verify access restrictions
   - Test unsharing calendar

2. Event Visibility
   - Create events with different privacy settings
   - Verify friend access levels
   - Test event updates visibility

3. Notifications
   - Test invitation notifications
   - Test RSVP notifications
   - Test event update notifications

## Security Considerations

### 1. Permission Checks
- Implement middleware for:
  - Calendar access verification
  - Event access verification
  - Friend relationship verification

### 2. Data Privacy
- Ensure private events are not visible to unauthorized users
- Implement proper data filtering in API responses
- Add audit logging for permission changes

## Monitoring Setup

### 1. Logging
Configure logging for:
- Calendar sharing actions
- Permission changes
- Access attempts
- Notification deliveries

### 2. Alerts
Set up alerts for:
- Failed permission checks
- High rate of access attempts
- Notification delivery failures

## Implementation Steps

1. Database Updates
   - Add new collections
   - Create indexes
   - Run migrations

2. API Implementation
   - Add sharing endpoints
   - Implement permission checks
   - Add notification triggers

3. Testing
   - Set up test environment
   - Create test users
   - Run test scenarios

4. Deployment
   - Deploy database changes
   - Update API
   - Configure monitoring

## Rollback Plan

1. Database
   - Backup before changes
   - Script to remove new collections
   - Script to restore original state

2. API
   - Version control for easy rollback
   - Maintain previous version endpoints
   - Quick switch mechanism

## Post-Deployment Checklist

1. Verify
   - All indexes are created
   - Rate limits are applied
   - Notifications are working
   - Permissions are enforced

2. Monitor
   - Error rates
   - Performance metrics
   - User feedback

3. Document
   - API changes
   - New features
   - Known issues