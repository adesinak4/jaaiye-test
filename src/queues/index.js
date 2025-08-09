const emailQueue = require('./emailQueue');
const reportQueue = require('./reportQueue');
const notificationQueue = require('./notificationQueue');

const syncQueue = {
  jobs: [],
  add(job) {
    this.jobs.push({ ...job, enqueuedAt: new Date() });
  },
  drain() {
    this.jobs = [];
  },
  getJobs() {
    return this.jobs;
  }
};

module.exports = {
  emailQueue,
  reportQueue,
  notificationQueue,
  syncQueue
};