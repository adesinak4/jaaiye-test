const logger = require('../utils/logger');
const emailQueue = require('./emailQueue');

class ReportQueue {
  constructor() {
    this.queue = [];
    this.processing = false;
    this.batchSize = 3; // Process 3 reports at a time (more resource intensive)
    this.batchTimeout = 5000; // 5 seconds
    this.batchTimer = null;
    this.maxRetries = 2;
  }

  // Add report generation to queue (fire-and-forget)
  addToQueue(reportTask) {
    this.queue.push({
      ...reportTask,
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

    logger.info('Report generation added to queue', {
      type: reportTask.type,
      userId: reportTask.userId,
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
        const promises = batch.map(task => this.executeReportTask(task));
        await Promise.allSettled(promises);
      }
    } catch (error) {
      logger.error('Error processing report queue:', error);
    } finally {
      this.processing = false;

      // If more items were added while processing, continue
      if (this.queue.length > 0) {
        setImmediate(() => this.processQueue());
      }
    }
  }

  // Execute individual report task
  async executeReportTask(task) {
    try {
      const { type, userId, reportData, retries } = task;

      logger.info('Processing report task', {
        type,
        userId,
        reportTitle: reportData.title,
        retries,
        queueLength: this.queue.length
      });

      // Generate report based on type
      const report = await this.generateReport(type, userId, reportData);

      // Send email notification
      await emailQueue.sendReportEmailAsync(reportData.userEmail, {
        title: reportData.title,
        type: reportData.type,
        format: reportData.format
      });

      logger.info('Report generated successfully', {
        type,
        userId,
        reportTitle: reportData.title,
        retries
      });

      return report;
    } catch (error) {
      logger.error('Report task failed', {
        type: task.type,
        userId: task.userId,
        error: error.message,
        retries: task.retries
      });

      // Retry logic
      if (task.retries < this.maxRetries) {
        task.retries++;
        task.retryAt = new Date(Date.now() + Math.pow(2, task.retries) * 5000); // Exponential backoff

        // Add back to queue for retry
        this.queue.push(task);

        logger.info('Report task queued for retry', {
          type: task.type,
          userId: task.userId,
          retries: task.retries,
          retryAt: task.retryAt
        });
      } else {
        logger.error('Report task failed permanently', {
          type: task.type,
          userId: task.userId,
          maxRetries: this.maxRetries
        });
      }
    }
  }

  // Generate different types of reports
  async generateReport(type, userId, reportData) {
    switch (type) {
      case 'calendar':
        return await this.generateCalendarReport(userId, reportData);
      case 'events':
        return await this.generateEventsReport(userId, reportData);
      case 'analytics':
        return await this.generateAnalyticsReport(userId, reportData);
      case 'user':
        return await this.generateUserReport(userId, reportData);
      default:
        throw new Error(`Unknown report type: ${type}`);
    }
  }

  // Calendar report generation
  async generateCalendarReport(userId, reportData) {
    // Simulate report generation
    await new Promise(resolve => setTimeout(resolve, 2000)); // 2 second delay

    return {
      id: `calendar_${Date.now()}`,
      type: 'calendar',
      userId,
      title: reportData.title,
      format: reportData.format,
      generatedAt: new Date(),
      data: {
        totalCalendars: 5,
        sharedCalendars: 3,
        privateCalendars: 2
      }
    };
  }

  // Events report generation
  async generateEventsReport(userId, reportData) {
    // Simulate report generation
    await new Promise(resolve => setTimeout(resolve, 3000)); // 3 second delay

    return {
      id: `events_${Date.now()}`,
      type: 'events',
      userId,
      title: reportData.title,
      format: reportData.format,
      generatedAt: new Date(),
      data: {
        totalEvents: 25,
        upcomingEvents: 8,
        pastEvents: 17,
        averageDuration: '2.5 hours'
      }
    };
  }

  // Analytics report generation
  async generateAnalyticsReport(userId, reportData) {
    // Simulate report generation
    await new Promise(resolve => setTimeout(resolve, 4000)); // 4 second delay

    return {
      id: `analytics_${Date.now()}`,
      type: 'analytics',
      userId,
      title: reportData.title,
      format: reportData.format,
      generatedAt: new Date(),
      data: {
        totalUsage: '45 hours',
        mostActiveDay: 'Wednesday',
        averageSessionTime: '25 minutes',
        topFeatures: ['Calendar View', 'Event Creation', 'Sharing']
      }
    };
  }

  // User report generation
  async generateUserReport(userId, reportData) {
    // Simulate report generation
    await new Promise(resolve => setTimeout(resolve, 1500)); // 1.5 second delay

    return {
      id: `user_${Date.now()}`,
      type: 'user',
      userId,
      title: reportData.title,
      format: reportData.format,
      generatedAt: new Date(),
      data: {
        accountAge: '6 months',
        lastLogin: new Date().toISOString(),
        totalLogins: 45,
        preferences: ['email notifications', 'dark mode']
      }
    };
  }

  // Convenience methods for different report types
  async generateCalendarReportAsync(userId, reportData) {
    this.addToQueue({
      type: 'calendar',
      userId,
      reportData
    });
  }

  async generateEventsReportAsync(userId, reportData) {
    this.addToQueue({
      type: 'events',
      userId,
      reportData
    });
  }

  async generateAnalyticsReportAsync(userId, reportData) {
    this.addToQueue({
      type: 'analytics',
      userId,
      reportData
    });
  }

  async generateUserReportAsync(userId, reportData) {
    this.addToQueue({
      type: 'user',
      userId,
      reportData
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

  // Get failed reports (for monitoring)
  getFailedReports() {
    return this.queue.filter(task => task.retries >= this.maxRetries);
  }
}

module.exports = new ReportQueue();