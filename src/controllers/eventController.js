const Event = require('../models/Event');
const Calendar = require('../models/Calendar');
const User = require('../models/User');
const logger = require('../utils/logger');
const { NotFoundError, ForbiddenError, BadRequestError } = require('../utils/errors');
const { sendNotification } = require('../services/notificationService');
const { successResponse, errorResponse } = require('../utils/response');
const googleSvc = require('../services/googleCalendarService');

// Internal helper to add participants with permission checks and notifications
async function addParticipantsToEvent(event, calendar, participantsInput, actingUserId) {
  if (!Array.isArray(participantsInput) || participantsInput.length === 0) {
    return event;
  }

  // Permission: actor must be calendar owner or shared user
  if (!calendar.owner.equals(actingUserId) && !calendar.sharedWith.includes(actingUserId)) {
    throw new ForbiddenError('You do not have permission to add participants to this event');
  }

  const existingIds = new Set((event.participants || []).map(p => String(p.user)));
  const normalized = participantsInput
    .filter(p => p && (p.userId || p.user))
    .map(p => ({ user: p.userId || p.user, role: p.role || 'attendee' }))
    .filter(p => !existingIds.has(String(p.user)));

  if (normalized.length === 0) {
    return event;
  }

  event.participants = [...(event.participants || []), ...normalized];
  await event.save();

  await Promise.all(
    normalized.map(p =>
      sendNotification({
        userId: p.user,
        title: 'Event Invitation',
        message: `You have been invited to the event "${event.title}"`,
        type: 'event_invitation',
        data: { eventId: event._id }
      })
    )
  );

  return event;
}

// @desc    Create a new event
// @route   POST /api/events
// @access  Private
exports.createEvent = async (req, res, next) => {
  try {
    const { calendarId: inputCalendarId, googleCalendarId: overrideGoogleCalId, title, description, startTime, endTime, location, isAllDay, recurrence, participants } = req.body;

    // Resolve calendar: default to user's calendar if not provided
    let calendar;
    let calendarId = inputCalendarId;
    if (!calendarId) {
      const defaultCal = await Calendar.findOne({ owner: req.user.id });
      if (!defaultCal) {
        return errorResponse(res, new Error('No calendar found for user'), 400);
      }
      calendar = defaultCal;
      calendarId = defaultCal._id;
    } else {
      // Check if calendar exists and user has access
      calendar = await Calendar.findById(calendarId);
    }
    if (!calendar) {
      return errorResponse(res, new Error('Calendar not found'), 404);
    }

    if (!calendar.isPublic &&
        calendar.owner.toString() !== req.user.id &&
        !calendar.sharedWith.some(share => share.user.toString() === req.user.id)) {
      return errorResponse(res, new Error('Access denied'), 403);
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

    // If user has Google linked, write-through to Jaaiye Google calendar
    try {
      const user = req.user; // set by protect
      // load full user for tokens
      const dbUser = await User.findById(user.id).select('+googleCalendar.refreshToken +googleCalendar.accessToken');
      if (dbUser && dbUser.providerLinks && dbUser.providerLinks.google && dbUser.googleCalendar && dbUser.googleCalendar.refreshToken) {
        // Determine Google calendar to write
        const targetGoogleCalId = overrideGoogleCalId || calendar.google?.primaryId || dbUser.googleCalendar?.jaaiyeCalendarId;

        const eventBody = {
          summary: title,
          description,
          start: { dateTime: new Date(startTime).toISOString() },
          end: { dateTime: new Date(endTime).toISOString() },
          location
        };

        const googleEvent = await googleSvc.insertEvent(dbUser, eventBody, targetGoogleCalId);
        event.external = event.external || {};
        event.external.google = {
          calendarId: targetGoogleCalId || dbUser.googleCalendar.jaaiyeCalendarId,
          eventId: googleEvent.id,
          etag: googleEvent.etag
        };
        await event.save();
      }
    } catch (err) {
      logger.warn('Google write-through failed', { error: err.message });
      // Do not fail local creation
    }

    // Optionally add participants provided at creation via shared helper
    if (Array.isArray(participants) && participants.length > 0) {
      await addParticipantsToEvent(event, calendar, participants, req.user._id);
    }

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

    return successResponse(res, {
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
        external: event.external,
        createdAt: event.createdAt
      }
    }, 201, 'Event created');
  } catch (error) {
    logger.error('Failed to create event', error, { calendarId: req.body.calendarId, userId: req.user.id });
    return errorResponse(res, error, 500);
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
      return errorResponse(res, new Error('Event not found'), 404);
    }

    // Check if user has access to the calendar
    const calendar = await Calendar.findById(event.calendar);
    if (!calendar.isPublic &&
        calendar.owner.toString() !== req.user.id &&
        !calendar.sharedWith.some(share => share.user.toString() === req.user.id)) {
      return errorResponse(res, new Error('Access denied'), 403);
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

    // Google write-through update
    try {
      if (event.external && event.external.google && event.external.google.eventId) {
        const User = require('../models/User');
        const dbUser = await User.findById(req.user.id).select('+googleCalendar.refreshToken +googleCalendar.accessToken');
        if (dbUser && dbUser.providerLinks?.google && dbUser.googleCalendar?.refreshToken) {
          await googleSvc.updateEvent(dbUser, event.external.google.calendarId, event.external.google.eventId, {
            summary: event.title,
            description: event.description,
            start: { dateTime: new Date(event.startTime).toISOString() },
            end: { dateTime: new Date(event.endTime).toISOString() },
            location: event.location
          });
        }
      }
    } catch (err) {
      logger.warn('Google update write-through failed', { error: err.message });
    }

    return successResponse(res, {
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
        external: event.external,
        createdAt: event.createdAt
      }
    }, 200, 'Event updated');
  } catch (error) {
    logger.error('Failed to update event', error, { eventId: req.params.id, userId: req.user.id });
    return errorResponse(res, error, 500);
  }
};

