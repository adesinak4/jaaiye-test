const Event = require('../models/Event');
const Calendar = require('../models/Calendar');
const logger = require('../utils/logger');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../utils/errors');
const { sendNotification } = require('../services/notificationService');
const { sendEmail } = require('../services/emailService');

// @desc    Create a new event
// @route   POST /api/events
// @access  Private
exports.createEvent = async (req, res, next) => {
  try {
    const { calendarId, title, description, startTime, endTime, location, isAllDay, recurrence } = req.body;

    // Check if calendar exists and user has access
    const calendar = await Calendar.findById(calendarId);
    if (!calendar) {
      logger.error('Calendar not found', new Error('Calendar not found'), 404, { calendarId });
      return res.status(404).json({
        success: false,
        error: 'Calendar not found'
      });
    }

    if (!calendar.isPublic &&
        calendar.owner.toString() !== req.user.id &&
        !calendar.sharedWith.some(share => share.user.toString() === req.user.id)) {
      logger.error('Access denied to calendar', new Error('Access denied'), 403, {
        calendarId,
        userId: req.user.id
      });
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const event = await Event.create({
      calendar: calendarId,
      title,
      description,
      startTime,
      endTime,
      location,
      isAllDay,
      recurrence,
      creator: req.user.id
    });

    // Send notifications to calendar participants
    if (calendar.sharedWith.length > 0) {
      const notificationPromises = calendar.sharedWith.map(userId =>
        sendNotification({
          userId,
          title: 'New Event Created',
          message: `A new event "${event.title}" has been created in calendar "${calendar.name}"`,
          type: 'event_created',
          data: { eventId: event._id, calendarId }
        })
      );
      await Promise.all(notificationPromises);
    }

    res.status(201).json({
      success: true,
      event: {
        id: event._id,
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        isAllDay: event.isAllDay,
        recurrence: event.recurrence,
        calendar: event.calendar,
        creator: event.creator,
        createdAt: event.createdAt
      }
    });
  } catch(error) {
    logger.error('Failed to create event', error, 500, {
      calendarId: req.body.calendarId,
      userId: req.user.id
    });
    next(error);
  }
};

// @desc    Get single event
// @route   GET /api/events/:id
// @access  Private
exports.getEvent = async (req, res, next) => {
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

    res.json({
      success: true,
      event: {
        id: event._id,
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        isAllDay: event.isAllDay,
        recurrence: event.recurrence,
        calendar: event.calendar,
        creator: event.creator,
        createdAt: event.createdAt
      }
    });
  } catch(error) {
    logger.error('Failed to get event', error, 500, {
      eventId: req.params.id,
      userId: req.user.id
    });
    next(error);
  }
};

// @desc    Update event
// @route   PUT /api/events/:id
// @access  Private
exports.updateEvent = async (req, res, next) => {
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
      logger.error('Access denied to update event', new Error('Access denied'), 403, {
        eventId: req.params.id,
        userId: req.user.id
      });
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    const { title, description, startTime, endTime, location, isAllDay, recurrence } = req.body;
    if (title) event.title = title;
    if (description !== undefined) event.description = description;
    if (startTime) event.startTime = startTime;
    if (endTime) event.endTime = endTime;
    if (location !== undefined) event.location = location;
    if (isAllDay !== undefined) event.isAllDay = isAllDay;
    if (recurrence !== undefined) event.recurrence = recurrence;

    await event.save();

    // Send notifications to participants about the update
    if (event.participants && event.participants.length > 0) {
      const notificationPromises = event.participants.map(participant =>
        sendNotification({
          userId: participant.user,
          title: 'Event Updated',
          message: `The event "${event.title}" has been updated`,
          type: 'event_updated',
          data: { eventId: event._id }
        })
      );
      await Promise.all(notificationPromises);
    }

    res.json({
      success: true,
      event: {
        id: event._id,
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        isAllDay: event.isAllDay,
        recurrence: event.recurrence,
        calendar: event.calendar,
        creator: event.creator,
        createdAt: event.createdAt
      }
    });
  } catch(error) {
    logger.error('Failed to update event', error, 500, {
      eventId: req.params.id,
      userId: req.user.id
    });
    next(error);
  }
};

// @desc    Delete event
// @route   DELETE /api/events/:id
// @access  Private
exports.deleteEvent = async (req, res, next) => {
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
      logger.error('Access denied to delete event', new Error('Access denied'), 403, {
        eventId: req.params.id,
        userId: req.user.id
      });
      return res.status(403).json({
        success: false,
        error: 'Access denied'
      });
    }

    await event.remove();

    // Send notifications to participants about the deletion
    if (event.participants && event.participants.length > 0) {
      const notificationPromises = event.participants.map(participant =>
        sendNotification({
          userId: participant.user,
          title: 'Event Deleted',
          message: `The event "${event.title}" has been deleted`,
          type: 'event_deleted',
          data: { eventId: event._id }
        })
      );
      await Promise.all(notificationPromises);
    }

    res.json({
      success: true,
      message: 'Event deleted successfully'
    });
  } catch(error) {
    logger.error('Failed to delete event', error, 500, {
      eventId: req.params.id,
      userId: req.user.id
    });
    next(error);
  }
};

