const Calendar = require('../models/Calendar');
const Event = require('../models/Event');
const EventParticipant = require('../models/EventParticipant');
const User = require('../models/User');
const logger = require('../utils/logger');

// @desc    Create a new calendar
// @route   POST /api/calendars
// @access  Private
exports.createCalendar = async (req, res, next) => {
  try {
    const { name, description, color, isPublic } = req.body;
    const calendar = await Calendar.create({
      owner: req.user.id,
      name,
      description,
      color,
      isPublic
    });

    res.status(201).json({
      success: true,
      calendar: {
        id: calendar._id,
        name: calendar.name,
        description: calendar.description,
        color: calendar.color,
        isPublic: calendar.isPublic,
        owner: calendar.owner,
        createdAt: calendar.createdAt
      }
    });
  } catch(error) {
    logger.error('Failed to create calendar', error, 500, { error: error.stack });
    next(error);
  }
};

// @desc    Get all calendars for current user
// @route   GET /api/calendars
// @access  Private
exports.getCalendars = async (req, res, next) => {
  try {
    const calendars = await Calendar.find({
      $or: [
        { owner: req.user.id },
        { 'sharedWith.user': req.user.id }
      ]
    });

    res.json({
      success: true,
      calendars: calendars.map(calendar => ({
        id: calendar._id,
        name: calendar.name,
        description: calendar.description,
        color: calendar.color,
        isPublic: calendar.isPublic,
        owner: calendar.owner,
        createdAt: calendar.createdAt
      }))
    });
  } catch(error) {
    logger.error('Failed to get calendars', error, 500, { error: error.stack });
    next(error);
  }
};

// @desc    Get single calendar
// @route   GET /api/calendars/:id
// @access  Private
exports.getCalendar = async (req, res, next) => {
  try {
    const calendar = await Calendar.findById(req.params.id);
    if (!calendar) {
      logger.error('Calendar not found', new Error('Calendar not found'), 404, { calendarId: req.params.id });
      return res.status(404).json({
        success: false,
        error: 'Calendar not found'
      });
    }

    // Check if user has access
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

    res.json({
      success: true,
      calendar: {
        id: calendar._id,
        name: calendar.name,
        description: calendar.description,
        color: calendar.color,
        isPublic: calendar.isPublic,
        owner: calendar.owner,
        sharedWith: calendar.sharedWith,
        createdAt: calendar.createdAt
      }
    });
  } catch(error) {
    logger.error('Failed to get calendar', error, 500, {
      calendarId: req.params.id,
      userId: req.user.id
    });
    next(error);
  }
};

// @desc    Update calendar
// @route   PUT /api/calendars/:id
// @access  Private
exports.updateCalendar = async (req, res, next) => {
  try {
    const calendar = await Calendar.findById(req.params.id);
    if (!calendar) {
      logger.error('Calendar not found', new Error('Calendar not found'), 404, { calendarId: req.params.id });
      return res.status(404).json({
        success: false,
        error: 'Calendar not found'
      });
    }

    // Check if user is owner
    if (calendar.owner.toString() !== req.user.id) {
      logger.error('Access denied to update calendar', new Error('Access denied'), 403, {
        calendarId: req.params.id,
        userId: req.user.id
      });
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const { name, description, color, isPublic } = req.body;
    if (name) calendar.name = name;
    if (description !== undefined) calendar.description = description;
    if (color) calendar.color = color;
    if (isPublic !== undefined) calendar.isPublic = isPublic;

    await calendar.save();

    res.json({
      success: true,
      calendar: {
        id: calendar._id,
        name: calendar.name,
        description: calendar.description,
        color: calendar.color,
        isPublic: calendar.isPublic,
        owner: calendar.owner,
        createdAt: calendar.createdAt
      }
    });
  } catch(error) {
    logger.error('Failed to update calendar', error, 500, {
      calendarId: req.params.id,
      userId: req.user.id
    });
    next(error);
  }
};

// @desc    Delete calendar
// @route   DELETE /api/calendars/:id
// @access  Private
exports.deleteCalendar = async (req, res, next) => {
  try {
    const calendar = await Calendar.findById(req.params.id);
    if (!calendar) {
      logger.error('Calendar not found', new Error('Calendar not found'), 404, { calendarId: req.params.id });
      return res.status(404).json({
        success: false,
        error: 'Calendar not found'
      });
    }

    // Check if user is owner
    if (calendar.owner.toString() !== req.user.id) {
      logger.error('Access denied to delete calendar', new Error('Access denied'), 403, {
        calendarId: req.params.id,
        userId: req.user.id
      });
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    // Delete all events in the calendar
    await Event.deleteMany({ calendar: calendar._id });
    await calendar.remove();

    res.json({
      success: true,
      message: 'Calendar deleted successfully'
    });
  } catch(error) {
    logger.error('Failed to delete calendar', error, 500, {
      calendarId: req.params.id,
      userId: req.user.id
    });
    next(error);
  }
};

// Get events for a calendar
exports.getCalendarEvents = async (req, res, next) => {
  try {
    const { calendarId } = req.params;
    const {
      startDate,
      endDate,
      category,
      status
    } = req.query;

    const userId = req.user.id;

    // Verify calendar access
    const calendar = await Calendar.findById(calendarId);
    if (!calendar) {
      return res.status(404).json({
        success: false,
        message: 'Calendar not found'
      });
    }

    // Check if user has access
    if (!calendar.isPublic &&
        calendar.owner.toString() !== userId &&
        !calendar.sharedWith.some(share => share.user.toString() === userId)) {
      return res.status(403).json({
        success: false,
        message: 'Access denied'
      });
    }

    // Build query
    const query = { calendar: calendarId };

    if (startDate && endDate) {
      query.startTime = { $gte: new Date(startDate) };
      query.endTime = { $lte: new Date(endDate) };
    }

    if (category) {
      query.category = category;
    }

    if (status) {
      query.status = status;
    }

    const events = await Event.find(query)
      .populate({
        path: 'participants',
        select: 'user role status',
        populate: {
          path: 'user',
          select: 'fullName email profilePicture'
        }
      })
      .sort({ startTime: 1 });

    res.status(200).json({
      success: true,
      count: events.length,
      events: events
    });
  } catch(error) {
    logger.error('Failed to get calendar events', error, 500, {
      calendarId: req.params.calendarId,
      userId: req.user.id
    });
    next(error);
  }
};