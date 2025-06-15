const EventAnalytics = require('../models/EventAnalytics');
const Event = require('../models/Event');
const Calendar = require('../models/Calendar');
const User = require('../models/User');
const { NotFoundError, ForbiddenError } = require('../utils/errors');
const logger = require('../utils/logger');

// Track event view
exports.trackEventView = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      logger.error('Event not found', new Error('Event not found'), 404, { eventId: req.params.id });
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    // Check if user has access to the calendar
    const calendar = await Calendar.findById(event.calendar);
    if (!calendar.isPublic &&
        calendar.owner.toString() !== req.user.id &&
        !calendar.sharedWith.some(share => share.user.toString() === req.user.id)) {
      logger.error('Access denied to event', new Error('Access denied'), 403, {
        eventId: req.params.id,
        userId: req.user.id
      });
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    await EventAnalytics.create({
      event: event._id,
      user: req.user.id,
      action: 'view',
      timestamp: new Date()
    });

    res.json({
      success: true,
      message: 'Event view tracked successfully'
    });
  } catch(error) {
    logger.error('Failed to track event view', error, 500, {
      eventId: req.params.id,
      userId: req.user.id
    });
    next(error);
  }
};

// Get event analytics
exports.getEventAnalytics = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      logger.error('Event not found', new Error('Event not found'), 404, { eventId: req.params.id });
      return res.status(404).json({
        success: false,
        error: 'Event not found'
      });
    }

    // Check if user has access to the calendar
    const calendar = await Calendar.findById(event.calendar);
    if (!calendar.isPublic &&
        calendar.owner.toString() !== req.user.id &&
        !calendar.sharedWith.some(share => share.user.toString() === req.user.id)) {
      logger.error('Access denied to event', new Error('Access denied'), 403, {
        eventId: req.params.id,
        userId: req.user.id
      });
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const analytics = await EventAnalytics.aggregate([
      { $match: { event: event._id } },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$user' }
        }
      }
    ]);

    const result = {
      views: 0,
      uniqueViewers: 0,
      shares: 0,
      uniqueSharers: 0
    };

    analytics.forEach(stat => {
      if (stat._id === 'view') {
        result.views = stat.count;
        result.uniqueViewers = stat.uniqueUsers.length;
      } else if (stat._id === 'share') {
        result.shares = stat.count;
        result.uniqueSharers = stat.uniqueUsers.length;
      }
    });

    res.json({
      success: true,
      analytics: result
    });
  } catch(error) {
    logger.error('Failed to get event analytics', error, 500, {
      eventId: req.params.id,
      userId: req.user.id
    });
    next(error);
  }
};

// Get calendar analytics
exports.getCalendarAnalytics = async (req, res, next) => {
  try {
    const calendar = await Calendar.findById(req.params.id);
    if (!calendar) {
      logger.error('Calendar not found', new Error('Calendar not found'), 404, { calendarId: req.params.id });
      return res.status(404).json({
        success: false,
        error: 'Calendar not found'
      });
    }

    if (!calendar.isPublic &&
        calendar.owner.toString() !== req.user.id &&
        !calendar.sharedWith.some(share => share.user.toString() === req.user.id)) {
      logger.error('Access denied to calendar', new Error('Access denied'), 403, {
        calendarId: req.params.id,
        userId: req.user.id
      });
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const events = await Event.find({ calendar: calendar._id });
    const eventIds = events.map(event => event._id);

    const analytics = await EventAnalytics.aggregate([
      { $match: { event: { $in: eventIds } } },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$user' }
        }
      }
    ]);

    const result = {
      totalEvents: events.length,
      totalViews: 0,
      uniqueViewers: 0,
      totalShares: 0,
      uniqueSharers: 0,
      averageViewsPerEvent: 0
    };

    analytics.forEach(stat => {
      if (stat._id === 'view') {
        result.totalViews = stat.count;
        result.uniqueViewers = stat.uniqueUsers.length;
      } else if (stat._id === 'share') {
        result.totalShares = stat.count;
        result.uniqueSharers = stat.uniqueUsers.length;
      }
    });

    result.averageViewsPerEvent = events.length > 0 ? result.totalViews / events.length : 0;

    res.json({
      success: true,
      analytics: result
    });
  } catch(error) {
    logger.error('Failed to get calendar analytics', error, 500, {
      calendarId: req.params.id,
      userId: req.user.id
    });
    next(error);
  }
};

// Get user analytics
exports.getUserAnalytics = async (req, res, next) => {
  try {
    if (req.params.id !== req.user.id) {
      logger.error('Access denied to user analytics', new Error('Access denied'), 403, {
        requestedUserId: req.params.id,
        userId: req.user.id
      });
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const calendars = await Calendar.find({
      $or: [
        { owner: req.user.id },
        { 'sharedWith.user': req.user.id }
      ]
    });

    const calendarIds = calendars.map(calendar => calendar._id);
    const events = await Event.find({ calendar: { $in: calendarIds } });
    const eventIds = events.map(event => event._id);

    const analytics = await EventAnalytics.aggregate([
      { $match: { event: { $in: eventIds } } },
      {
        $group: {
          _id: '$action',
          count: { $sum: 1 },
          uniqueUsers: { $addToSet: '$user' }
        }
      }
    ]);

    const result = {
      totalCalendars: calendars.length,
      totalEvents: events.length,
      totalViews: 0,
      uniqueViewers: 0,
      totalShares: 0,
      uniqueSharers: 0,
      averageViewsPerEvent: 0
    };

    analytics.forEach(stat => {
      if (stat._id === 'view') {
        result.totalViews = stat.count;
        result.uniqueViewers = stat.uniqueUsers.length;
      } else if (stat._id === 'share') {
        result.totalShares = stat.count;
        result.uniqueSharers = stat.uniqueUsers.length;
      }
    });

    result.averageViewsPerEvent = events.length > 0 ? result.totalViews / events.length : 0;

    res.json({
      success: true,
      analytics: result
    });
  } catch(error) {
    logger.error('Failed to get user analytics', error, 500, { error: error.stack });
    next(error);
  }
};
