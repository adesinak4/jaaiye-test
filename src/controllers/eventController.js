const Event = require('../models/Event');
const Calendar = require('../models/Calendar');
const User = require('../models/User');
const logger = require('../utils/logger');
const { NotFoundError, ForbiddenError, BadRequestError, ValidationError } = require('../utils/errors');
const { sendNotification } = require('../services/notificationService');
const { successResponse, errorResponse } = require('../utils/response');
const googleSvc = require('../services/googleCalendarService');
const CloudinaryService = require('../services/cloudinaryService');
const { asyncHandler } = require('../utils/asyncHandler');
const { addCalendarGuidanceToResponse } = require('../utils/calendarGuidance');

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
      sendNotification(p.user, {
        title: 'Event Invitation',
        body: `You have been invited to the event "${event.title}"`
      }, {
        type: 'event_invitation',
        eventId: event._id.toString()
      })
    )
  );

  // Add event to participants' Google Calendars if they have it linked
  await Promise.all(
    normalized.map(async (participant) => {
      try {
        const participantUser = await User.findById(participant.user).select('+googleCalendar.refreshToken +googleCalendar.accessToken');

        if (participantUser && participantUser.googleCalendar && participantUser.googleCalendar.refreshToken) {
          const eventBody = {
            summary: event.title,
            description: event.description || `You've been invited to ${event.title}`,
            start: { dateTime: new Date(event.startTime).toISOString() },
            end: { dateTime: new Date(event.endTime || event.startTime).toISOString() },
            location: event.venue || undefined
          };

          const googleEvent = await googleSvc.insertEvent(participantUser, eventBody);

          logger.info('Event added to participant Google Calendar', {
            participantId: participant.user,
            eventId: event._id,
            googleEventId: googleEvent.id
          });
        } else {
          logger.info('Participant does not have Google Calendar linked', { participantId: participant.user });
        }
      } catch (error) {
        logger.error('Failed to add event to participant calendar', {
          participantId: participant.user,
          eventId: event._id,
          error: error.message
        });
        // Don't fail the participant addition if calendar integration fails
      }
    })
  );

  return event;
}

