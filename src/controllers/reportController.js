const Report = require('../models/Report');
const Event = require('../models/Event');
const Calendar = require('../models/Calendar');
const User = require('../models/User');
const { sendEmail } = require('../services/emailService');
const { sendNotification } = require('../services/notificationService');
const { NotFoundError, BadRequestError } = require('../utils/errors');

// Create a new report
exports.createReport = async (req, res, next) => {
  const {
    title,
    type,
    filters,
    schedule,
    recipients,
    format
  } = req.body;

  // Validate recipients
  for (const recipient of recipients) {
    const user = await User.findById(recipient.user);
    if (!user) {
      throw new BadRequestError(`Recipient ${recipient.user} not found`);
    }
  }

  // Create report
  const report = await Report.create({
    title,
    type,
    filters,
    schedule,
    recipients,
    format,
    createdBy: req.user._id
  });

  // Schedule first generation if needed
  if (schedule) {
    await scheduleNextGeneration(report);
  }

  res.status(201).json(report);
};

// Get all reports for user
exports.getReports = async (req, res, next) => {
  const reports = await Report.find({ createdBy: req.user._id })
    .sort({ createdAt: -1 });

  res.json(reports);
};

// Get report by ID
exports.getReport = async (req, res, next) => {
  const report = await Report.findOne({
    _id: req.params.id,
    createdBy: req.user._id
  });

  if (!report) {
    throw new NotFoundError('Report not found');
  }

  res.json(report);
};

// Update report
exports.updateReport = async (req, res, next) => {
  const report = await Report.findOne({
    _id: req.params.id,
    createdBy: req.user._id
  });

  if (!report) {
    throw new NotFoundError('Report not found');
  }

  // Update report
  Object.assign(report, req.body);
  await report.save();

  // Reschedule if needed
  if (report.schedule) {
    await scheduleNextGeneration(report);
  }

  res.json(report);
};

// Delete report
exports.deleteReport = async (req, res, next) => {
  const report = await Report.findOneAndDelete({
    _id: req.params.id,
    createdBy: req.user._id
  });

  if (!report) {
    throw new NotFoundError('Report not found');
  }

  res.json({ message: 'Report deleted successfully' });
};

// Generate report
exports.generateReport = async (req, res, next) => {
  const report = await Report.findOne({
    _id: req.params.id,
    createdBy: req.user._id
  });

  if (!report) {
    throw new NotFoundError('Report not found');
  }

  // Generate report data
  const reportData = await generateReportData(report);

  // Update last generated timestamp
  report.lastGenerated = new Date();
  await report.save();

  // Send to recipients
  await sendReportToRecipients(report, reportData);

  res.json({
    message: 'Report generated and sent successfully',
    data: reportData
  });
};

// Helper functions
async function scheduleNextGeneration(report) {
  if (!report.schedule) return;

  const now = new Date();
  let nextSend;

  switch (report.schedule.frequency) {
    case 'daily':
      nextSend = new Date(now.setDate(now.getDate() + 1));
      break;
    case 'weekly':
      nextSend = new Date(now.setDate(now.getDate() + 7));
      break;
    case 'monthly':
      nextSend = new Date(now.setMonth(now.getMonth() + 1));
      break;
  }

  report.schedule.nextSend = nextSend;
  await report.save();
}

async function generateReportData(report) {
  const { type, filters } = report;
  let data;

  switch (type) {
    case 'event':
      data = await generateEventReport(filters);
      break;
    case 'participant':
      data = await generateParticipantReport(filters);
      break;
    case 'calendar':
      data = await generateCalendarReport(filters);
      break;
  }

  return data;
}

async function generateEventReport(filters) {
  const query = buildEventQuery(filters);
  const events = await Event.find(query)
    .populate('participants.user', 'name email')
    .populate('calendar', 'name');

  return {
    totalEvents: events.length,
    eventsByType: groupEventsByType(events),
    eventsByStatus: groupEventsByStatus(events),
    upcomingEvents: getUpcomingEvents(events),
    pastEvents: getPastEvents(events),
    participantStats: calculateParticipantStats(events)
  };
}

async function generateParticipantReport(filters) {
  const query = buildEventQuery(filters);
  const events = await Event.find(query)
    .populate('participants.user', 'name email');

  const participants = new Map();
  events.forEach(event => {
    event.participants.forEach(participant => {
      const userId = participant.user._id.toString();
      if (!participants.has(userId)) {
        participants.set(userId, {
          user: participant.user,
          events: [],
          stats: {
            accepted: 0,
            declined: 0,
            pending: 0
          }
        });
      }
      const userData = participants.get(userId);
      userData.events.push(event);
      userData.stats[participant.status]++;
    });
  });

  return Array.from(participants.values()).map(data => ({
    user: data.user,
    totalEvents: data.events.length,
    stats: data.stats,
    responseRate: calculateResponseRate(data.stats),
    averageResponseTime: calculateAverageResponseTime(data.events, data.user._id)
  }));
}

