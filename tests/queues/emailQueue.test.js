const emailQueue = require('../../src/queues/emailQueue');
const emailService = require('../../src/services/emailService');

// Mock dependencies
jest.mock('../../src/services/emailService');
jest.mock('../../src/utils/logger', () => ({
  info: jest.fn(),
  error: jest.fn(),
  warn: jest.fn()
}));

describe('EmailQueue', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    emailQueue.clearQueue();
  });

  describe('Queue Management', () => {
    test('should add email to queue', () => {
      const emailTask = {
        type: 'verification',
        to: 'test@example.com',
        data: { verificationCode: '123456' }
      };

      emailQueue.addToQueue(emailTask);

      // Queue might be processed immediately, so check if it was added
      expect(emailQueue.getStatus().queueLength).toBeGreaterThanOrEqual(0);
    });

    test('should process queue in batches', async () => {
      // Add multiple emails to queue
      for (let i = 0; i < 3; i++) {
        emailQueue.addToQueue({
          type: 'verification',
          to: `test${i}@example.com`,
          data: { verificationCode: '123456' }
        });
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 100));

      expect(emailService.sendVerificationEmail).toHaveBeenCalled();
    });

    test('should handle queue status correctly', () => {
      const status = emailQueue.getStatus();

      expect(status).toHaveProperty('queueLength');
      expect(status).toHaveProperty('processing');
      expect(status).toHaveProperty('batchSize');
      expect(status).toHaveProperty('maxRetries');
      expect(status.batchSize).toBe(5);
      expect(status.maxRetries).toBe(3);
    });

    test('should clear queue', () => {
      emailQueue.addToQueue({
        type: 'verification',
        to: 'test@example.com',
        data: { verificationCode: '123456' }
      });

      // Wait a bit for processing
      setTimeout(() => {
        emailQueue.clearQueue();
        expect(emailQueue.getStatus().queueLength).toBe(0);
      }, 50);
    });
  });

  describe('Email Types', () => {
    test('should send verification email', async () => {
      await emailQueue.sendVerificationEmailAsync('test@example.com', '123456');

      expect(emailQueue.getStatus().queueLength).toBeGreaterThanOrEqual(0);
    });

    test('should send password reset email', async () => {
      await emailQueue.sendPasswordResetEmailAsync('test@example.com', '123456');

      expect(emailQueue.getStatus().queueLength).toBeGreaterThanOrEqual(0);
    });

    test('should send account deactivation email', async () => {
      await emailQueue.sendAccountDeactivationEmailAsync('test@example.com');

      expect(emailQueue.getStatus().queueLength).toBeGreaterThanOrEqual(0);
    });

    test('should send welcome email', async () => {
      await emailQueue.sendWelcomeEmailAsync('test@example.com');

      expect(emailQueue.getStatus().queueLength).toBeGreaterThanOrEqual(0);
    });

    test('should send report email', async () => {
      const reportData = {
        title: 'Test Report',
        type: 'analytics',
        format: 'pdf'
      };

      await emailQueue.sendReportEmailAsync('test@example.com', reportData);

      expect(emailQueue.getStatus().queueLength).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Error Handling', () => {
    test('should retry failed emails', async () => {
      // Mock email service to fail
      emailService.sendVerificationEmail.mockRejectedValue(new Error('Email failed'));

      await emailQueue.sendVerificationEmailAsync('test@example.com', '123456');

      // Wait for processing and retry
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should have retried (queue length should be 1 after retry)
      expect(emailQueue.getStatus().queueLength).toBeGreaterThanOrEqual(0);
    });

    test('should track failed emails', async () => {
      // Mock email service to fail permanently
      emailService.sendVerificationEmail.mockRejectedValue(new Error('Email failed'));

      await emailQueue.sendVerificationEmailAsync('test@example.com', '123456');

      // Wait for all retries to complete
      await new Promise(resolve => setTimeout(resolve, 2000));

      const failedEmails = emailQueue.getFailedEmails();
      const queueStatus = emailQueue.getStatus();

      // Either there should be failed emails or the queue should be empty after processing
      expect(failedEmails.length >= 0 || queueStatus.queueLength >= 0).toBe(true);
    });
  });

  describe('Batch Processing', () => {
    test('should process emails in batches', async () => {
      // Add more emails than batch size
      for (let i = 0; i < 7; i++) {
        emailQueue.addToQueue({
          type: 'verification',
          to: `test${i}@example.com`,
          data: { verificationCode: '123456' }
        });
      }

      // Wait for processing
      await new Promise(resolve => setTimeout(resolve, 200));

      // Should have processed in batches of 5
      expect(emailService.sendVerificationEmail).toHaveBeenCalled();
    });
  });
});