// @desc    Create a new event
// @route   POST /api/events
// @access  Private
exports.createEvent = async (req, res, next) => {
  try {
    const { calendarId: inputCalendarId, googleCalendarId: overrideGoogleCalId, title, description, startTime, endTime, venue, category, ticketFee, isAllDay, recurrence, participants } = req.body;

    // Normalize dates
    const normalizedStart = new Date(startTime);
    const normalizedEnd = endTime ? new Date(endTime) : null;

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

    // Validate start/end times: cannot be in the past
    const now = new Date();
    if (normalizedStart < now) {
      return errorResponse(res, new Error('Start time cannot be in the past'), 400);
    }
    if (normalizedEnd && normalizedEnd < normalizedStart) {
      return errorResponse(res, new Error('End time must be after start time'), 400);
    }

    // Handle image upload if provided
    let imageUrl = null;
    if (req.file) {
      const uploadResult = await CloudinaryService.uploadImage(req.file.buffer, {
        folder: 'jaaiye/events',
        transformation: [
          { width: 800, height: 600, crop: 'fill', quality: 'auto' }
        ]
      });

      if (!uploadResult.success) {
        throw new ValidationError('Failed to upload image: ' + uploadResult.error);
      }

      imageUrl = uploadResult.url;
    }

    const event = await Event.create({
      calendar: calendarId,
      title,
      description,
      startTime: normalizedStart,
      endTime: normalizedEnd,
      venue,
      category: category || 'event',
      ticketFee: ticketFee === 'free' ? 'free' : ticketFee,
      isAllDay,
      recurrence,
      image: imageUrl,
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
          start: { dateTime: normalizedStart.toISOString() },
          end: { dateTime: (normalizedEnd || normalizedStart).toISOString() },
          location: venue
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
        sendNotification(userId, {
          title: 'New Event Created',
          body: `A new event "${event.title}" has been created in calendar "${calendar.name}"`
        }, {
          type: 'event_created',
          eventId: event._id.toString(),
          calendarId
        })
      );
      await Promise.all(notificationPromises);
    }

    const responseData = {
      event: {
        id: event._id,
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        venue: event.venue,
        category: event.category,
        ticketFee: event.ticketFee,
        isAllDay: event.isAllDay,
        recurrence: event.recurrence,
        calendar: event.calendar,
        creator: event.creator,
        external: event.external,
        createdAt: event.createdAt
      }
    };

    // Add calendar guidance if user doesn't have calendar linked
    const user = await User.findById(req.user.id);
    const enhancedResponse = addCalendarGuidanceToResponse(responseData, user, 'event_creation');

    return successResponse(res, enhancedResponse, 201, 'Event created');
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
    const event = await Event.findById(req.params.id).lean();
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
        venue: event.venue,
        category: event.category,
        ticketFee: event.ticketFee,
        attendeeCount: event.attendeeCount,
        image: event.image,
        isAllDay: event.isAllDay,
        recurrence: event.recurrence,
        calendar: event.calendar,
        creator: event.creator,
        external: event.external,
        createdAt: event.createdAt
      }
    });
  } catch (error) {
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

    const { title, description, startTime, venue, endTime, isAllDay, recurrence } = req.body;
    if (title) event.title = title;
    if (description !== undefined) event.description = description;
    if (startTime) event.startTime = startTime;
    if (endTime) event.endTime = endTime;
    if (venue !== undefined) event.venue = venue;
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
            location: event.venue
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

    await Event.deleteOne({ _id: event._id });

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

    const events = await Event.find(query)
      .select('title description startTime endTime isAllDay recurrence calendar creator createdAt')
      .lean();

    res.json({
      success: true,
      events: events.map(event => ({
        id: event._id,
        title: event.title,
        description: event.description,
        startTime: event.startTime,
        endTime: event.endTime,
        isAllDay: event.isAllDay,
        recurrence: event.recurrence,
        calendar: event.calendar,
        creator: event.creator,
        createdAt: event.createdAt
      }))
    });
  } catch (error) {
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
    await sendNotification(userId, {
      title: 'Event Invitation',
      body: `You have been invited to the event "${event.title}"`
    }, {
      type: 'event_invitation',
      eventId: event._id.toString()
    });

    // Add event to participant's Google Calendar if they have it linked
    try {
      const participantUser = await User.findById(userId).select('+googleCalendar.refreshToken +googleCalendar.accessToken');

      if (participantUser && participantUser.googleCalendar && participantUser.googleCalendar.refreshToken) {
        const eventBody = {
          summary: event.title,
          description: event.description || `You've been invited to ${event.title}`,
          start: { dateTime: new Date(event.startTime).toISOString() },
          end: { dateTime: new Date(event.endTime || event.startTime).toISOString() },
          location: event.venue || undefined
        };

        const googleEvent = await googleSvc.insertEvent(participantUser, eventBody);

        logger.info('Event added to participant Google Calendar', {
          participantId: userId,
          eventId: event._id,
          googleEventId: googleEvent.id
        });
      } else {
        logger.info('Participant does not have Google Calendar linked', { participantId: userId });
      }
    } catch (error) {
      logger.error('Failed to add event to participant calendar', {
        participantId: userId,
        eventId: event._id,
        error: error.message
      });
      // Don't fail the participant addition if calendar integration fails
    }

    // Add calendar guidance if user doesn't have calendar linked
    const user = await User.findById(req.user.id);
    const responseData = { event };
    const enhancedResponse = addCalendarGuidanceToResponse(responseData, user, 'participant_addition');

    res.json(enhancedResponse);
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
      await sendNotification(calendar.owner, {
        title: 'Participant Status Update',
        body: `A participant has updated their status to "${status}" for event "${event.title}"`
      }, {
        type: 'participant_status_update',
        eventId: event._id.toString(),
        userId: req.user._id.toString(),
        status
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
    await sendNotification(req.params.userId, {
      title: 'Removed from Event',
      body: `You have been removed from the event "${event.title}"`
    }, {
      type: 'event_removal',
      eventId: event._id.toString()
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

// @desc    Create event with image upload
// @route   POST /api/v1/events/create-with-image
// @access  Private
exports.createEventWithImage = asyncHandler(async (req, res) => {
  const {
    calendarId: inputCalendarId,
    title,
    description,
    startTime,
    endTime,

    venue,
    category,
    ticketFee,
    isAllDay,
    recurrence,
    participants
  } = req.body;

  // Validate required fields (endTime optional)
  if (!title || !startTime) {
    throw new ValidationError('Title and start time are required');
  }

  // Validate ticketFee
  if (ticketFee !== undefined && ticketFee !== null && ticketFee !== 'free' && (isNaN(ticketFee) || ticketFee < 0)) {
    throw new ValidationError('Ticket fee must be "free", null, or a positive number');
  }

  // Handle image upload if provided
  let imageUrl = null;
  if (req.file) {
    const uploadResult = await CloudinaryService.uploadImage(req.file.buffer, {
      folder: 'jaaiye/events',
      transformation: [
        { width: 800, height: 600, crop: 'fill', quality: 'auto' }
      ]
    });

    if (!uploadResult.success) {
      throw new ValidationError('Failed to upload image: ' + uploadResult.error);
    }

    imageUrl = uploadResult.url;
  }

  // Resolve calendar
  let calendar;
  let calendarId = inputCalendarId;
  if (!calendarId) {
    const defaultCal = await Calendar.findOne({ owner: req.user.id });
    if (!defaultCal) {
      throw new NotFoundError('No calendar found for user');
    }
    calendar = defaultCal;
    calendarId = defaultCal._id;
  } else {
    calendar = await Calendar.findById(calendarId);
    if (!calendar) {
      throw new NotFoundError('Calendar not found');
    }
  }

  // Check calendar access
  if (!calendar.isPublic &&
    calendar.owner.toString() !== req.user.id &&
    !calendar.sharedWith.some(share => share.user.toString() === req.user.id)) {
    throw new ForbiddenError('Access denied to calendar');
  }

  // Create event
  // Default endTime to 8 hours after startTime if not provided
  const computedEndTime = endTime && endTime !== 'null' && endTime !== 'undefined'
    ? endTime
    : new Date(new Date(startTime).getTime() + 8 * 60 * 60 * 1000);

  const event = await Event.create({
    calendar: calendarId,
    title,
    description,
    startTime: new Date(startTime),
    endTime: new Date(computedEndTime),
    venue,
    category: category || 'event',
    ticketFee: ticketFee === 'free' ? 'free' : ticketFee,
    image: imageUrl,
    isAllDay,
    recurrence,
    creator: req.user.id
  });

  // Google Calendar integration (existing logic)
  try {
    const dbUser = await User.findById(req.user.id).select('+googleCalendar.refreshToken +googleCalendar.accessToken');
    if (dbUser && dbUser.providerLinks && dbUser.providerLinks.google && dbUser.googleCalendar && dbUser.googleCalendar.refreshToken) {
      const targetGoogleCalId = calendar.google?.primaryId || dbUser.googleCalendar?.jaaiyeCalendarId;

      const eventBody = {
        summary: title,
        description,
        start: { dateTime: new Date(startTime).toISOString() },
        end: { dateTime: new Date(computedEndTime).toISOString() },
        location: venue
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
  }

  // Add participants if provided
  if (Array.isArray(participants) && participants.length > 0) {
    await addParticipantsToEvent(event, calendar, participants, req.user._id);
  }

  // Send notifications
  if (calendar.sharedWith.length > 0) {
    const notificationPromises = calendar.sharedWith.map(userId =>
      sendNotification(userId, {
        title: 'New Event Created',
        body: `A new event "${event.title}" has been created in calendar "${calendar.name}"`
      }, {
        type: 'event_created',
        eventId: event._id.toString(),
        calendarId
      })
    );
    await Promise.all(notificationPromises);
  }

  logger.info('Event created with image', {
    eventId: event._id,
    userId: req.user.id,
    hasImage: !!imageUrl
  });

  return successResponse(res, {
    event: {
      id: event._id,
      title: event.title,
      description: event.description,
      startTime: event.startTime,
      endTime: event.endTime,
      venue: event.venue,
      category: event.category,
      ticketFee: event.ticketFee,
      attendeeCount: event.attendeeCount,
      image: event.image,
      isAllDay: event.isAllDay,
      recurrence: event.recurrence,
      calendar: event.calendar,
      creator: event.creator,
      external: event.external,
      createdAt: event.createdAt
    }
  }, 201, 'Event created successfully');
});

// @desc    Get all events (public)
// @route   GET /api/v1/events
// @access  Public
exports.getAllEvents = asyncHandler(async (req, res) => {
  const { category, limit = 20, page = 1 } = req.query;

  const query = { status: 'scheduled' };

  if (category) {
    query.category = category;
  }

  const events = await Event.find(query)
    .select('title description startTime endTime venue category ticketFee attendeeCount image isAllDay calendar createdAt')
    .populate('calendar', 'name')
    .sort({ startTime: 1 })
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit))
    .lean();

  const totalEvents = await Event.countDocuments(query);

  return successResponse(res, {
    events: events.map(event => ({
      id: event._id,
      title: event.title,
      description: event.description,
      startTime: event.startTime,
      endTime: event.endTime,
      venue: event.venue,
      category: event.category,
      ticketFee: event.ticketFee,
      attendeeCount: event.attendeeCount,
      image: event.image,
      isAllDay: event.isAllDay,
      calendar: event.calendar,
      createdAt: event.createdAt
    })),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: totalEvents,
      pages: Math.ceil(totalEvents / parseInt(limit))
    }
  });
});

// @desc    Add ticket type to an event
// @route   POST /api/v1/events/:eventId/ticket-types
// @access  Private
exports.addTicketType = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const { name, description, price, capacity, salesStartDate, salesEndDate } = req.body;

  // Validate required fields
  if (!name || price === undefined) {
    throw new ValidationError('Name and price are required');
  }

  if (price < 0) {
    throw new ValidationError('Price must be non-negative');
  }

  if (capacity && capacity < 0) {
    throw new ValidationError('Capacity must be non-negative');
  }

  // Find event
  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found');
  }

  // Check if user has permission to modify this event
  const calendar = await Calendar.findById(event.calendar);
  if (!calendar.isPublic &&
    calendar.owner.toString() !== req.user.id &&
    !calendar.sharedWith.some(share => share.user.toString() === req.user.id)) {
    throw new ForbiddenError('Access denied to event');
  }

  // Check if ticket type name already exists
  const existingTicketType = event.ticketTypes.find(tt => tt.name.toLowerCase() === name.toLowerCase());
  if (existingTicketType) {
    throw new ValidationError('Ticket type with this name already exists');
  }

  // Add ticket type
  const ticketTypeData = {
    name,
    description,
    price,
    capacity: capacity || null,
    salesStartDate: salesStartDate || null,
    salesEndDate: salesEndDate || null
  };

  await event.addTicketType(ticketTypeData);

  logger.info('Ticket type added to event', {
    eventId: event._id,
    userId: req.user.id,
    ticketTypeName: name
  });

  return successResponse(res, {
    ticketType: event.ticketTypes[event.ticketTypes.length - 1]
  }, 201, 'Ticket type added successfully');
});

// @desc    Update ticket type
// @route   PUT /api/v1/events/:eventId/ticket-types/:ticketTypeId
// @access  Private
exports.updateTicketType = asyncHandler(async (req, res) => {
  const { eventId, ticketTypeId } = req.params;
  const { name, description, price, capacity, isActive, salesStartDate, salesEndDate } = req.body;

  // Find event
  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found');
  }

  // Check if user has permission to modify this event
  const calendar = await Calendar.findById(event.calendar);
  if (!calendar.isPublic &&
    calendar.owner.toString() !== req.user.id &&
    !calendar.sharedWith.some(share => share.user.toString() === req.user.id)) {
    throw new ForbiddenError('Access denied to event');
  }

  // Find ticket type
  const ticketType = event.ticketTypes.id(ticketTypeId);
  if (!ticketType) {
    throw new NotFoundError('Ticket type not found');
  }

  // Validate price if provided
  if (price !== undefined && price < 0) {
    throw new ValidationError('Price must be non-negative');
  }

  // Validate capacity if provided
  if (capacity !== undefined && capacity < 0) {
    throw new ValidationError('Capacity must be non-negative');
  }

  // Check if new name conflicts with existing ticket types
  if (name && name !== ticketType.name) {
    const existingTicketType = event.ticketTypes.find(tt =>
      tt._id.toString() !== ticketTypeId && tt.name.toLowerCase() === name.toLowerCase()
    );
    if (existingTicketType) {
      throw new ValidationError('Ticket type with this name already exists');
    }
  }

  // Update ticket type
  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (price !== undefined) updateData.price = price;
  if (capacity !== undefined) updateData.capacity = capacity;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (salesStartDate !== undefined) updateData.salesStartDate = salesStartDate;
  if (salesEndDate !== undefined) updateData.salesEndDate = salesEndDate;

  await event.updateTicketType(ticketTypeId, updateData);

  logger.info('Ticket type updated', {
    eventId: event._id,
    ticketTypeId,
    userId: req.user.id
  });

  return successResponse(res, {
    ticketType: event.ticketTypes.id(ticketTypeId)
  }, 200, 'Ticket type updated successfully');
});