// @desc    List events
// @route   GET /api/events
// @access  Private
exports.listEvents = async (req, res, next) => {
  try {
    const { calendarId, startDate, endDate } = req.query;
    const query = {};

    if (calendarId) {
      // Check if user has access to the calendar
      const calendar = await Calendar.findById(calendarId);
      if (!calendar) {
        logger.error('Calendar not found', new Error('Calendar not found'), 404, { calendarId });
        return res.status(404).json({
          success: false,
          error: 'Calendar not found'
        });
      }

      if (!calendar.isPublic &&
          calendar.owner.toString() !== req.user.id &&
          !calendar.sharedWith.some(share => share.user.toString() === req.user.id)) {
        logger.error('Access denied to calendar', new Error('Access denied'), 403, {
          calendarId,
          userId: req.user.id
        });
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      query.calendar = calendarId;
    } else {
      // Get all calendars user has access to
      const calendars = await Calendar.find({
        $or: [
          { owner: req.user.id },
          { 'sharedWith.user': req.user.id }
        ]
      });
      query.calendar = { $in: calendars.map(c => c._id) };
    }

    if (startDate && endDate) {
      query.startTime = { $gte: new Date(startDate) };
      query.endTime = { $lte: new Date(endDate) };
    }

    const events = await Event.find(query);

    res.json({
      success: true,
      events: events.map(event => ({
        id: event._id,
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        location: event.location,
        isAllDay: event.isAllDay,
        recurrence: event.recurrence,
        calendar: event.calendar,
        creator: event.creator,
        createdAt: event.createdAt
      }))
    });
  } catch(error) {
    logger.error('Failed to list events', error, 500, { error: error.stack });
    next(error);
  }
};

// Add a participant to an event
exports.addParticipant = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('calendar', 'owner sharedWith');

    if (!event) {
      throw new NotFoundError('Event not found');
    }

    // Check if user has access to the calendar
    const calendar = event.calendar;
    if (!calendar.owner.equals(req.user._id) && !calendar.sharedWith.includes(req.user._id)) {
      throw new ForbiddenError('You do not have permission to add participants to this event');
    }

    const { userId, role } = req.body;

    // Check if participant is already added
    if (event.participants.some(p => p.user.equals(userId))) {
      throw new BadRequestError('User is already a participant in this event');
    }

    event.participants.push({ user: userId, role });
    await event.save();

    // Send notification to the new participant
    await sendNotification({
      userId,
      title: 'Event Invitation',
      message: `You have been invited to the event "${event.title}"`,
      type: 'event_invitation',
      data: { eventId: event._id }
    });

    res.json(event);
  } catch (err) {
    next(err);
  }
};

// Update participant status
exports.updateParticipantStatus = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);

    if (!event) {
      throw new NotFoundError('Event not found');
    }

    const { status } = req.body;
    const participant = event.participants.find(p => p.user.equals(req.user._id));

    if (!participant) {
      throw new BadRequestError('You are not a participant in this event');
    }

    participant.status = status;
    await event.save();

    // Send notification to event creator about status change
    const calendar = await Calendar.findById(event.calendar);
    if (calendar.owner) {
      await sendNotification({
        userId: calendar.owner,
        title: 'Participant Status Update',
        message: `A participant has updated their status to "${status}" for event "${event.title}"`,
        type: 'participant_status_update',
        data: { eventId: event._id, userId: req.user._id, status }
      });
    }

    res.json(event);
  } catch (err) {
    next(err);
  }
};

// Remove a participant from an event
exports.removeParticipant = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('calendar', 'owner sharedWith');

    if (!event) {
      throw new NotFoundError('Event not found');
    }

    // Check if user has access to the calendar
    const calendar = event.calendar;
    if (!calendar.owner.equals(req.user._id) && !calendar.sharedWith.includes(req.user._id)) {
      throw new ForbiddenError('You do not have permission to remove participants from this event');
    }

    const participantIndex = event.participants.findIndex(
      p => p.user.equals(req.params.userId)
    );

    if (participantIndex === -1) {
      throw new BadRequestError('User is not a participant in this event');
    }

    event.participants.splice(participantIndex, 1);
    await event.save();

    // Send notification to the removed participant
    await sendNotification({
      userId: req.params.userId,
      title: 'Removed from Event',
      message: `You have been removed from the event "${event.title}"`,
      type: 'event_removal',
      data: { eventId: event._id }
    });

    res.json(event);
  } catch (err) {
    next(err);
  }
};
