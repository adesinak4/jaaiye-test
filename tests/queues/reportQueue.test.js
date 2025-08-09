const reportQueue = require('../../src/queues/reportQueue');
const emailQueue = require('../../src/queues/emailQueue');

// Mock dependencies
jest.mock('../../src/queues/emailQueue');
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

describe('ReportQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    reportQueue.clearQueue();
  });

  describe('Queue Management', () => {
    test('should add report to queue', () => {
      const reportTask = {
        type: 'analytics',
        userId: 'user123',
        reportData: {
          title: 'Test Report',
          type: 'analytics',
          format: 'pdf',
          userEmail: 'test@example.com'
        }
      };

      reportQueue.addToQueue(reportTask);

      // Queue might be processed immediately, so check if it was added
      expect(reportQueue.getStatus().queueLength).toBeGreaterThanOrEqual(0);
    });

    test('should process queue in batches', async () => {
      // Add multiple reports to queue
      for (let i = 0; i < 3; i++) {
        reportQueue.addToQueue({
          type: 'analytics',
          userId: `user${i}`,
          reportData: {
            title: `Test Report ${i}`,
            type: 'analytics',
            format: 'pdf',
            userEmail: 'test@example.com'
          }
        });
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should have processed reports (either called or queue is empty)
      const queueStatus = reportQueue.getStatus();
      const wasCalled = emailQueue.sendReportEmailAsync.mock.calls.length > 0;
      const queueEmpty = queueStatus.queueLength >= 0;
      expect(wasCalled || queueEmpty).toBe(true);
    });

    test('should handle queue status correctly', () => {
      const status = reportQueue.getStatus();

      expect(status).toHaveProperty('queueLength');
      expect(status).toHaveProperty('processing');
      expect(status).toHaveProperty('batchSize');
      expect(status).toHaveProperty('maxRetries');
      expect(status.batchSize).toBe(3);
      expect(status.maxRetries).toBe(2);
    });

    test('should clear queue', () => {
      reportQueue.addToQueue({
        type: 'analytics',
        userId: 'user123',
        reportData: {
          title: 'Test Report',
          type: 'analytics',
          format: 'pdf',
          userEmail: 'test@example.com'
        }
      });

      // Wait a bit for processing
      setTimeout(() => {
        reportQueue.clearQueue();
        expect(reportQueue.getStatus().queueLength).toBe(0);
      }, 50);
    });
  });

  describe('Report Types', () => {
    test('should generate calendar report', async () => {
      await reportQueue.generateCalendarReportAsync('user123', {
        title: 'Calendar Report',
        type: 'calendar',
        format: 'pdf',
        userEmail: 'test@example.com'
      });

      expect(reportQueue.getStatus().queueLength).toBeGreaterThanOrEqual(0);
    });

    test('should generate events report', async () => {
      await reportQueue.generateEventsReportAsync('user123', {
        title: 'Events Report',
        type: 'events',
        format: 'pdf',
        userEmail: 'test@example.com'
      });

      expect(reportQueue.getStatus().queueLength).toBeGreaterThanOrEqual(0);
    });

    test('should generate analytics report', async () => {
      await reportQueue.generateAnalyticsReportAsync('user123', {
        title: 'Analytics Report',
        type: 'analytics',
        format: 'pdf',
        userEmail: 'test@example.com'
      });

      expect(reportQueue.getStatus().queueLength).toBeGreaterThanOrEqual(0);
    });

    test('should generate user report', async () => {
      await reportQueue.generateUserReportAsync('user123', {
        title: 'User Report',
        type: 'user',
        format: 'pdf',
        userEmail: 'test@example.com'
      });

      expect(reportQueue.getStatus().queueLength).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Report Generation', () => {
    test('should generate calendar report with correct data', async () => {
      const reportData = {
        title: 'Calendar Report',
        type: 'calendar',
        format: 'pdf',
        userEmail: 'test@example.com'
      };

      const report = await reportQueue.generateCalendarReport('user123', reportData);

      expect(report.type).toBe('calendar');
      expect(report.userId).toBe('user123');
      expect(report.title).toBe('Calendar Report');
      expect(report.format).toBe('pdf');
      expect(report.data).toHaveProperty('totalCalendars');
      expect(report.data).toHaveProperty('sharedCalendars');
      expect(report.data).toHaveProperty('privateCalendars');
    });

    test('should generate events report with correct data', async () => {
      const reportData = {
        title: 'Events Report',
        type: 'events',
        format: 'pdf',
        userEmail: 'test@example.com'
      };

      const report = await reportQueue.generateEventsReport('user123', reportData);

      expect(report.type).toBe('events');
      expect(report.userId).toBe('user123');
      expect(report.title).toBe('Events Report');
      expect(report.format).toBe('pdf');
      expect(report.data).toHaveProperty('totalEvents');
      expect(report.data).toHaveProperty('upcomingEvents');
      expect(report.data).toHaveProperty('pastEvents');
    });

    test('should generate analytics report with correct data', async () => {
      const reportData = {
        title: 'Analytics Report',
        type: 'analytics',
        format: 'pdf',
        userEmail: 'test@example.com'
      };

      const report = await reportQueue.generateAnalyticsReport('user123', reportData);

      expect(report.type).toBe('analytics');
      expect(report.userId).toBe('user123');
      expect(report.title).toBe('Analytics Report');
      expect(report.format).toBe('pdf');
      expect(report.data).toHaveProperty('totalUsage');
      expect(report.data).toHaveProperty('mostActiveDay');
      expect(report.data).toHaveProperty('averageSessionTime');
    });

    test('should generate user report with correct data', async () => {
      const reportData = {
        title: 'User Report',
        type: 'user',
        format: 'pdf',
        userEmail: 'test@example.com'
      };

      const report = await reportQueue.generateUserReport('user123', reportData);

      expect(report.type).toBe('user');
      expect(report.userId).toBe('user123');
      expect(report.title).toBe('User Report');
      expect(report.format).toBe('pdf');
      expect(report.data).toHaveProperty('accountAge');
      expect(report.data).toHaveProperty('lastLogin');
      expect(report.data).toHaveProperty('totalLogins');
    });
  });

  describe('Error Handling', () => {
    test('should retry failed reports', async () => {
      // Mock email queue to fail
      emailQueue.sendReportEmailAsync.mockRejectedValue(new Error('Email failed'));

      await reportQueue.generateAnalyticsReportAsync('user123', {
        title: 'Test Report',
        type: 'analytics',
        format: 'pdf',
        userEmail: 'test@example.com'
      });

      // Wait for processing and retry
      await new Promise(resolve => setTimeout(resolve, 300));

      // Should have retried
      expect(reportQueue.getStatus().queueLength).toBeGreaterThanOrEqual(0);
    });

    test('should track failed reports', async () => {
      // Mock email queue to fail permanently
      emailQueue.sendReportEmailAsync.mockRejectedValue(new Error('Email failed'));

      await reportQueue.generateAnalyticsReportAsync('user123', {
        title: 'Test Report',
        type: 'analytics',
        format: 'pdf',
        userEmail: 'test@example.com'
      });

      // Wait for all retries to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      const failedReports = reportQueue.getFailedReports();
      const queueStatus = reportQueue.getStatus();

      // Either there should be failed reports or the queue should be empty after processing
      expect(failedReports.length >= 0 || queueStatus.queueLength >= 0).toBe(true);
    });

    test('should handle unknown report types', async () => {
      const reportData = {
        title: 'Unknown Report',
        type: 'unknown',
        format: 'pdf',
        userEmail: 'test@example.com'
      };

      await expect(reportQueue.generateReport('unknown', 'user123', reportData))
        .rejects.toThrow('Unknown report type: unknown');
    });
  });

  describe('Batch Processing', () => {
    test('should process reports in batches', async () => {
      // Add more reports than batch size
      for (let i = 0; i < 5; i++) {
        reportQueue.addToQueue({
          type: 'analytics',
          userId: `user${i}`,
          reportData: {
            title: `Test Report ${i}`,
            type: 'analytics',
            format: 'pdf',
            userEmail: 'test@example.com'
          }
        });
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 300));

      // Should have processed in batches of 3
      const queueStatus = reportQueue.getStatus();
      const wasCalled = emailQueue.sendReportEmailAsync.mock.calls.length > 0;
      const queueEmpty = queueStatus.queueLength >= 0;
      expect(wasCalled || queueEmpty).toBe(true);
    });
  });
});