const logger = require('./logger');

/**
 * Enhance Jaaiye events with calendar information and mobile-friendly format
 */
exports.enhanceJaaiyeEvents = (events) => {
  try {
    return events.map(event => ({
      id: event._id,
      title: event.title,
      description: event.description,
      location: event.location,
      startTime: event.startTime,
      endTime: event.endTime,
      isAllDay: event.isAllDay,
      category: event.category,
      privacy: event.privacy,
      status: event.status,
      calendar: {
        id: event.calendar._id || event.calendar,
        name: event.calendar.name || 'Unknown Calendar',
        color: event.calendar.color || '#4285F4'
      },
      source: 'jaaiye',
      external: event.external,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt
    }));
  } catch (error) {
    logger.error('Failed to enhance Jaaiye events', { error: error.message });
    throw error;
  }
};

/**
 * Enhance Google Calendar events with mobile-friendly format
 */
exports.enhanceGoogleEvents = (events, googleCalendars = {}) => {
  try {
    return events.map(event => {
      const calendarId = event.organizer?.email || event.calendarId || 'primary';
      const calendar = googleCalendars[calendarId] || {};
      
      return {
        id: event.id,
        title: event.summary || 'No Title',
        description: event.description || '',
        location: event.location || '',
        startTime: event.start?.dateTime || event.start?.date,
        endTime: event.end?.dateTime || event.end?.date,
        isAllDay: !!event.start?.date, // Google uses 'date' for all-day events
        category: 'other', // Google doesn't have categories like Jaaiye
        privacy: 'public', // Google events are typically public
        status: event.status || 'scheduled',
        calendar: {
          id: calendarId,
          name: calendar.summary || 'Google Calendar',
          color: calendar.backgroundColor || '#4285F4'
        },
        source: 'google',
        external: {
          google: {
            calendarId: calendarId,
            eventId: event.id,
            etag: event.etag,
            htmlLink: event.htmlLink
          }
        },
        attendees: event.attendees || [],
        recurringEventId: event.recurringEventId,
        originalStartTime: event.originalStartTime,
        createdAt: event.created,
        updatedAt: event.updated
      };
    });
  } catch (error) {
    logger.error('Failed to enhance Google events', { error: error.message });
    throw error;
  }
};

/**
 * Merge and sort events from multiple sources
 */
exports.mergeEvents = (jaaiyeEvents = [], googleEvents = []) => {
  try {
    const allEvents = [...jaaiyeEvents, ...googleEvents];
    
    // Sort by start time
    allEvents.sort((a, b) => {
      const aStart = new Date(a.startTime || a.start?.dateTime || a.start?.date);
      const bStart = new Date(b.startTime || b.start?.dateTime || b.start?.date);
      return aStart - bStart;
    });
    
    logger.info('Events merged successfully', { 
      jaaiyeCount: jaaiyeEvents.length, 
      googleCount: googleEvents.length, 
      totalCount: allEvents.length 
    });
    
    return allEvents;
  } catch (error) {
    logger.error('Failed to merge events', { error: error.message });
    throw error;
  }
};

/**
 * Deduplicate events based on title, time, and calendar
 */
exports.deduplicateEvents = (events) => {
  try {
    const seen = new Map();
    const uniqueEvents = [];
    
    events.forEach(event => {
      const key = `${event.title}-${event.startTime || event.start?.dateTime || event.start?.date}-${event.calendar?.id}`;
      
      if (!seen.has(key)) {
        seen.set(key, true);
        uniqueEvents.push(event);
      } else {
        // If duplicate found, prefer Jaaiye events over Google
        const existingIndex = uniqueEvents.findIndex(e => {
          const existingKey = `${e.title}-${e.startTime || e.start?.dateTime || e.start?.date}-${e.calendar?.id}`;
          return existingKey === key;
        });
        
        if (existingIndex !== -1) {
          const existing = uniqueEvents[existingIndex];
          if (existing.source === 'google' && event.source === 'jaaiye') {
            // Replace Google event with Jaaiye event
            uniqueEvents[existingIndex] = event;
          }
        }
      }
    });
    
    logger.info('Events deduplicated', { 
      originalCount: events.length, 
      uniqueCount: uniqueEvents.length 
    });
    
    return uniqueEvents;
  } catch (error) {
    logger.error('Failed to deduplicate events', { error: error.message });
    throw error;
  }
};

/**
 * Normalize event data for consistent format
 */
