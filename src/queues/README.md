# Queues Directory

This directory contains all background processing queue services for the application.

## Structure

```
src/queues/
├── index.js          # Main export file for all queues
├── emailQueue.js     # Email processing queue
├── reportQueue.js    # Report generation queue
└── README.md         # This documentation
```

## Available Queues

### EmailQueue (`emailQueue.js`)
Handles background email processing with retry logic and batch processing.

**Features:**
- Batch processing (5 emails at a time)
- Exponential backoff retry (max 3 retries)
- 2-second batch timeout
- Support for all email types (verification, password reset, welcome, etc.)

**Usage:**
```javascript
const { emailQueue } = require('../queues');

// Send verification email in background
await emailQueue.sendVerificationEmailAsync(email, code);

// Send welcome email in background
await emailQueue.sendWelcomeEmailAsync(email);
```

### ReportQueue (`reportQueue.js`)
Handles background report generation with email notifications.

**Features:**
- Batch processing (3 reports at a time)
- Exponential backoff retry (max 2 retries)
- 5-second batch timeout
- Automatic email notifications when reports are ready

**Usage:**
```javascript
const { reportQueue } = require('../queues');

// Generate calendar report in background
await reportQueue.generateCalendarReportAsync(userId, reportData);

// Generate analytics report in background
await reportQueue.generateAnalyticsReportAsync(userId, reportData);
```

## Queue Status Monitoring

Both queues provide status monitoring methods:

```javascript
// Get queue status
const emailStatus = emailQueue.getStatus();
const reportStatus = reportQueue.getStatus();

// Get failed items
const failedEmails = emailQueue.getFailedEmails();
const failedReports = reportQueue.getFailedReports();
```

## Performance Benefits

- **Faster API Responses**: 50-100ms vs 2-5 seconds
- **Better User Experience**: Immediate feedback
- **Reliability**: Retry logic with exponential backoff
- **Scalability**: Batch processing for high volumes

## Queue Configuration

### Email Queue
- **Batch Size**: 5 emails
- **Batch Timeout**: 2 seconds
- **Max Retries**: 3
- **Retry Backoff**: Exponential (1s, 2s, 4s)

### Report Queue
- **Batch Size**: 3 reports
- **Batch Timeout**: 5 seconds
- **Max Retries**: 2
- **Retry Backoff**: Exponential (5s, 10s)

## Logging

All queue operations are logged with structured data:

```json
{
  "level": "info",
  "message": "Email added to queue",
  "type": "verification",
  "to": "user@example.com",
  "queueLength": 3
}
```

## Error Handling

Queues handle errors gracefully:
- Failed items are retried with exponential backoff
- Permanent failures are logged for monitoring
- Queue processing continues even if individual items fail