// @desc    Delete event
// @route   DELETE /api/events/:id
// @access  Private
exports.deleteEvent = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id);
    if (!event) {
      return errorResponse(res, new Error('Event not found'), 404);
    }

    // Check if user has access to the calendar
    const calendar = await Calendar.findById(event.calendar);
    if (!calendar.isPublic &&
        calendar.owner.toString() !== req.user.id &&
        !calendar.sharedWith.some(share => share.user.toString() === req.user.id)) {
      return errorResponse(res, new Error('Access denied'), 403);
    }

    // Google write-through deletion
    try {
      if (event.external && event.external.google && event.external.google.eventId) {
        const User = require('../models/User');
        const dbUser = await User.findById(req.user.id).select('+googleCalendar.refreshToken +googleCalendar.accessToken');
        if (dbUser && dbUser.providerLinks?.google && dbUser.googleCalendar?.refreshToken) {
          await googleSvc.deleteEvent(dbUser, event.external.google.calendarId, event.external.google.eventId);
        }
      }
    } catch (err) {
      logger.warn('Google delete write-through failed', { error: err.message });
    }

    await event.remove();

    return successResponse(res, null, 200, 'Event deleted successfully');
  } catch (error) {
    logger.error('Failed to delete event', error, { eventId: req.params.id, userId: req.user.id });
    return errorResponse(res, error, 500);
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

// @desc    Batch add participants to an event
// @route   POST /api/events/:id/participants/batch
// @access  Private
exports.addParticipantsBatch = async (req, res, next) => {
  try {
    const event = await Event.findById(req.params.id)
      .populate('calendar', 'owner sharedWith');

    if (!event) {
      throw new NotFoundError('Event not found');
    }

    const calendar = event.calendar;
    if (!calendar.owner.equals(req.user._id) && !calendar.sharedWith.includes(req.user._id)) {
      throw new ForbiddenError('You do not have permission to add participants to this event');
    }

    const { participants } = req.body; // [{ userId, role }]
    if (!Array.isArray(participants) || participants.length === 0) {
      throw new BadRequestError('participants array is required');
    }

    await addParticipantsToEvent(event, calendar, participants, req.user._id);
    return res.json(event);
  } catch (err) {
    next(err);
  }
};
