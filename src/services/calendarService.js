const calendarUtils = require('../utils/calendarUtils');
const eventUtils = require('../utils/eventUtils');
const googleSvc = require('./googleCalendarService');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Get unified calendar data combining Jaaiye and Google Calendar events
 */
exports.getUnifiedCalendar = async (userId, timeMin, timeMax, options = {}) => {
  try {
    const {
      includeJaaiye = true,
      includeGoogle = true,
      viewType = 'monthly',
      includeAllDay = true,
      maxResults = 100
    } = options;
    
    // Validate time range
    const { start, end } = calendarUtils.validateTimeRange(timeMin, timeMax);
    
    const allEvents = [];
    
    // 1. Get Jaaiye calendar events
    if (includeJaaiye) {
      try {
        const jaaiyeEvents = await calendarUtils.getJaaiyeEvents(
          userId, 
          start.toISOString(), 
          end.toISOString(), 
          { includeAllDay, maxResults }
        );
        
        const enhancedJaaiyeEvents = eventUtils.enhanceJaaiyeEvents(jaaiyeEvents);
        allEvents.push(...enhancedJaaiyeEvents);
        
        logger.info('Jaaiye events retrieved for unified calendar', { 
          userId, count: jaaiyeEvents.length 
        });
      } catch (error) {
        logger.error('Failed to get Jaaiye events for unified calendar', { 
          userId, error: error.message 
        });
        // Continue with Google events if Jaaiye fails
      }
    }
    
    // 2. Get Google Calendar events
    if (includeGoogle) {
      try {
        const user = await User.findById(userId)
          .select('+googleCalendar.refreshToken +googleCalendar.accessToken +googleCalendar.selectedCalendarIds');
        
        if (user?.googleCalendar?.refreshToken) {
          const googleEvents = await googleSvc.listEvents(
            user, 
            null, // All calendars
            {
              timeMin: start.toISOString(),
              timeMax: end.toISOString(),
              includeAllDay,
              maxResults
            }
          );
          
          const enhancedGoogleEvents = eventUtils.enhanceGoogleEvents(googleEvents);
          allEvents.push(...enhancedGoogleEvents);
          
          logger.info('Google events retrieved for unified calendar', { 
            userId, count: googleEvents.length 
          });
        } else {
          logger.info('Google Calendar not linked for user', { userId });
        }
      } catch (error) {
        logger.error('Failed to get Google events for unified calendar', { 
          userId, error: error.message 
        });
        // Continue with Jaaiye events if Google fails
      }
    }
    
    // 3. Merge and deduplicate events
    const mergedEvents = eventUtils.mergeEvents(allEvents);
    const uniqueEvents = eventUtils.deduplicateEvents(mergedEvents);
    
    // 4. Create unified calendar data based on view type
    let calendarData;
    if (viewType === 'monthly') {
      calendarData = calendarUtils.groupEventsByMonth(uniqueEvents, timeMin, timeMax);
    } else {
      calendarData = { events: uniqueEvents };
    }
    
    logger.info('Unified calendar data created successfully', { 
      userId, 
      totalEvents: uniqueEvents.length,
      viewType,
      sources: { jaaiye: includeJaaiye, google: includeGoogle }
    });
    
    return {
      ...calendarData,
      total: uniqueEvents.length,
      timeRange: { start: timeMin, end: timeMax },
      viewType: viewType,
      sources: {
        jaaiye: includeJaaiye,
        google: includeGoogle
      }
    };
  } catch (error) {
    logger.error('Failed to get unified calendar', { userId, error: error.message });
    throw error;
  }
};

/**
 * Get monthly calendar grid view
 */
exports.getMonthlyCalendarGrid = async (userId, year, month, options = {}) => {
  try {
    const { includeJaaiye = true, includeGoogle = true } = options;
    
    // Calculate time range for the month
    const startDate = new Date(year, month - 1, 1);
    const endDate = new Date(year, month, 0, 23, 59, 59);
    
    // Get unified calendar data for the month
    const calendarData = await exports.getUnifiedCalendar(
      userId,
      startDate.toISOString(),
      endDate.toISOString(),
      { includeJaaiye, includeGoogle, viewType: 'list' }
    );
    
    // Create monthly grid
    const monthlyGrid = calendarUtils.createMonthlyCalendarGrid(year, month, calendarData.events);
    
    logger.info('Monthly calendar grid created', { 
      userId, year, month, eventCount: calendarData.events.length 
    });
    
    return monthlyGrid;
  } catch (error) {
    logger.error('Failed to get monthly calendar grid', { 
      userId, year, month, error: error.message 
    });
    throw error;
  }
};