// @desc    Remove ticket type
// @route   DELETE /api/v1/events/:eventId/ticket-types/:ticketTypeId
// @access  Private
exports.removeTicketType = asyncHandler(async (req, res) => {
  const { eventId, ticketTypeId } = req.params;

  // Find event
  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found');
  }

  // Check if user has permission to modify this event
  const calendar = await Calendar.findById(event.calendar);
  if (!calendar.isPublic &&
    calendar.owner.toString() !== req.user.id &&
    !calendar.sharedWith.some(share => share.user.toString() === req.user.id)) {
    throw new ForbiddenError('Access denied to event');
  }

  // Find ticket type
  const ticketType = event.ticketTypes.id(ticketTypeId);
  if (!ticketType) {
    throw new NotFoundError('Ticket type not found');
  }

  // Check if there are existing tickets for this type
  const Ticket = require('../models/Ticket');
  const existingTickets = await Ticket.countDocuments({ eventId, ticketTypeId });
  if (existingTickets > 0) {
    throw new ValidationError('Cannot remove ticket type with existing tickets');
  }

  // Remove ticket type
  await event.removeTicketType(ticketTypeId);

  logger.info('Ticket type removed', {
    eventId: event._id,
    ticketTypeId,
    userId: req.user.id
  });

  return successResponse(res, null, 200, 'Ticket type removed successfully');
});