exports.normalizeEventData = (event, source = 'unknown', calendarData = {}) => {
  try {
    const normalized = {
      id: event.id || event._id,
      title: event.title || event.summary || 'No Title',
      description: event.description || '',
      location: event.location || '',
      startTime: event.startTime || event.start?.dateTime || event.start?.date,
      endTime: event.endTime || event.end?.dateTime || event.end?.date,
      isAllDay: event.isAllDay || !!event.start?.date,
      category: event.category || 'other',
      privacy: event.privacy || 'public',
      status: event.status || 'scheduled',
      source: source,
      calendar: {
        id: event.calendar?.id || event.calendar?._id || 'unknown',
        name: event.calendar?.name || event.calendar?.summary || 'Unknown Calendar',
        color: event.calendar?.color || event.calendar?.backgroundColor || '#4285F4'
      },
      external: event.external || {},
      attendees: event.attendees || [],
      reminders: event.reminders || [],
      createdAt: event.createdAt || event.created,
      updatedAt: event.updatedAt || event.updated
    };
    
    // Add source-specific data
    if (source === 'google') {
      normalized.external.google = {
        calendarId: event.calendar?.id,
        eventId: event.id,
        etag: event.etag,
        htmlLink: event.htmlLink,
        recurringEventId: event.recurringEventId,
        originalStartTime: event.originalStartTime
      };
    } else if (source === 'jaaiye') {
      normalized.external.jaaiye = {
        calendarId: event.calendar?.id || event.calendar?._id,
        eventId: event._id
      };
    }
    
    return normalized;
  } catch (error) {
    logger.error('Failed to normalize event data', { error: error.message });
    throw error;
  }
};

/**
 * Format event for mobile UI display
 */
exports.formatEventForMobile = (event) => {
  try {
    return {
      id: event.id,
      title: event.title,
      description: event.description,
      location: event.location,
      startTime: event.startTime,
      endTime: event.endTime,
      isAllDay: event.isAllDay,
      category: event.category,
      privacy: event.privacy,
      status: event.status,
      source: event.source,
      calendar: {
        id: event.calendar.id,
        name: event.calendar.name,
        color: event.calendar.color
      },
      attendees: event.attendees || [],
      reminders: event.reminders || [],
      // Mobile-specific fields
      duration: event.isAllDay ? 'all-day' : 
        Math.round((new Date(event.endTime) - new Date(event.startTime)) / (1000 * 60)) + ' minutes',
      isUpcoming: new Date(event.startTime) > new Date(),
      isToday: new Date(event.startTime).toDateString() === new Date().toDateString()
    };
  } catch (error) {
    logger.error('Failed to format event for mobile', { error: error.message });
    throw error;
  }
};

/**
 * Filter events based on criteria
 */
exports.filterEvents = (events, filters = {}) => {
  try {
    let filteredEvents = [...events];
    
    // Filter by date range
    if (filters.startDate) {
      const startDate = new Date(filters.startDate);
      filteredEvents = filteredEvents.filter(event => {
        const eventStart = new Date(event.startTime || event.start?.dateTime || event.start?.date);
        return eventStart >= startDate;
      });
    }
    
    if (filters.endDate) {
      const endDate = new Date(filters.endDate);
      filteredEvents = filteredEvents.filter(event => {
        const eventEnd = new Date(event.endTime || event.end?.dateTime || event.end?.date);
        return eventEnd <= endDate;
      });
    }
    
    // Filter by calendar
    if (filters.calendarIds && filters.calendarIds.length > 0) {
      filteredEvents = filteredEvents.filter(event => 
        filters.calendarIds.includes(event.calendar.id)
      );
    }
    
    // Filter by source
    if (filters.sources && filters.sources.length > 0) {
      filteredEvents = filteredEvents.filter(event => 
        filters.sources.includes(event.source)
      );
    }
    
    // Filter by category
    if (filters.categories && filters.categories.length > 0) {
      filteredEvents = filteredEvents.filter(event => 
        filters.categories.includes(event.category)
      );
    }
    
    // Filter by search term
    if (filters.search) {
      const searchTerm = filters.search.toLowerCase();
      filteredEvents = filteredEvents.filter(event => 
        event.title.toLowerCase().includes(searchTerm) ||
        event.description.toLowerCase().includes(searchTerm) ||
        event.location.toLowerCase().includes(searchTerm)
      );
    }
    
    logger.info('Events filtered', { 
      originalCount: events.length, 
      filteredCount: filteredEvents.length,
      filters 
    });
    
    return filteredEvents;
  } catch (error) {
    logger.error('Failed to filter events', { error: error.message });
    throw error;
  }
};