/**
 * Get calendar mappings for a user
 */
exports.getCalendarMappings = async (userId) => {
  try {
    const mappings = await calendarUtils.getCalendarMappings(userId);
    
    logger.info('Calendar mappings retrieved', { userId, count: mappings.length });
    return mappings;
  } catch (error) {
    logger.error('Failed to get calendar mappings', { userId, error: error.message });
    throw error;
  }
};

/**
 * Create or update calendar mapping
 */
exports.createCalendarMapping = async (userId, googleCalendarId, jaaiyeCalendarId) => {
  try {
    const mappings = await calendarUtils.mapGoogleToJaaiyeCalendar(
      googleCalendarId, 
      jaaiyeCalendarId, 
      userId
    );
    
    logger.info('Calendar mapping created/updated', { 
      userId, googleCalendarId, jaaiyeCalendarId 
    });
    
    return mappings;
  } catch (error) {
    logger.error('Failed to create calendar mapping', { 
      userId, googleCalendarId, jaaiyeCalendarId, error: error.message 
    });
    throw error;
  }
};

/**
 * Get calendar summary statistics
 */
exports.getCalendarSummary = async (userId, timeMin, timeMax) => {
  try {
    const { start, end } = calendarUtils.validateTimeRange(timeMin, timeMax);
    
    // Get unified calendar data
    const calendarData = await exports.getUnifiedCalendar(
      userId,
      start.toISOString(),
      end.toISOString(),
      { viewType: 'list' }
    );
    
    // Calculate statistics
    const totalEvents = calendarData.total;
    const jaaiyeEvents = calendarData.events.filter(e => e.source === 'jaaiye').length;
    const googleEvents = calendarData.events.filter(e => e.source === 'google').length;
    
    // Group by calendar
    const calendarStats = {};
    calendarData.events.forEach(event => {
      const calendarId = event.calendar.id;
      if (!calendarStats[calendarId]) {
        calendarStats[calendarId] = {
          id: calendarId,
          name: event.calendar.name,
          color: event.calendar.color,
          source: event.source,
          eventCount: 0
        };
      }
      calendarStats[calendarId].eventCount++;
    });
    
    const summary = {
      totalEvents,
      sourceBreakdown: {
        jaaiye: jaaiyeEvents,
        google: googleEvents
      },
      calendarBreakdown: Object.values(calendarStats),
      timeRange: { start: timeMin, end: timeMax }
    };
    
    logger.info('Calendar summary created', { userId, summary });
    return summary;
  } catch (error) {
    logger.error('Failed to get calendar summary', { userId, error: error.message });
    throw error;
  }
};

/**
 * Search events across all calendars
 */
exports.searchEvents = async (userId, searchTerm, options = {}) => {
  try {
    const {
      timeMin,
      timeMax,
      includeJaaiye = true,
      includeGoogle = true,
      maxResults = 50
    } = options;
    
    let allEvents = [];
    
    // Get events from both sources
    if (timeMin && timeMax) {
      const calendarData = await exports.getUnifiedCalendar(
        userId,
        timeMin,
        timeMax,
        { includeJaaiye, includeGoogle, viewType: 'list', maxResults: 1000 }
      );
      allEvents = calendarData.events;
    } else {
      // If no time range, get recent events
      const endDate = new Date();
      const startDate = new Date(endDate.getTime() - (30 * 24 * 60 * 60 * 1000)); // 30 days ago
      
      const calendarData = await exports.getUnifiedCalendar(
        userId,
        startDate.toISOString(),
        endDate.toISOString(),
        { includeJaaiye, includeGoogle, viewType: 'list', maxResults: 1000 }
      );
      allEvents = calendarData.events;
    }
    
    // Filter events by search term
    const filteredEvents = eventUtils.filterEvents(allEvents, { 
      search: searchTerm,
      maxResults 
    });
    
    logger.info('Events searched successfully', { 
      userId, 
      searchTerm, 
      totalFound: filteredEvents.length 
    });
    
    return {
      events: filteredEvents,
      total: filteredEvents.length,
      searchTerm,
      timeRange: options.timeMin && options.timeMax ? 
        { start: options.timeMin, end: options.timeMax } : null
    };
  } catch (error) {
    logger.error('Failed to search events', { userId, searchTerm, error: error.message });
    throw error;
  }
};
