const {
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
} = require('../../types');

describe('Types', () => {
  describe('USER_TYPES', () => {
    test('should have required user types', () => {
      expect(USER_TYPES).toHaveProperty('REGULAR');
      expect(USER_TYPES).toHaveProperty('ADMIN');
      expect(USER_TYPES).toHaveProperty('MODERATOR');
    });

    test('should have correct values', () => {
      expect(USER_TYPES.REGULAR).toBe('regular');
      expect(USER_TYPES.ADMIN).toBe('admin');
      expect(USER_TYPES.MODERATOR).toBe('moderator');
    });
  });

  describe('EVENT_TYPES', () => {
    test('should have required event types', () => {
      expect(EVENT_TYPES).toHaveProperty('MEETING');
      expect(EVENT_TYPES).toHaveProperty('APPOINTMENT');
      expect(EVENT_TYPES).toHaveProperty('REMINDER');
      expect(EVENT_TYPES).toHaveProperty('TASK');
      expect(EVENT_TYPES).toHaveProperty('BIRTHDAY');
      expect(EVENT_TYPES).toHaveProperty('HOLIDAY');
      expect(EVENT_TYPES).toHaveProperty('CUSTOM');
    });

    test('should have correct values', () => {
      expect(EVENT_TYPES.MEETING).toBe('meeting');
      expect(EVENT_TYPES.APPOINTMENT).toBe('appointment');
      expect(EVENT_TYPES.REMINDER).toBe('reminder');
      expect(EVENT_TYPES.TASK).toBe('task');
      expect(EVENT_TYPES.BIRTHDAY).toBe('birthday');
      expect(EVENT_TYPES.HOLIDAY).toBe('holiday');
      expect(EVENT_TYPES.CUSTOM).toBe('custom');
    });
  });

  describe('EVENT_STATUS', () => {
    test('should have required event statuses', () => {
      expect(EVENT_STATUS).toHaveProperty('SCHEDULED');
      expect(EVENT_STATUS).toHaveProperty('IN_PROGRESS');
      expect(EVENT_STATUS).toHaveProperty('COMPLETED');
      expect(EVENT_STATUS).toHaveProperty('CANCELLED');
      expect(EVENT_STATUS).toHaveProperty('POSTPONED');
    });

    test('should have correct values', () => {
      expect(EVENT_STATUS.SCHEDULED).toBe('scheduled');
      expect(EVENT_STATUS.IN_PROGRESS).toBe('in_progress');
      expect(EVENT_STATUS.COMPLETED).toBe('completed');
      expect(EVENT_STATUS.CANCELLED).toBe('cancelled');
      expect(EVENT_STATUS.POSTPONED).toBe('postponed');
    });
  });

  describe('PARTICIPANT_STATUS', () => {
    test('should have required participant statuses', () => {
      expect(PARTICIPANT_STATUS).toHaveProperty('PENDING');
      expect(PARTICIPANT_STATUS).toHaveProperty('ACCEPTED');
      expect(PARTICIPANT_STATUS).toHaveProperty('DECLINED');
      expect(PARTICIPANT_STATUS).toHaveProperty('MAYBE');
    });

    test('should have correct values', () => {
      expect(PARTICIPANT_STATUS.PENDING).toBe('pending');
      expect(PARTICIPANT_STATUS.ACCEPTED).toBe('accepted');
      expect(PARTICIPANT_STATUS.DECLINED).toBe('declined');
      expect(PARTICIPANT_STATUS.MAYBE).toBe('maybe');
    });
  });

  describe('CALENDAR_TYPES', () => {
    test('should have required calendar types', () => {
      expect(CALENDAR_TYPES).toHaveProperty('PERSONAL');
      expect(CALENDAR_TYPES).toHaveProperty('WORK');
      expect(CALENDAR_TYPES).toHaveProperty('FAMILY');
      expect(CALENDAR_TYPES).toHaveProperty('SHARED');
      expect(CALENDAR_TYPES).toHaveProperty('PUBLIC');
    });

    test('should have correct values', () => {
      expect(CALENDAR_TYPES.PERSONAL).toBe('personal');
      expect(CALENDAR_TYPES.WORK).toBe('work');
      expect(CALENDAR_TYPES.FAMILY).toBe('family');
      expect(CALENDAR_TYPES.SHARED).toBe('shared');
      expect(CALENDAR_TYPES.PUBLIC).toBe('public');
    });
  });

  describe('NOTIFICATION_TYPES', () => {
    test('should have required notification types', () => {
      expect(NOTIFICATION_TYPES).toHaveProperty('EMAIL');
      expect(NOTIFICATION_TYPES).toHaveProperty('PUSH');
      expect(NOTIFICATION_TYPES).toHaveProperty('IN_APP');
      expect(NOTIFICATION_TYPES).toHaveProperty('SMS');
    });

    test('should have correct values', () => {
      expect(NOTIFICATION_TYPES.EMAIL).toBe('email');
      expect(NOTIFICATION_TYPES.PUSH).toBe('push');
      expect(NOTIFICATION_TYPES.IN_APP).toBe('in_app');
      expect(NOTIFICATION_TYPES.SMS).toBe('sms');
    });
  });

  describe('REPORT_TYPES', () => {
    test('should have required report types', () => {
      expect(REPORT_TYPES).toHaveProperty('CALENDAR');
      expect(REPORT_TYPES).toHaveProperty('EVENTS');
      expect(REPORT_TYPES).toHaveProperty('ANALYTICS');
      expect(REPORT_TYPES).toHaveProperty('USER');
    });

    test('should have correct values', () => {
      expect(REPORT_TYPES.CALENDAR).toBe('calendar');
      expect(REPORT_TYPES.EVENTS).toBe('events');
      expect(REPORT_TYPES.ANALYTICS).toBe('analytics');
      expect(REPORT_TYPES.USER).toBe('user');
    });
  });

  describe('REPORT_FORMATS', () => {
    test('should have required report formats', () => {
      expect(REPORT_FORMATS).toHaveProperty('PDF');
      expect(REPORT_FORMATS).toHaveProperty('CSV');
      expect(REPORT_FORMATS).toHaveProperty('JSON');
      expect(REPORT_FORMATS).toHaveProperty('EXCEL');
    });

    test('should have correct values', () => {
      expect(REPORT_FORMATS.PDF).toBe('pdf');
      expect(REPORT_FORMATS.CSV).toBe('csv');
      expect(REPORT_FORMATS.JSON).toBe('json');
      expect(REPORT_FORMATS.EXCEL).toBe('excel');
    });
  });

  describe('QUEUE_STATUS', () => {
    test('should have required queue statuses', () => {
      expect(QUEUE_STATUS).toHaveProperty('PENDING');
      expect(QUEUE_STATUS).toHaveProperty('PROCESSING');
      expect(QUEUE_STATUS).toHaveProperty('COMPLETED');
      expect(QUEUE_STATUS).toHaveProperty('FAILED');
      expect(QUEUE_STATUS).toHaveProperty('RETRY');
    });

    test('should have correct values', () => {
      expect(QUEUE_STATUS.PENDING).toBe('pending');
      expect(QUEUE_STATUS.PROCESSING).toBe('processing');
      expect(QUEUE_STATUS.COMPLETED).toBe('completed');
      expect(QUEUE_STATUS.FAILED).toBe('failed');
      expect(QUEUE_STATUS.RETRY).toBe('retry');
    });
  });

  describe('API_STATUS', () => {
    test('should have required API statuses', () => {
      expect(API_STATUS).toHaveProperty('SUCCESS');
      expect(API_STATUS).toHaveProperty('ERROR');
      expect(API_STATUS).toHaveProperty('FAIL');
    });

    test('should have correct values', () => {
      expect(API_STATUS.SUCCESS).toBe('success');
      expect(API_STATUS.ERROR).toBe('error');
      expect(API_STATUS.FAIL).toBe('fail');
    });
  });

  describe('HTTP_STATUS', () => {
    test('should have required HTTP status codes', () => {
      expect(HTTP_STATUS).toHaveProperty('OK');
      expect(HTTP_STATUS).toHaveProperty('CREATED');
      expect(HTTP_STATUS).toHaveProperty('NO_CONTENT');
      expect(HTTP_STATUS).toHaveProperty('BAD_REQUEST');
      expect(HTTP_STATUS).toHaveProperty('UNAUTHORIZED');
      expect(HTTP_STATUS).toHaveProperty('FORBIDDEN');
      expect(HTTP_STATUS).toHaveProperty('NOT_FOUND');
      expect(HTTP_STATUS).toHaveProperty('CONFLICT');
      expect(HTTP_STATUS).toHaveProperty('UNPROCESSABLE_ENTITY');
      expect(HTTP_STATUS).toHaveProperty('INTERNAL_SERVER_ERROR');
    });

    test('should have correct values', () => {
      expect(HTTP_STATUS.OK).toBe(200);
      expect(HTTP_STATUS.CREATED).toBe(201);
      expect(HTTP_STATUS.NO_CONTENT).toBe(204);
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
      expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
      expect(HTTP_STATUS.FORBIDDEN).toBe(403);
      expect(HTTP_STATUS.NOT_FOUND).toBe(404);
      expect(HTTP_STATUS.CONFLICT).toBe(409);
      expect(HTTP_STATUS.UNPROCESSABLE_ENTITY).toBe(422);
      expect(HTTP_STATUS.INTERNAL_SERVER_ERROR).toBe(500);
    });
  });

  describe('DB_OPERATIONS', () => {
    test('should have required database operations', () => {
      expect(DB_OPERATIONS).toHaveProperty('CREATE');
      expect(DB_OPERATIONS).toHaveProperty('READ');
      expect(DB_OPERATIONS).toHaveProperty('UPDATE');
      expect(DB_OPERATIONS).toHaveProperty('DELETE');
      expect(DB_OPERATIONS).toHaveProperty('SOFT_DELETE');
    });

    test('should have correct values', () => {
      expect(DB_OPERATIONS.CREATE).toBe('create');
      expect(DB_OPERATIONS.READ).toBe('read');
      expect(DB_OPERATIONS.UPDATE).toBe('update');
      expect(DB_OPERATIONS.DELETE).toBe('delete');
      expect(DB_OPERATIONS.SOFT_DELETE).toBe('soft_delete');
    });
  });

  describe('LOG_LEVELS', () => {
    test('should have required log levels', () => {
      expect(LOG_LEVELS).toHaveProperty('ERROR');
      expect(LOG_LEVELS).toHaveProperty('WARN');
      expect(LOG_LEVELS).toHaveProperty('INFO');
      expect(LOG_LEVELS).toHaveProperty('DEBUG');
    });

    test('should have correct values', () => {
      expect(LOG_LEVELS.ERROR).toBe('error');
      expect(LOG_LEVELS.WARN).toBe('warn');
      expect(LOG_LEVELS.INFO).toBe('info');
      expect(LOG_LEVELS.DEBUG).toBe('debug');
    });
  });

  describe('ENVIRONMENTS', () => {
    test('should have required environments', () => {
      expect(ENVIRONMENTS).toHaveProperty('DEVELOPMENT');
      expect(ENVIRONMENTS).toHaveProperty('STAGING');
      expect(ENVIRONMENTS).toHaveProperty('PRODUCTION');
      expect(ENVIRONMENTS).toHaveProperty('TEST');
    });

    test('should have correct values', () => {
      expect(ENVIRONMENTS.DEVELOPMENT).toBe('development');
      expect(ENVIRONMENTS.STAGING).toBe('staging');
      expect(ENVIRONMENTS.PRODUCTION).toBe('production');
      expect(ENVIRONMENTS.TEST).toBe('test');
    });
  });

  describe('TIME_UNITS', () => {
    test('should have required time units', () => {
      expect(TIME_UNITS).toHaveProperty('SECONDS');
      expect(TIME_UNITS).toHaveProperty('MINUTES');
      expect(TIME_UNITS).toHaveProperty('HOURS');
      expect(TIME_UNITS).toHaveProperty('DAYS');
      expect(TIME_UNITS).toHaveProperty('WEEKS');
      expect(TIME_UNITS).toHaveProperty('MONTHS');
      expect(TIME_UNITS).toHaveProperty('YEARS');
    });

    test('should have correct values', () => {
      expect(TIME_UNITS.SECONDS).toBe('seconds');
      expect(TIME_UNITS.MINUTES).toBe('minutes');
      expect(TIME_UNITS.HOURS).toBe('hours');
      expect(TIME_UNITS.DAYS).toBe('days');
      expect(TIME_UNITS.WEEKS).toBe('weeks');
      expect(TIME_UNITS.MONTHS).toBe('months');
      expect(TIME_UNITS.YEARS).toBe('years');
    });
  });

  describe('DATE_FORMATS', () => {
    test('should have required date formats', () => {
      expect(DATE_FORMATS).toHaveProperty('ISO');
      expect(DATE_FORMATS).toHaveProperty('SHORT');
      expect(DATE_FORMATS).toHaveProperty('LONG');
      expect(DATE_FORMATS).toHaveProperty('CUSTOM');
    });

    test('should have correct values', () => {
      expect(DATE_FORMATS.ISO).toBe('iso');
      expect(DATE_FORMATS.SHORT).toBe('short');
      expect(DATE_FORMATS.LONG).toBe('long');
      expect(DATE_FORMATS.CUSTOM).toBe('custom');
    });
  });

  describe('FILE_TYPES', () => {
    test('should have required file types', () => {
      expect(FILE_TYPES).toHaveProperty('IMAGE');
      expect(FILE_TYPES).toHaveProperty('DOCUMENT');
      expect(FILE_TYPES).toHaveProperty('VIDEO');
      expect(FILE_TYPES).toHaveProperty('AUDIO');
      expect(FILE_TYPES).toHaveProperty('ARCHIVE');
    });

    test('should have correct values', () => {
      expect(FILE_TYPES.IMAGE).toBe('image');
      expect(FILE_TYPES.DOCUMENT).toBe('document');
      expect(FILE_TYPES.VIDEO).toBe('video');
      expect(FILE_TYPES.AUDIO).toBe('audio');
      expect(FILE_TYPES.ARCHIVE).toBe('archive');
    });
  });

  describe('PERMISSIONS', () => {
    test('should have required permissions', () => {
      expect(PERMISSIONS).toHaveProperty('READ');
      expect(PERMISSIONS).toHaveProperty('WRITE');
      expect(PERMISSIONS).toHaveProperty('DELETE');
      expect(PERMISSIONS).toHaveProperty('ADMIN');
    });

    test('should have correct values', () => {
      expect(PERMISSIONS.READ).toBe('read');
      expect(PERMISSIONS.WRITE).toBe('write');
      expect(PERMISSIONS.DELETE).toBe('delete');
      expect(PERMISSIONS.ADMIN).toBe('admin');
    });
  });
});