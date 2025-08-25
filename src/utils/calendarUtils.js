const Calendar = require('../models/Calendar');
const Event = require('../models/Event');
const User = require('../models/User');
const logger = require('./logger');

/**
 * Create a new Jaaiye calendar
 */
exports.createJaaiyeCalendar = async (userId, calendarData) => {
  try {
    const calendar = await Calendar.create({
      user: userId,
      name: calendarData.name || 'My Calendar',
      color: calendarData.color || '#4285F4',
      isDefault: calendarData.isDefault || false
    });

    logger.info('Jaaiye calendar created', { userId, calendarId: calendar._id });
    return calendar;
  } catch (error) {
    logger.error('Failed to create Jaaiye calendar', { userId, error: error.message });
    throw error;
  }
};

/**
 * Get all Jaaiye calendars for a user (including shared ones)
 */
exports.getJaaiyeCalendars = async (userId, includeShared = true) => {
  try {
    let query = { user: userId };

    if (includeShared) {
      query = {
        $or: [
          { user: userId },
          { 'sharedWith.user': userId }
        ]
      };
    }

    const calendars = await Calendar.find(query);
    logger.info('Jaaiye calendars retrieved', { userId, count: calendars.length });
    return calendars;
  } catch (error) {
    logger.error('Failed to get Jaaiye calendars', { userId, error: error.message });
    throw error;
  }
};

/**
 * Get events from Jaaiye calendars within a time range
 */
exports.getJaaiyeEvents = async (userId, timeMin, timeMax, options = {}) => {
  try {
    const { includeAllDay = true, maxResults = 100 } = options;

    // Get user's calendars
    const calendars = await exports.getJaaiyeCalendars(userId);
    const calendarIds = calendars.map(c => c._id);

    if (calendarIds.length === 0) {
      return [];
    }

    // Build query
    const query = {
      calendar: { $in: calendarIds },
      startTime: { $lt: timeMax },
      endTime: { $gt: timeMin }
    };

    if (!includeAllDay) {
      query.isAllDay = false;
    }

    const events = await Event.find(query)
      .populate('calendar', 'name color')
      .sort({ startTime: 1 })
      .limit(maxResults);

    logger.info('Jaaiye events retrieved', { userId, count: events.length });
    return events;
  } catch (error) {
    logger.error('Failed to get Jaaiye events', { userId, error: error.message });
    throw error;
  }
};

/**
 * Get calendar color (with fallback)
 */
exports.getCalendarColor = (calendarId, source = 'jaaiye', calendarData = {}) => {
  if (source === 'google') {
    // Use Google calendar color if available
    return calendarData.color || '#4285F4';
  }

  // Use Jaaiye calendar color
  return calendarData.color || '#4285F4';
};

/**
 * Validate time range parameters
 */
exports.validateTimeRange = (timeMin, timeMax) => {
  if (!timeMin || !timeMax) {
    throw new Error('timeMin and timeMax are required (ISO strings)');
  }

  const start = new Date(timeMin);
  const end = new Date(timeMax);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date format. Use ISO 8601 strings');
  }

  if (start >= end) {
    throw new Error('timeMin must be before timeMax');
  }

  return { start, end };
};

/**
 * Group events by month for calendar view
 */
exports.groupEventsByMonth = (events, timeMin, timeMax) => {
  try {
    const months = {};

    events.forEach(event => {
      const startTime = new Date(event.startTime || event.start?.dateTime || event.start?.date);
      const monthKey = `${startTime.getFullYear()}-${String(startTime.getMonth() + 1).padStart(2, '0')}`;

      if (!months[monthKey]) {
        months[monthKey] = {
          year: startTime.getFullYear(),
          month: startTime.getMonth() + 1,
          monthName: startTime.toLocaleString('default', { month: 'long' }),
          events: []
        };
      }

      months[monthKey].events.push(event);
    });

    // Sort months chronologically
    const sortedMonths = Object.values(months).sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      return a.month - b.month;
    });

    return {
      months: sortedMonths,
      totalEvents: events.length
    };
  } catch (error) {
    logger.error('Failed to group events by month', { error: error.message });
    throw error;
  }
};

/**
 * Create monthly calendar grid
 */
exports.createMonthlyCalendarGrid = (year, month, events = []) => {
  try {
    const firstDay = new Date(year, month - 1, 1);
    const lastDay = new Date(year, month, 0);
    const startDate = new Date(firstDay);

    // Adjust to start from Sunday (0) or Monday (1)
    const startDay = startDate.getDay();
    const startOffset = startDay === 0 ? 0 : startDay;
    startDate.setDate(startDate.getDate() - startOffset);

    const weeks = [];
    let currentWeek = [];

    // Create calendar grid
    for (let i = 0; i < 42; i++) { // 6 weeks * 7 days
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);

      const dayEvents = events.filter(event => {
        const eventDate = new Date(event.startTime || event.start?.dateTime || event.start?.date);
        return eventDate.toDateString() === currentDate.toDateString();
      });

      const dayData = {
        date: new Date(currentDate),
        dayOfMonth: currentDate.getDate(),
        isCurrentMonth: currentDate.getMonth() === month - 1,
        isToday: currentDate.toDateString() === new Date().toDateString(),
        events: dayEvents,
        eventCount: dayEvents.length
      };

      currentWeek.push(dayData);

      if (currentWeek.length === 7) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
    }

    return {
      year,
      month,
      monthName: new Date(year, month - 1).toLocaleString('default', { month: 'long' }),
      weeks,
      totalEvents: events.length
    };
  } catch (error) {
    logger.error('Failed to create monthly calendar grid', { year, month, error: error.message });
    throw error;
  }
};

/**
 * Map Google Calendar ID to Jaaiye Calendar ID
 */
exports.mapGoogleToJaaiyeCalendar = async (googleCalendarId, jaaiyeCalendarId, userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error('User not found');
    }

    if (!user.googleCalendar) {
      user.googleCalendar = {};
    }

    // Check if mapping already exists
    const existingMapping = user.googleCalendar.calendarMappings?.find(
      m => m.googleCalendarId === googleCalendarId
    );

    if (existingMapping) {
      existingMapping.jaaiyeCalendarId = jaaiyeCalendarId;
      existingMapping.updatedAt = new Date();
    } else {
      if (!user.googleCalendar.calendarMappings) {
        user.googleCalendar.calendarMappings = [];
      }

      user.googleCalendar.calendarMappings.push({
        googleCalendarId,
        jaaiyeCalendarId,
        createdAt: new Date()
      });
    }

    await user.save();
    logger.info('Calendar mapping created/updated', { userId, googleCalendarId, jaaiyeCalendarId });

    return user.googleCalendar.calendarMappings;
  } catch (error) {
    logger.error('Failed to map Google to Jaaiye calendar', {
      userId, googleCalendarId, jaaiyeCalendarId, error: error.message
    });
    throw error;
  }
};

/**
 * Get calendar mappings for a user
 */
exports.getCalendarMappings = async (userId) => {
  try {
    const user = await User.findById(userId).populate('googleCalendar.calendarMappings.jaaiyeCalendarId');

    if (!user?.googleCalendar?.calendarMappings) {
      return [];
    }

    return user.googleCalendar.calendarMappings;
  } catch (error) {
    logger.error('Failed to get calendar mappings', { userId, error: error.message });
    throw error;
  }
};
