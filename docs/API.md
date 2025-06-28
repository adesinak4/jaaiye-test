# Jaaiye API Documentation

## Table of Contents
1. [Authentication](#authentication)
2. [Users](#users)
3. [Calendars](#calendars)
4. [Events](#events)
5. [Notifications](#notifications)
6. [Analytics](#analytics)
7. [Reports](#reports)
8. [Integrations](#integrations)
9. [Health](#health)
10. [Error Handling](#error-handling)

## Authentication

All API endpoints require authentication using a Bearer token. Include the token in the Authorization header:

```
Authorization: Bearer <your_token>
```

### Register
Create a new user account.

**Endpoint:** `POST /api/auth/register`

**Headers:**
- Content-Type: application/json

**Request Body:**
```json
{
  "name": "User Name",
  "email": "user@example.com",
  "password": "securePassword123",
  "confirmPassword": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Registration successful. Please check your email for verification.",
  "data": {
    "id": "user_id",
    "name": "User Name",
    "email": "user@example.com"
  }
}
```

### Login
Authenticate and get access token.

**Endpoint:** `POST /api/auth/login`

**Headers:**
- Content-Type: application/json

**Request Body:**
```json
{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "access_token",
    "refreshToken": "refresh_token",
    "user": {
      "id": "user_id",
      "name": "User Name",
      "email": "user@example.com"
    }
  }
}
```

### Verify Email
Verify user's email address.

**Endpoint:** `POST /api/auth/verify-email`

**Headers:**
- Content-Type: application/json

**Request Body:**
```json
{
  "token": "verification_token"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Email verified successfully"
}
```

### Forgot Password
Request password reset email.

**Endpoint:** `POST /api/auth/forgot-password`

**Headers:**
- Content-Type: application/json

**Request Body:**
```json
{
  "email": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset email sent"
}
```

### Reset Password
Reset password using token.

**Endpoint:** `POST /api/auth/reset-password`

**Headers:**
- Content-Type: application/json

**Request Body:**
```json
{
  "token": "reset_token",
  "password": "newPassword123",
  "confirmPassword": "newPassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password reset successful"
}
```

### Refresh Token
Get new access token using refresh token.

**Endpoint:** `POST /api/auth/refresh-token`

**Headers:**
- Content-Type: application/json

**Request Body:**
```json
{
  "refreshToken": "refresh_token"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "token": "new_access_token",
    "refreshToken": "new_refresh_token"
  }
}
```

### Get Current User
Get current authenticated user's profile.

**Endpoint:** `GET /api/auth/me`

**Headers:**
- Authorization: Bearer token

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user_id",
    "name": "User Name",
    "email": "user@example.com",
    "preferences": {
      "notifications": {
        "email": true,
        "push": true
      }
    }
  }
}
```

## Users

### Update Profile
Update user's profile information.

**Endpoint:** `PUT /api/users/profile`

**Headers:**
- Authorization: Bearer token
- Content-Type: application/json

**Request Body:**
```json
{
  "name": "New Name",
  "preferences": {
    "notifications": {
      "email": true,
      "push": true
    }
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "user_id",
    "name": "New Name",
    "email": "user@example.com",
    "preferences": {
      "notifications": {
        "email": true,
        "push": true
      }
    }
  }
}
```

### Change Password
Change user's password.

**Endpoint:** `PUT /api/users/password`

**Headers:**
- Authorization: Bearer token
- Content-Type: application/json

**Request Body:**
```json
{
  "currentPassword": "currentPassword123",
  "newPassword": "newPassword123",
  "confirmPassword": "newPassword123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Password changed successfully"
}
```

## Calendars

### Create Calendar
Create a new calendar.

**Endpoint:** `POST /api/calendars`

**Headers:**
- Authorization: Bearer token
- Content-Type: application/json

**Request Body:**
```json
{
  "name": "My Calendar",
  "description": "Calendar description",
  "color": "#FF0000",
  "isPublic": false
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "calendar_id",
    "name": "My Calendar",
    "description": "Calendar description",
    "color": "#FF0000",
    "isPublic": false,
    "owner": "user_id"
  }
}
```

### Get Calendars
Get user's calendars.

**Endpoint:** `GET /api/calendars`

**Headers:**
- Authorization: Bearer token

**Query Parameters:**
- `page` (number, default: 1): Page number
- `limit` (number, default: 10): Items per page

**Response:**
```json
{
  "success": true,
  "data": {
    "calendars": [
      {
        "id": "calendar_id",
        "name": "My Calendar",
        "description": "Calendar description",
        "color": "#FF0000",
        "isPublic": false,
        "owner": "user_id"
      }
    ],
    "total": 1,
    "page": 1,
    "pages": 1
  }
}
```

## Events

### Create Event
Create a new event in a calendar.

**Endpoint:** `POST /api/events`

**Headers:**
- Authorization: Bearer token
- Content-Type: application/json

**Request Body:**
```json
{
  "calendar": "calendar_id",
  "title": "Event Title",
  "description": "Event description",
  "startTime": "2024-01-01T10:00:00Z",
  "endTime": "2024-01-01T11:00:00Z",
  "location": "Event Location",
  "participants": ["user1@example.com", "user2@example.com"]
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "event_id",
    "title": "Event Title",
    "description": "Event description",
    "startTime": "2024-01-01T10:00:00Z",
    "endTime": "2024-01-01T11:00:00Z",
    "location": "Event Location",
    "calendar": "calendar_id",
    "participants": [
      {
        "email": "user1@example.com",
        "status": "pending"
      },
      {
        "email": "user2@example.com",
        "status": "pending"
      }
    ]
  }
}
```

## Notifications

### Register Device Token
Register a device token for push notifications.

**Endpoint:** `POST /api/notifications/device-token`

**Headers:**
- Authorization: Bearer token

**Request Body:**
```json
{
  "token": "device_token_string",
  "platform": "ios|android|web"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Device token registered successfully"
}
```

### Remove Device Token
Remove a registered device token.

**Endpoint:** `DELETE /api/notifications/device-token/:token`

**Headers:**
- Authorization: Bearer token

**Response:**
```json
{
  "success": true,
  "message": "Device token removed successfully"
}
```

### Get Notifications
Get user's notifications with optional filters.

**Endpoint:** `GET /api/notifications`

**Headers:**
- Authorization: Bearer token

**Query Parameters:**
- `page` (number, default: 1): Page number
- `limit` (number, default: 10): Items per page
- `read` (boolean): Filter by read status
- `type` (string): Filter by notification type
- `priority` (string): Filter by priority level

**Response:**
```json
{
  "success": true,
  "notifications": [
    {
      "id": "notification_id",
      "title": "Notification Title",
      "message": "Notification Message",
      "type": "message|system|alert|update",
      "data": {},
      "read": false,
      "priority": "low|medium|high",
      "createdAt": "2024-01-01T00:00:00.000Z",
      "updatedAt": "2024-01-01T00:00:00.000Z"
    }
  ],
  "total": 100,
  "page": 1,
  "pages": 10
}
```

### Mark Notification as Read
Mark a single notification as read.

**Endpoint:** `PUT /api/notifications/:id/read`

**Headers:**
- Authorization: Bearer token

**Response:**
```json
{
  "success": true,
  "message": "Notification marked as read"
}
```

### Mark Multiple Notifications as Read
Mark multiple notifications as read.

**Endpoint:** `PUT /api/notifications/bulk-read`

**Headers:**
- Authorization: Bearer token

**Request Body:**
```json
{
  "notificationIds": ["id1", "id2", "id3"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Notifications marked as read"
}
```

### Delete Notification
Delete a single notification.

**Endpoint:** `DELETE /api/notifications/:id`

**Headers:**
- Authorization: Bearer token

**Response:**
```json
{
  "success": true,
  "message": "Notification deleted successfully"
}
```

### Delete Multiple Notifications
Delete multiple notifications.

**Endpoint:** `DELETE /api/notifications/bulk`

**Headers:**
- Authorization: Bearer token

**Request Body:**
```json
{
  "notificationIds": ["id1", "id2", "id3"]
}
```

**Response:**
```json
{
  "success": true,
  "message": "Notifications deleted successfully"
}
```

## Analytics

### Get Event Analytics
Get analytics for a specific event.

**Endpoint:** `GET /api/analytics/events/:eventId`

**Headers:**
- Authorization: Bearer token

**Response:**
```json
{
  "success": true,
  "data": {
    "eventId": "event_id",
    "views": 100,
    "participants": 10,
    "engagement": {
      "averageTimeSpent": 300,
      "interactions": 50
    }
  }
}
```

## Reports

### Generate Report
Generate a report for a specific time period.

**Endpoint:** `POST /api/reports`

**Headers:**
- Authorization: Bearer token
- Content-Type: application/json

**Request Body:**
```json
{
  "type": "calendar|event|user",
  "startDate": "2024-01-01",
  "endDate": "2024-01-31",
  "format": "pdf|csv"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "reportId": "report_id",
    "status": "processing",
    "downloadUrl": "https://api.jaaiye.com/reports/report_id"
  }
}
```

## Integrations

### Connect Integration
Connect a third-party service.

**Endpoint:** `POST /api/integrations`

**Headers:**
- Authorization: Bearer token
- Content-Type: application/json

**Request Body:**
```json
{
  "service": "google|microsoft|apple",
  "credentials": {
    "accessToken": "access_token",
    "refreshToken": "refresh_token"
  }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "id": "integration_id",
    "service": "google",
    "status": "connected",
    "lastSynced": "2024-01-01T00:00:00Z"
  }
}
```

## Health

### Check API Health
Check the health status of the API.

**Endpoint:** `GET /api/health`

**Response:**
```json
{
  "status": "ok",
  "timestamp": "2024-01-01T00:00:00Z",
  "services": {
    "database": "ok",
    "cache": "ok",
    "email": "ok"
  }
}
```

## Error Handling

The API uses standard HTTP status codes and returns error responses in the following format:

```json
{
  "success": false,
  "message": "Error message",
  "error": "Detailed error message"
}
```

Common status codes:
- 200: Success
- 400: Bad Request
- 401: Unauthorized
- 403: Forbidden
- 404: Not Found
- 500: Internal Server Error