// @desc    Get available ticket types for an event
// @route   GET /api/v1/events/:eventId/ticket-types/available
// @access  Public
exports.getAvailableTicketTypes = asyncHandler(async (req, res) => {
  const { eventId } = req.params;

  // Find event
  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found');
  }

  // Get available ticket types
  const availableTicketTypes = event.getAvailableTicketTypes();

  return successResponse(res, {
    ticketTypes: availableTicketTypes.map(tt => ({
      id: tt._id,
      name: tt.name,
      description: tt.description,
      price: tt.price,
      capacity: tt.capacity,
      soldCount: tt.soldCount,
      remainingCapacity: tt.capacity ? tt.capacity - tt.soldCount : null,
      salesStartDate: tt.salesStartDate,
      salesEndDate: tt.salesEndDate
    }))
  });
});

// @desc    Create event with image (Admin only)
// @route   POST /api/v1/events/admin/create-with-image
// @access  Admin
exports.createEventWithImageAdmin = asyncHandler(async (req, res) => {
  try {
    const {
      title,
      description,
      startTime,
      endTime,

      venue,
      category,
      ticketFee,
      createdBy = 'Jaaiye'
    } = req.body;

    // Validate required fields
    if (!title || !startTime) {
      throw new ValidationError('Title and start time are required');
    }

    // Validate ticketFee
    if (ticketFee !== undefined && ticketFee !== null && ticketFee !== 'free' && (isNaN(ticketFee) || ticketFee < 0)) {
      throw new ValidationError('Ticket fee must be "free", null, or a positive number');
    }

    // Handle image upload if provided
    let imageUrl = null;
    if (req.file) {
      const uploadResult = await CloudinaryService.uploadImage(req.file.buffer, {
        folder: 'jaaiye/events',
        transformation: [
          { width: 800, height: 600, crop: 'fill', quality: 'auto' }
        ]
      });

      if (!uploadResult.success) {
        throw new ValidationError('Failed to upload image: ' + uploadResult.error);
      }

      imageUrl = uploadResult.url;
    }

    // For admin events, we'll create a special "Jaaiye" calendar or use a default one
    let calendar;
    let calendarId;

    // Try to find or create a Jaaiye calendar
    calendar = await Calendar.findOne({ name: 'Jaaiye Events' });
    if (!calendar) {
      // Create a default Jaaiye calendar
      calendar = await Calendar.create({
        name: 'Jaaiye Events',
        description: 'Official Jaaiye events calendar',
        owner: req.user.id, // Admin user owns this calendar
        isPublic: true,
        color: '#3B82F6'
      });
    }
    calendarId = calendar._id;

    // Default endTime to 8 hours after startTime if not provided
    const computedEndTime = endTime && endTime !== 'null' && endTime !== 'undefined'
      ? endTime
      : new Date(new Date(startTime).getTime() + 8 * 60 * 60 * 1000);

    // Create event with createdBy field
    const event = await Event.create({
      calendar: calendarId,
      title,
      description,
      startTime,
      endTime: computedEndTime,

      venue,
      category: category || 'event',
      ticketFee: ticketFee === 'free' ? 'free' : ticketFee,
      image: imageUrl,
      isAllDay,
      recurrence,
      createdBy: createdBy,
      creator: req.user.id // Admin user as creator
    });

    // Add participants if provided
    if (participants && participants.length > 0) {
      await addParticipantsToEvent(event, calendar, participants, req.user.id);
    }

    // Populate the event for response
    const populatedEvent = await Event.findById(event._id)
      .populate('calendar', 'name color')
      .populate('participants.user', 'username fullName profilePicture');

    logger.info('Admin event created with image', {
      eventId: event._id,
      adminId: req.user.id,
      createdBy: createdBy,
      hasImage: !!imageUrl
    });

    return successResponse(res, { event: populatedEvent }, 201, 'Admin event created successfully');
  } catch (error) {
    logger.error('Error creating admin event with image', {
      error: error.message,
      adminId: req.user?.id,
      eventData: req.body
    });
    throw error;
  }
});

