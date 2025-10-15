const logger = require('../utils/logger');
const emailService = require('../services/emailService');

class EmailQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.batchSize = 5; // Process 5 emails at a time
    this.batchTimeout = 2000; // 2 seconds
    this.batchTimer = null;
    this.maxRetries = 3;
  }

  // Add email to queue (fire-and-forget)
  addToQueue(emailTask) {
    this.queue.push({
      ...emailTask,
      retries: 0,
      createdAt: new Date()
    });

    // Start processing if not already running
    if (!this.processing) {
      this.processQueue();
    }

    // Set batch timeout
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
    }

    this.batchTimer = setTimeout(() => {
      this.processQueue();
    }, this.batchTimeout);

    logger.info('Email added to queue', {
      type: emailTask.type,
      to: emailTask.to,
      queueLength: this.queue.length
    });
  }

  // Process queue in batches
  async processQueue() {
    if (this.processing || this.queue.length === 0) {
      return;
    }

    this.processing = true;

    try {
      // Process in batches
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.batchSize);

        // Process batch concurrently
        const promises = batch.map(task => this.executeEmailTask(task));
        await Promise.allSettled(promises);
      }
    } catch (error) {
      logger.error('Error processing email queue:', error);
    } finally {
      this.processing = false;

      // If more items were added while processing, continue
      if (this.queue.length > 0) {
        setImmediate(() => this.processQueue());
      }
    }
  }

  // Execute individual email task
  async executeEmailTask(task) {
    try {
      const { type, to, data, retries } = task;

      logger.info('Processing email task', {
        type,
        to,
        retries,
        queueLength: this.queue.length
      });

      switch (type) {
        case 'verification':
          await emailService.sendVerificationEmail(to, data.verificationCode);
          break;
        case 'passwordReset':
          await emailService.sendPasswordResetEmail(to, data.resetCode);
          break;
        case 'accountDeactivation':
          await emailService.sendAccountDeactivationEmail(to);
          break;
        case 'accountReactivation':
          await emailService.sendAccountReactivatedEmail(to);
          break;
        case 'welcome':
          await emailService.sendWelcomeEmail(to);
          break;
        case 'report':
          await emailService.sendReportEmail(to, data.reportData);
          break;
        case 'ticket':
          await emailService.sendPaymentConfirmationEmail(to, data.ticketData);
          break;
        default:
          logger.warn(`Unknown email type: ${type}`);
          return;
      }

      logger.info('Email sent successfully', {
        type,
        to,
        retries
      });
    } catch (error) {
      logger.error('Email task failed', {
        type: task.type,
        to: task.to,
        error: error.message,
        retries: task.retries
      });

      // Retry logic
      if (task.retries < this.maxRetries) {
        task.retries++;
        task.retryAt = new Date(Date.now() + Math.pow(2, task.retries) * 1000); // Exponential backoff

        // Add back to queue for retry
        this.queue.push(task);

        logger.info('Email task queued for retry', {
          type: task.type,
          to: task.to,
          retries: task.retries,
          retryAt: task.retryAt
        });
      } else {
        logger.error('Email task failed permanently', {
          type: task.type,
          to: task.to,
          maxRetries: this.maxRetries
        });
      }
    }
  }

  // Convenience methods for different email types
  async sendVerificationEmailAsync(to, verificationCode) {
    this.addToQueue({
      type: 'verification',
      to,
      data: { verificationCode }
    });
  }

  async sendPasswordResetEmailAsync(to, resetCode) {
    this.addToQueue({
      type: 'passwordReset',
      to,
      data: { resetCode }
    });
  }

  async sendAccountDeactivationEmailAsync(to) {
    this.addToQueue({
      type: 'accountDeactivation',
      to
    });
  }

  async sendAccountReactivatedEmailAsync(to) {
    this.addToQueue({
      type: 'accountReactivation',
      to
    });
  }

  async sendWelcomeEmailAsync(to) {
    this.addToQueue({
      type: 'welcome',
      to
    });
  }

  async sendReportEmailAsync(to, reportData) {
    this.addToQueue({
      type: 'report',
      to,
      data: { reportData }
    });
  }

  async sendPaymentConfirmationEmailAsync(to, ticketData) {
    this.addToQueue({
      type: 'ticket',
      to,
      data: { ticketData }
    });
  }

  // Get queue status
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      batchSize: this.batchSize,
      maxRetries: this.maxRetries
    };
  }

  // Clear queue (for testing)
  clearQueue() {
    this.queue = [];
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }
  }

  // Get failed emails (for monitoring)
  getFailedEmails() {
    return this.queue.filter(task => task.retries >= this.maxRetries);
  }
}

module.exports = new EmailQueue();