const Report = require('../models/Report');
const Event = require('../models/Event');
const Calendar = require('../models/Calendar');
const User = require('../models/User');
const { reportQueue } = require('../queues');
const logger = require('../utils/logger');
const { asyncHandler } = require('../utils/asyncHandler');
const {
  successResponse,
  errorResponse
} = require('../utils/response');
const {
  NotFoundError,
  BadRequestError,
  ValidationError
} = require('../middleware/errorHandler');

// Create a new report (background processing)
exports.createReport = asyncHandler(async (req, res) => {
  const {
    title,
    type,
    filters,
    schedule,
    recipients,
    format
  } = req.body;

  // Validate required fields
  if (!title || !type || !format) {
    throw new ValidationError('Title, type, and format are required');
  }

  // Validate report type
  const validTypes = ['calendar', 'events', 'analytics', 'user'];
  if (!validTypes.includes(type)) {
    throw new ValidationError(`Invalid report type. Must be one of: ${validTypes.join(', ')}`);
  }

  // Validate format
  const validFormats = ['pdf', 'csv', 'json'];
  if (!validFormats.includes(format)) {
    throw new ValidationError(`Invalid format. Must be one of: ${validFormats.join(', ')}`);
  }

  // Validate recipients
  if (recipients && recipients.length > 0) {
    for (const recipient of recipients) {
      const user = await User.findById(recipient.user);
      if (!user) {
        throw new BadRequestError(`Recipient ${recipient.user} not found`);
      }
    }
  }

  // Create report record
  const report = await Report.create({
    title,
    type,
    filters,
    schedule,
    recipients,
    format,
    createdBy: req.user._id,
    status: 'queued'
  });

  // Add to background processing queue
  await reportQueue.addToQueue({
    type,
    userId: req.user._id,
    reportData: {
      title,
      type,
      format,
      userEmail: req.user.email,
      reportId: report._id
    }
  });

  logger.info('Report creation queued', {
    reportId: report._id,
    type,
    userId: req.user._id,
    title
  });

  return successResponse(res, {
    reportId: report._id,
    status: 'queued',
    estimatedTime: '2-5 minutes'
  }, 201, 'Report generation has been queued. You will receive an email when it\'s ready.');
});

// Get all reports for user
exports.getReports = asyncHandler(async (req, res) => {
  const reports = await Report.find({ createdBy: req.user._id })
    .sort({ createdAt: -1 })
    .select('-data'); // Exclude large data field

  logger.info('Reports retrieved', {
    userId: req.user._id,
    count: reports.length
  });

  return successResponse(res, { reports });
});

// Get report by ID
exports.getReport = asyncHandler(async (req, res) => {
  const report = await Report.findOne({
    _id: req.params.id,
    createdBy: req.user._id
  });

  if (!report) {
    throw new NotFoundError('Report not found');
  }

  logger.info('Report retrieved', {
    reportId: report._id,
    userId: req.user._id,
    status: report.status
  });

  return successResponse(res, { report });
});

// Update report
exports.updateReport = asyncHandler(async (req, res) => {
  const { title, filters, schedule, recipients } = req.body;

  const report = await Report.findOne({
    _id: req.params.id,
    createdBy: req.user._id
  });

  if (!report) {
    throw new NotFoundError('Report not found');
  }

  // Only allow updates if report is not in progress
  if (report.status === 'processing') {
    throw new BadRequestError('Cannot update report while it is being processed');
  }

  // Update fields
  if (title) report.title = title;
  if (filters) report.filters = filters;
  if (schedule) report.schedule = schedule;
  if (recipients) report.recipients = recipients;

  await report.save();

  logger.info('Report updated', {
    reportId: report._id,
    userId: req.user._id,
    updatedFields: Object.keys(req.body)
  });

  return successResponse(res, { report }, 200, 'Report updated successfully');
});

// Delete report
exports.deleteReport = asyncHandler(async (req, res) => {
  const report = await Report.findOne({
    _id: req.params.id,
    createdBy: req.user._id
  });

  if (!report) {
    throw new NotFoundError('Report not found');
  }

  await Report.findByIdAndDelete(req.params.id);

  logger.info('Report deleted', {
    reportId: report._id,
    userId: req.user._id
  });

  return successResponse(res, null, 200, 'Report deleted successfully');
});

// Regenerate report
exports.regenerateReport = asyncHandler(async (req, res) => {
  const report = await Report.findOne({
    _id: req.params.id,
    createdBy: req.user._id
  });

  if (!report) {
    throw new NotFoundError('Report not found');
  }

  // Reset status
  report.status = 'queued';
  report.generatedAt = undefined;
  report.data = undefined;
  await report.save();

  // Add to background processing queue
  await reportQueue.addToQueue({
    type: report.type,
    userId: req.user._id,
    reportData: {
      title: report.title,
      type: report.type,
      format: report.format,
      userEmail: req.user.email,
      reportId: report._id
    }
  });

  logger.info('Report regeneration queued', {
    reportId: report._id,
    userId: req.user._id,
    type: report.type
  });

  return successResponse(res, {
    reportId: report._id,
    status: 'queued',
    estimatedTime: '2-5 minutes'
  }, 200, 'Report regeneration has been queued. You will receive an email when it\'s ready.');
});

// Get report queue status
exports.getQueueStatus = asyncHandler(async (req, res) => {
  const status = reportQueue.getStatus();

  return successResponse(res, { status });
});

// Get failed reports
exports.getFailedReports = asyncHandler(async (req, res) => {
  const failedReports = reportQueue.getFailedReports();

  return successResponse(res, { failedReports });
});