// @desc    Get all Jaaiye events
// @route   GET /api/v1/events/jaaiye
// @access  Public
exports.getJaaiyeEvents = asyncHandler(async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      category,
      upcoming = true,
      sortBy = 'startTime',
      sortOrder = 'asc'
    } = req.query;

    // Build filter
    const filter = { createdBy: 'Jaaiye' };

    if (category) {
      filter.category = category;
    }

    if (upcoming === 'true') {
      filter.startTime = { $gte: new Date() };
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get events
    const events = await Event.find(filter)
      .select('title description startTime endTime venue category ticketFee image isAllDay calendar participants createdAt')
      .populate('calendar', 'name color')
      .populate('participants.user', 'username fullName profilePicture')
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit))
      .lean();

    // Get total count for pagination
    const totalCount = await Event.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / parseInt(limit));

    logger.info('Jaaiye events retrieved', {
      count: events.length,
      totalCount,
      page: parseInt(page),
      totalPages,
      filter
    });

    return successResponse(res, {
      events,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCount,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    logger.error('Error retrieving Jaaiye events', {
      error: error.message,
      query: req.query
    });
    throw error;
  }
});

// @desc    Get events by category
// @route   GET /api/v1/events/category/:category
// @access  Public
exports.getEventsByCategory = asyncHandler(async (req, res) => {
  const { category } = req.params;
  const { limit = 20, page = 1 } = req.query;

  if (!['hangout', 'event'].includes(category)) {
    throw new ValidationError('Invalid category. Must be "hangout" or "event"');
  }

  const events = await Event.findByCategory(category)
    .select('title description startTime endTime venue category ticketFee image isAllDay calendar createdAt')
    .populate('calendar', 'name')
    .limit(parseInt(limit))
    .skip((parseInt(page) - 1) * parseInt(limit))
    .lean();

  const totalEvents = await Event.countDocuments({ category, status: 'scheduled' });

  return successResponse(res, {
    events: events.map(event => ({
      id: event._id,
      title: event.title,
      description: event.description,
      startTime: event.startTime,
      endTime: event.endTime,
      venue: event.venue,
      category: event.category,
      ticketFee: event.ticketFee,
      attendeeCount: event.attendeeCount,
      image: event.image,
      isAllDay: event.isAllDay,
      calendar: event.calendar,
      createdAt: event.createdAt
    })),
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: totalEvents,
      pages: Math.ceil(totalEvents / parseInt(limit))
    }
  });
});