async function generateCalendarReport(filters) {
  const calendars = await Calendar.find({
    _id: { $in: filters.calendars }
  }).populate('owner', 'name email');

  const events = await Event.find({
    calendar: { $in: filters.calendars }
  }).populate('participants.user', 'name email');

  return {
    calendars: calendars.map(calendar => ({
      id: calendar._id,
      name: calendar.name,
      owner: calendar.owner,
      totalEvents: events.filter(e => e.calendar.toString() === calendar._id.toString()).length,
      stats: calculateCalendarStats(events, calendar._id)
    })),
    overallStats: calculateOverallStats(events)
  };
}

function buildEventQuery(filters) {
  const query = {};

  if (filters.dateRange) {
    query.startTime = {
      $gte: new Date(filters.dateRange.start),
      $lte: new Date(filters.dateRange.end)
    };
  }

  if (filters.status) {
    query['participants.status'] = { $in: filters.status };
  }

  if (filters.eventTypes) {
    query.type = { $in: filters.eventTypes };
  }

  if (filters.participants) {
    query['participants.user'] = { $in: filters.participants };
  }

  if (filters.calendars) {
    query.calendar = { $in: filters.calendars };
  }

  return query;
}

function groupEventsByType(events) {
  const groups = {};
  events.forEach(event => {
    const type = event.type || 'other';
    groups[type] = (groups[type] || 0) + 1;
  });
  return groups;
}

function groupEventsByStatus(events) {
  const groups = {
    upcoming: 0,
    inProgress: 0,
    completed: 0,
    cancelled: 0
  };

  const now = new Date();
  events.forEach(event => {
    if (event.status === 'cancelled') {
      groups.cancelled++;
    } else if (event.endTime < now) {
      groups.completed++;
    } else if (event.startTime <= now && event.endTime >= now) {
      groups.inProgress++;
    } else {
      groups.upcoming++;
    }
  });

  return groups;
}

function getUpcomingEvents(events) {
  const now = new Date();
  return events
    .filter(event => event.startTime > now)
    .sort((a, b) => a.startTime - b.startTime)
    .slice(0, 5);
}

function getPastEvents(events) {
  const now = new Date();
  return events
    .filter(event => event.endTime < now)
    .sort((a, b) => b.endTime - a.endTime)
    .slice(0, 5);
}

function calculateParticipantStats(events) {
  const stats = {
    total: 0,
    accepted: 0,
    declined: 0,
    pending: 0
  };

  events.forEach(event => {
    event.participants.forEach(participant => {
      stats.total++;
      stats[participant.status]++;
    });
  });

  return stats;
}

function calculateResponseRate(stats) {
  const total = stats.accepted + stats.declined + stats.pending;
  return total > 0 ? ((stats.accepted + stats.declined) / total) * 100 : 0;
}

function calculateAverageResponseTime(events, userId) {
  const responseTimes = events
    .filter(event => {
      const participant = event.participants.find(p => p.user._id.toString() === userId.toString());
      return participant && participant.status === 'accepted';
    })
    .map(event => {
      const participant = event.participants.find(p => p.user._id.toString() === userId.toString());
      return new Date(participant.updatedAt) - new Date(event.createdAt);
    });

  if (responseTimes.length === 0) return 0;
  return responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
}

function calculateCalendarStats(events, calendarId) {
  const calendarEvents = events.filter(e => e.calendar.toString() === calendarId.toString());
  return {
    totalEvents: calendarEvents.length,
    eventsByType: groupEventsByType(calendarEvents),
    eventsByStatus: groupEventsByStatus(calendarEvents),
    participantStats: calculateParticipantStats(calendarEvents)
  };
}

function calculateOverallStats(events) {
  return {
    totalEvents: events.length,
    totalParticipants: events.reduce((sum, e) => sum + e.participants.length, 0),
    eventsByType: groupEventsByType(events),
    eventsByStatus: groupEventsByStatus(events),
    participantStats: calculateParticipantStats(events)
  };
}

async function sendReportToRecipients(report, data) {
  for (const recipient of report.recipients) {
    const user = await User.findById(recipient.user);
    if (!user) continue;

    if (recipient.type === 'email') {
      await sendEmail({
        to: user.email,
        subject: `Report: ${report.title}`,
        html: formatReportForEmail(report, data)
      });
    } else {
      await sendNotification({
        userId: recipient.user,
        title: 'New Report Available',
        body: `Report "${report.title}" has been generated`,
        data: {
          type: 'report_generated',
          reportId: report._id
        }
      });
    }
  }
}

function formatReportForEmail(report, data) {
  // Implement email formatting based on report type and format
  // This is a simplified version
  return `
    <h1>${report.title}</h1>
    <p>Generated on ${new Date().toLocaleString()}</p>
    <pre>${JSON.stringify(data, null, 2)}</pre>
  `;
}