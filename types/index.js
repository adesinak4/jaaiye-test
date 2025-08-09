// Common data types and interfaces for the application

// User types
const USER_TYPES = {
  REGULAR: 'regular',
  ADMIN: 'admin',
  MODERATOR: 'moderator'
};

// Event types
const EVENT_TYPES = {
  MEETING: 'meeting',
  APPOINTMENT: 'appointment',
  REMINDER: 'reminder',
  TASK: 'task',
  BIRTHDAY: 'birthday',
  HOLIDAY: 'holiday',
  CUSTOM: 'custom'
};

// Event status
const EVENT_STATUS = {
  SCHEDULED: 'scheduled',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  POSTPONED: 'postponed'
};

// Participant status
const PARTICIPANT_STATUS = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  DECLINED: 'declined',
  MAYBE: 'maybe'
};

// Calendar types
const CALENDAR_TYPES = {
  PERSONAL: 'personal',
  WORK: 'work',
  FAMILY: 'family',
  SHARED: 'shared',
  PUBLIC: 'public'
};

// Notification types
const NOTIFICATION_TYPES = {
  EMAIL: 'email',
  PUSH: 'push',
  IN_APP: 'in_app',
  SMS: 'sms'
};

// Report types
const REPORT_TYPES = {
  CALENDAR: 'calendar',
  EVENTS: 'events',
  ANALYTICS: 'analytics',
  USER: 'user'
};

// Report formats
const REPORT_FORMATS = {
  PDF: 'pdf',
  CSV: 'csv',
  JSON: 'json',
  EXCEL: 'excel'
};

// Queue status
const QUEUE_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  RETRY: 'retry'
};

// API response status
const API_STATUS = {
  SUCCESS: 'success',
  ERROR: 'error',
  FAIL: 'fail'
};

// HTTP status codes
const HTTP_STATUS = {
  OK: 200,
  CREATED: 201,
  NO_CONTENT: 204,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_SERVER_ERROR: 500
};

// Database operation types
const DB_OPERATIONS = {
  CREATE: 'create',
  READ: 'read',
  UPDATE: 'update',
  DELETE: 'delete',
  SOFT_DELETE: 'soft_delete'
};

// Log levels
const LOG_LEVELS = {
  ERROR: 'error',
  WARN: 'warn',
  INFO: 'info',
  DEBUG: 'debug'
};

// Environment types
const ENVIRONMENTS = {
  DEVELOPMENT: 'development',
  STAGING: 'staging',
  PRODUCTION: 'production',
  TEST: 'test'
};

// Time units
const TIME_UNITS = {
  SECONDS: 'seconds',
  MINUTES: 'minutes',
  HOURS: 'hours',
  DAYS: 'days',
  WEEKS: 'weeks',
  MONTHS: 'months',
  YEARS: 'years'
};

// Date formats
const DATE_FORMATS = {
  ISO: 'iso',
  SHORT: 'short',
  LONG: 'long',
  CUSTOM: 'custom'
};

// File types
const FILE_TYPES = {
  IMAGE: 'image',
  DOCUMENT: 'document',
  VIDEO: 'video',
  AUDIO: 'audio',
  ARCHIVE: 'archive'
};

// Permission levels
const PERMISSIONS = {
  READ: 'read',
  WRITE: 'write',
  DELETE: 'delete',
  ADMIN: 'admin'
};

// Export all types
module.exports = {
  USER_TYPES,
  EVENT_TYPES,
  EVENT_STATUS,
  PARTICIPANT_STATUS,
  CALENDAR_TYPES,
  NOTIFICATION_TYPES,
  REPORT_TYPES,
  REPORT_FORMATS,
  QUEUE_STATUS,
  API_STATUS,
  HTTP_STATUS,
  DB_OPERATIONS,
  LOG_LEVELS,
  ENVIRONMENTS,
  TIME_UNITS,
  DATE_FORMATS,
  FILE_TYPES,
  PERMISSIONS
};