// @desc    Update event image
// @route   PUT /api/v1/events/:id/image
// @access  Private
exports.updateEventImage = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (!req.file) {
    throw new ValidationError('Image file is required');
  }

  const event = await Event.findById(id);
  if (!event) {
    throw new NotFoundError('Event not found');
  }

  const calendar = await Calendar.findById(event.calendar);
  if (!calendar) {
    throw new NotFoundError('Calendar not found');
  }

  if (!calendar.isPublic &&
    calendar.owner.toString() !== req.user.id &&
    !calendar.sharedWith.some(share => share.user.toString() === req.user.id)) {
    throw new ForbiddenError('Access denied to calendar');
  }

  // Upload new image
  const uploadResult = await CloudinaryService.uploadImage(req.file.buffer, {
    folder: 'jaaiye/events',
    transformation: [
      { width: 1200, height: 630, crop: 'fill', quality: 'auto' }
    ]
  });

  if (!uploadResult.success) {
    throw new ValidationError('Failed to upload image: ' + uploadResult.error);
  }

  const previousImageUrl = event.image;
  event.image = uploadResult.url;
  await event.save();

  // Best effort delete of previous image
  if (previousImageUrl) {
    const publicId = CloudinaryService.extractPublicId(previousImageUrl);
    if (publicId) {
      try {
        await CloudinaryService.deleteImage(publicId);
      } catch (e) {
        // swallow cleanup errors
      }
    }
  }

  return successResponse(res, {
    image: event.image,
    eventId: event._id
  }, 200, 'Event image updated');
});

// @desc    Add ticket type to an event
// @route   POST /api/v1/events/:eventId/ticket-types
// @access  Private
exports.addTicketType = asyncHandler(async (req, res) => {
  const { eventId } = req.params;
  const { name, description, price, capacity, salesStartDate, salesEndDate } = req.body;

  // Validate required fields
  if (!name || price === undefined) {
    throw new ValidationError('Name and price are required');
  }

  if (price < 0) {
    throw new ValidationError('Price must be non-negative');
  }

  if (capacity && capacity < 0) {
    throw new ValidationError('Capacity must be non-negative');
  }

  // Find event
  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found');
  }

  // Check if user has permission to modify this event
  const calendar = await Calendar.findById(event.calendar);
  if (!calendar.isPublic &&
    calendar.owner.toString() !== req.user.id &&
    !calendar.sharedWith.some(share => share.user.toString() === req.user.id)) {
    throw new ForbiddenError('Access denied to event');
  }

  // Check if ticket type name already exists
  const existingTicketType = event.ticketTypes.find(tt => tt.name.toLowerCase() === name.toLowerCase());
  if (existingTicketType) {
    throw new ValidationError('Ticket type with this name already exists');
  }

  // Add ticket type
  const ticketTypeData = {
    name,
    description,
    price,
    capacity: capacity || null,
    salesStartDate: salesStartDate || null,
    salesEndDate: salesEndDate || null
  };

  await event.addTicketType(ticketTypeData);

  logger.info('Ticket type added to event', {
    eventId: event._id,
    userId: req.user.id,
    ticketTypeName: name
  });

  return successResponse(res, {
    ticketType: event.ticketTypes[event.ticketTypes.length - 1]
  }, 201, 'Ticket type added successfully');
});

