const logger = require('../utils/logger');
const flutterwaveService = require('../services/flutterwaveService');
const paystackService = require('../services/paystackService');

class PaymentPollingQueue {
  constructor() {
    this.isRunning = false;
    this.intervalId = null;
    this.pollingInterval = 60 * 60 * 1000; // 1 hour in milliseconds
  }

  // Start the polling job
  start() {
    if (this.isRunning) {
      logger.warn('Payment polling queue is already running');
      return;
    }

    this.isRunning = true;
    logger.info('Starting payment polling queue');

    // Run immediately on start
    this.pollPendingTransactions();

    // Schedule recurring polls
    this.intervalId = setInterval(() => {
      this.pollPendingTransactions();
    }, this.pollingInterval);
  }

  // Stop the polling job
  stop() {
    if (!this.isRunning) {
      logger.warn('Payment polling queue is not running');
      return;
    }

    this.isRunning = false;
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.info('Payment polling queue stopped');
  }

  // Poll for pending transactions
  async pollPendingTransactions() {
    try {
      logger.info('Starting payment polling job');

      // Poll Flutterwave pending transactions
      await flutterwaveService.pollPendingTransactions();

      // Poll Paystack pending transactions (if similar function exists)
      // await paystackService.pollPendingTransactions();

      logger.info('Payment polling job completed successfully');
    } catch (error) {
      logger.error('Error in payment polling job:', error);
    }
  }

  // Get queue status
  getStatus() {
    return {
      isRunning: this.isRunning,
      pollingInterval: this.pollingInterval,
      nextPoll: this.isRunning ? new Date(Date.now() + this.pollingInterval) : null
    };
  }

  // Update polling interval
  setPollingInterval(intervalMs) {
    this.pollingInterval = intervalMs;
    logger.info(`Payment polling interval updated to ${intervalMs}ms`);

    // Restart if currently running
    if (this.isRunning) {
      this.stop();
      this.start();
    }
  }
}

module.exports = new PaymentPollingQueue();