// @desc    Update ticket type
// @route   PUT /api/v1/events/:eventId/ticket-types/:ticketTypeId
// @access  Private
exports.updateTicketType = asyncHandler(async (req, res) => {
  const { eventId, ticketTypeId } = req.params;
  const { name, description, price, capacity, isActive, salesStartDate, salesEndDate } = req.body;

  // Find event
  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found');
  }

  // Check if user has permission to modify this event
  const calendar = await Calendar.findById(event.calendar);
  if (!calendar.isPublic &&
    calendar.owner.toString() !== req.user.id &&
    !calendar.sharedWith.some(share => share.user.toString() === req.user.id)) {
    throw new ForbiddenError('Access denied to event');
  }

  // Find ticket type
  const ticketType = event.ticketTypes.id(ticketTypeId);
  if (!ticketType) {
    throw new NotFoundError('Ticket type not found');
  }

  // Validate price if provided
  if (price !== undefined && price < 0) {
    throw new ValidationError('Price must be non-negative');
  }

  // Validate capacity if provided
  if (capacity !== undefined && capacity < 0) {
    throw new ValidationError('Capacity must be non-negative');
  }

  // Check if new name conflicts with existing ticket types
  if (name && name !== ticketType.name) {
    const existingTicketType = event.ticketTypes.find(tt =>
      tt._id.toString() !== ticketTypeId && tt.name.toLowerCase() === name.toLowerCase()
    );
    if (existingTicketType) {
      throw new ValidationError('Ticket type with this name already exists');
    }
  }

  // Update ticket type
  const updateData = {};
  if (name !== undefined) updateData.name = name;
  if (description !== undefined) updateData.description = description;
  if (price !== undefined) updateData.price = price;
  if (capacity !== undefined) updateData.capacity = capacity;
  if (isActive !== undefined) updateData.isActive = isActive;
  if (salesStartDate !== undefined) updateData.salesStartDate = salesStartDate;
  if (salesEndDate !== undefined) updateData.salesEndDate = salesEndDate;

  await event.updateTicketType(ticketTypeId, updateData);

  logger.info('Ticket type updated', {
    eventId: event._id,
    ticketTypeId,
    userId: req.user.id
  });

  return successResponse(res, {
    ticketType: event.ticketTypes.id(ticketTypeId)
  }, 200, 'Ticket type updated successfully');
});

// @desc    Remove ticket type
// @route   DELETE /api/v1/events/:eventId/ticket-types/:ticketTypeId
// @access  Private
exports.removeTicketType = asyncHandler(async (req, res) => {
  const { eventId, ticketTypeId } = req.params;

  // Find event
  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found');
  }

  // Check if user has permission to modify this event
  const calendar = await Calendar.findById(event.calendar);
  if (!calendar.isPublic &&
    calendar.owner.toString() !== req.user.id &&
    !calendar.sharedWith.some(share => share.user.toString() === req.user.id)) {
    throw new ForbiddenError('Access denied to event');
  }

  // Find ticket type
  const ticketType = event.ticketTypes.id(ticketTypeId);
  if (!ticketType) {
    throw new NotFoundError('Ticket type not found');
  }

  // Check if there are existing tickets for this type
  const Ticket = require('../models/Ticket');
  const existingTickets = await Ticket.countDocuments({ eventId, ticketTypeId });
  if (existingTickets > 0) {
    throw new ValidationError('Cannot remove ticket type with existing tickets');
  }

  // Remove ticket type
  await event.removeTicketType(ticketTypeId);

  logger.info('Ticket type removed', {
    eventId: event._id,
    ticketTypeId,
    userId: req.user.id
  });

  return successResponse(res, null, 200, 'Ticket type removed successfully');
});

// @desc    Get available ticket types for an event
// @route   GET /api/v1/events/:eventId/ticket-types/available
// @access  Public
exports.getAvailableTicketTypes = asyncHandler(async (req, res) => {
  const { eventId } = req.params;

  // Find event
  const event = await Event.findById(eventId);
  if (!event) {
    throw new NotFoundError('Event not found');
  }

  // Get available ticket types
  const availableTicketTypes = event.getAvailableTicketTypes();

  return successResponse(res, {
    ticketTypes: availableTicketTypes.map(tt => ({
      id: tt._id,
      name: tt.name,
      description: tt.description,
      price: tt.price,
      capacity: tt.capacity,
      soldCount: tt.soldCount,
      remainingCapacity: tt.capacity ? tt.capacity - tt.soldCount : null,
      salesStartDate: tt.salesStartDate,
      salesEndDate: tt.salesEndDate
    }))
  });
});

// @desc    Create event with image (Admin only)
// @route   POST /api/v1/events/admin/create-with-image
// @access  Admin
exports.createEventWithImageAdmin = asyncHandler(async (req, res) => {
  try {
    const {
      title,
      description,
      startTime,
      endTime,
      venue,
      ticketFee,
      createdBy = 'Jaaiye'
    } = req.body;

    // Validate required fields
    if (!title || !startTime) {
      throw new ValidationError('Title and start time are required');
    }

    // Validate ticketFee
    if (ticketFee !== undefined && ticketFee !== null && ticketFee !== 'free' && (isNaN(ticketFee) || ticketFee < 0)) {
      throw new ValidationError('Ticket fee must be "free", null, or a positive number');
    }

    // Handle image upload if provided
    let imageUrl = null;
    console.log("1. ", req.file)
    if (req.file) {
      const uploadResult = await CloudinaryService.uploadImage(req.file.buffer, {
        folder: 'jaaiye/events',
        transformation: [
          { width: 800, height: 600, crop: 'fill', quality: 'auto' }
        ]
      });

      if (!uploadResult.success) {
        throw new ValidationError('Failed to upload image: ' + uploadResult.error);
      }

      imageUrl = uploadResult.url;
    }

    // For admin events, we'll create a special "Jaaiye" calendar or use a default one
    let calendar;
    let calendarId;

    // Try to find or create a Jaaiye calendar
    calendar = await Calendar.findOne({ name: 'Jaaiye Events' });
    if (!calendar) {
      // Create a default Jaaiye calendar
      calendar = await Calendar.create({
        name: 'Jaaiye Events',
        description: 'Official Jaaiye events calendar',
        owner: req.user.id, // Admin user owns this calendar
        isPublic: true,
        color: '#3B82F6'
      });
    }
    calendarId = calendar._id;

    // Default endTime to 8 hours after startTime if not provided
    const computedEndTime = endTime && endTime !== 'null' && endTime !== 'undefined'
      ? endTime
      : new Date(new Date(startTime).getTime() + 8 * 60 * 60 * 1000);

    // Create event with createdBy field
    const event = await Event.create({
      calendar: calendarId,
      title,
      description,
      startTime,
      endTime: computedEndTime,
      venue,
      category: 'event',
      ticketFee: ticketFee === 'free' ? 'free' : ticketFee,
      image: imageUrl,
      createdBy: createdBy,
      creator: req.user.id // Admin user as creator
    });

    // Populate the event for response
    const populatedEvent = await Event.findById(event._id)
      .populate('calendar', 'name color')

    logger.info('Admin event created with image', {
      eventId: event._id,
      adminId: req.user.id,
      createdBy: createdBy,
      hasImage: !!imageUrl
    });

    return successResponse(res, { event: populatedEvent }, 201, 'Admin event created successfully');
  } catch (error) {
    logger.error('Error creating admin event with image', {
      error: error.message,
      adminId: req.user?.id,
      eventData: req.body
    });
    throw error;
  }
});

// @desc    Get all Jaaiye events
// @route   GET /api/v1/events/jaaiye
// @access  Public
exports.getJaaiyeEvents = asyncHandler(async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      upcoming = true,
      sortBy = 'startTime',
      sortOrder = 'asc'
    } = req.query;

    // Build filter
    const filter = { createdBy: 'Jaaiye' };

    if (upcoming === 'true') {
      filter.startTime = { $gte: new Date() };
    }

    // Build sort
    const sort = {};
    sort[sortBy] = sortOrder === 'desc' ? -1 : 1;

    // Calculate pagination
    const skip = (parseInt(page) - 1) * parseInt(limit);

    // Get events
    const events = await Event.find(filter)
      .sort(sort)
      .skip(skip)
      .limit(parseInt(limit));

    // Get total count for pagination
    const totalCount = await Event.countDocuments(filter);
    const totalPages = Math.ceil(totalCount / parseInt(limit));

    logger.info('Jaaiye events retrieved', {
      count: events.length,
      totalCount,
      page: parseInt(page),
      totalPages,
      filter
    });

    return successResponse(res, {
      events,
      pagination: {
        currentPage: parseInt(page),
        totalPages,
        totalCount,
        hasNextPage: parseInt(page) < totalPages,
        hasPrevPage: parseInt(page) > 1
      }
    });
  } catch (error) {
    logger.error('Error retrieving Jaaiye events', {
      error: error.message,
      query: req.query
    });
    throw error;
  }
});
