const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { apiLimiter, securityHeaders, sanitizeRequest } = require('../middleware/securityMiddleware');
const { successResponse, errorResponse } = require('../utils/response');
const googleSvc = require('../services/googleCalendarService');
const calendarService = require('../services/calendarService');
const googleUtils = require('../utils/googleUtils');
const User = require('../models/User');

router.use(securityHeaders);
router.use(sanitizeRequest);
router.use(protect);

// ============================================================================
// CORE OAUTH OPERATIONS
// ============================================================================

/**
 * Link/Update Google account with serverAuthCode (POST handles both initial linking and updating)
 */
const handleGoogleLink = async (req, res) => {
  try {
    const { serverAuthCode } = req.body;
    if (!serverAuthCode) {
      return errorResponse(res, new Error('serverAuthCode is required'), 400);
    }

    const user = await User.findById(req.user._id || req.user.id);
    const isUpdating = !!(user.googleCalendar && user.googleCalendar.refreshToken);

    // Exchange the auth code for tokens
    const tokens = await googleSvc.exchangeServerAuthCode(serverAuthCode);
    await googleSvc.saveTokensToUser(user, tokens);

    // Ensure the Jaaiye calendar exists using fresh tokens
    await googleSvc.ensureJaaiyeCalendar(user, tokens);

    const message = isUpdating
      ? 'Google account link updated successfully'
      : 'Google account linked successfully';

    return successResponse(res, null, 200, message);
  } catch (err) {
    console.error('Google account linking error:', err);
    const errorData = googleUtils.handleGoogleOAuthError(err, res);
    return errorResponse(res, errorData, errorData.statusCode);
  }
};

/**
 * Refresh Google access token using refresh token
 */
const handleTokenRefresh = async (req, res) => {
  try {
    const user = await User.findById(req.user._id || req.user.id)
      .select('+googleCalendar.refreshToken +googleCalendar.accessToken +googleCalendar.expiryDate');

    if (!user.googleCalendar || !user.googleCalendar.refreshToken) {
      return errorResponse(res, {
        error: 'not_linked',
        message: 'No Google account linked. Please link your Google account first.'
      }, 400);
    }

    const newTokens = await googleSvc.refreshAccessToken(user);

    // Update user with new tokens
    user.googleCalendar.accessToken = newTokens.access_token;
    user.googleCalendar.expiryDate = newTokens.expiry_date;
    await user.save();

    return successResponse(res, {
      message: 'Access token refreshed successfully',
      expiresAt: newTokens.expiry_date
    });
  } catch (err) {
    console.error('Token refresh error:', err);
    const errorData = googleUtils.handleGoogleOAuthError(err, res);
    return errorResponse(res, errorData, errorData.statusCode);
  }
};

/**
 * Unlink Google account
 */
const handleGoogleUnlink = async (req, res) => {
  try {
    const user = await User.findById(req.user._id || req.user.id);

    if (!user.googleCalendar || !user.googleCalendar.refreshToken) {
      return errorResponse(res, {
        error: 'not_linked',
        message: 'No Google account linked to unlink.'
      }, 400);
    }

    // Clear Google Calendar data
    user.googleCalendar = undefined;
    await user.save();

    return successResponse(res, null, 200, 'Google account unlinked successfully');
  } catch (err) {
    console.error('Google account unlinking error:', err);
    return errorResponse(res, err, 500);
  }
};

// ============================================================================
// CALENDAR OPERATIONS
// ============================================================================

/**
 * List Google Calendars
 */
const handleListCalendars = async (req, res) => {
  try {
    const user = await User.findById(req.user._id || req.user.id)
      .select('+googleCalendar.refreshToken +googleCalendar.accessToken');

    if (!user.googleCalendar || !user.googleCalendar.refreshToken) {
      return errorResponse(res, {
        error: 'not_linked',
        message: 'No Google account linked. Please link your Google account first.'
      }, 400);
    }

    const calendars = await googleSvc.listCalendars(user);
    const formattedCalendars = googleUtils.formatGoogleCalendarData(calendars);

    return successResponse(res, {
      calendars: Object.values(formattedCalendars),
      total: Object.keys(formattedCalendars).length
    });
  } catch (err) {
    console.error('List calendars error:', err);
    const errorData = googleUtils.handleGoogleOAuthError(err, res);
    return errorResponse(res, errorData, errorData.statusCode);
  }
};

/**
 * Select Google Calendars for sync
 */
const handleSelectCalendars = async (req, res) => {
  try {
    const { calendarIds } = req.body;
    if (!Array.isArray(calendarIds)) {
      return errorResponse(res, new Error('calendarIds must be an array'), 400);
    }

    const user = await User.findById(req.user._id || req.user.id);
    if (!user.googleCalendar) {
      return errorResponse(res, {
        error: 'not_linked',
        message: 'No Google account linked.'
      }, 400);
    }

    user.googleCalendar.selectedCalendarIds = calendarIds;
    await user.save();

    return successResponse(res, {
      selectedCalendarIds: calendarIds,
      message: 'Calendar selection updated successfully'
    });
  } catch (err) {
    console.error('Select calendars error:', err);
    return errorResponse(res, err, 500);
  }
};

/**
 * Create or update calendar mapping
 */
const handleCalendarMapping = async (req, res) => {
  try {
    const { googleCalendarId, jaaiyeCalendarId } = req.body;

    if (!googleCalendarId || !jaaiyeCalendarId) {
      return errorResponse(res, new Error('googleCalendarId and jaaiyeCalendarId are required'), 400);
    }

    const mappings = await calendarService.createCalendarMapping(
      req.user._id || req.user.id,
      googleCalendarId,
      jaaiyeCalendarId
    );

    return successResponse(res, { mappings }, 201, 'Calendar mapping created successfully');
  } catch (err) {
    console.error('Calendar mapping error:', err);
    return errorResponse(res, err, 500);
  }
};

/**
 * Get calendar mappings
 */
const handleGetCalendarMapping = async (req, res) => {
  try {
    const mappings = await calendarService.getCalendarMappings(req.user._id || req.user.id);
    return successResponse(res, { mappings });
  } catch (err) {
    console.error('Get calendar mapping error:', err);
    return errorResponse(res, err, 500);
  }
};

// ============================================================================
// EVENT OPERATIONS
// ============================================================================

/**
 * List Google Calendar events
 */
const handleListEvents = async (req, res) => {
  try {
    const {
      timeMin,
      timeMax,
      calendarIds,
      includeAllDay = true,
      maxResults = 100,
      viewType = 'monthly'
    } = req.body;

    if (!timeMin || !timeMax) {
      return errorResponse(res, new Error('timeMin and timeMax are required (ISO strings)'), 400);
    }

    const user = await User.findById(req.user._id || req.user.id)
      .select('+googleCalendar.refreshToken +googleCalendar.accessToken +googleCalendar.selectedCalendarIds');

    if (!user.googleCalendar || !user.googleCalendar.refreshToken) {
      return errorResponse(res, {
        error: 'not_linked',
        message: 'No Google account linked. Please link your Google account first.'
      }, 400);
    }

    const events = await googleSvc.listEvents(user, timeMin, timeMax, calendarIds);

    // Get calendar information for event enhancement
    const calendars = await googleSvc.listCalendars(user);
    const formattedCalendars = googleUtils.formatGoogleCalendarData(calendars);

    // Enhance events with calendar information
    const enhancedEvents = events.map(event => {
      const calendarId = event.organizer?.email || event.calendarId || 'primary';
      const calendar = formattedCalendars[calendarId] || {};

      return {
        id: event.id,
        title: event.summary || 'No Title',
        description: event.description || '',
        location: event.location || '',
        startTime: event.start?.dateTime || event.start?.date,
        endTime: event.end?.dateTime || event.end?.date,
        isAllDay: !!event.start?.date,
        calendar: {
          id: calendarId,
          name: calendar.name || 'Google Calendar',
          color: calendar.color || '#4285F4'
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

    return successResponse(res, {
      events: enhancedEvents,
      total: enhancedEvents.length,
      timeRange: { start: timeMin, end: timeMax },
      viewType: viewType
    });
  } catch (err) {
    console.error('List events error:', err);
    const errorData = googleUtils.handleGoogleOAuthError(err, res);
    return errorResponse(res, errorData, errorData.statusCode);
  }
};

/**
 * Get free/busy information
 */
const handleFreeBusy = async (req, res) => {
  try {
    const { timeMin, timeMax, calendarIds } = req.body;

    if (!timeMin || !timeMax) {
      return errorResponse(res, new Error('timeMin and timeMax are required (ISO strings)'), 400);
    }

    const user = await User.findById(req.user._id || req.user.id)
      .select('+googleCalendar.refreshToken +googleCalendar.accessToken');

    if (!user.googleCalendar || !user.googleCalendar.refreshToken) {
      return errorResponse(res, {
        error: 'not_linked',
        message: 'No Google account linked. Please link your Google account first.'
      }, 400);
    }

    const freeBusy = await googleSvc.getFreeBusy(user, {
      timeMin,
      timeMax,
      calendarIds: calendarIds || ['primary']
    });

    return successResponse(res, { freeBusy });
  } catch (err) {
    console.error('Free/busy error:', err);
    const errorData = googleUtils.handleGoogleOAuthError(err, res);
    return errorResponse(res, errorData, errorData.statusCode);
  }
};

// ============================================================================
// UNIFIED CALENDAR (MAIN ENDPOINT)
// ============================================================================

/**
 * Get unified calendar combining Jaaiye and Google events
 */
const handleUnifiedCalendar = async (req, res) => {
  try {
    const {
      timeMin,
      timeMax,
      includeJaaiye = true,
      includeGoogle = true,
      viewType = 'monthly'
    } = req.query;

    if (!timeMin || !timeMax) {
      return errorResponse(res, new Error('timeMin and timeMax are required (ISO strings)'), 400);
    }

    const calendarData = await calendarService.getUnifiedCalendar(
      req.user._id || req.user.id,
      timeMin,
      timeMax,
      { includeJaaiye, includeGoogle, viewType }
    );

    return successResponse(res, calendarData);
  } catch (err) {
    console.error('Unified calendar error:', err);
    return errorResponse(res, err, 500);
  }
};

/**
 * Get monthly calendar grid view
 */
const handleMonthlyCalendar = async (req, res) => {
  try {
    const { year, month } = req.params;
    const { includeJaaiye = true, includeGoogle = true } = req.query;

    const yearNum = parseInt(year);
    const monthNum = parseInt(month);

    if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      return errorResponse(res, new Error('Invalid year or month'), 400);
    }

    const monthlyGrid = await calendarService.getMonthlyCalendarGrid(
      req.user._id || req.user.id,
      yearNum,
      monthNum,
      { includeJaaiye, includeGoogle }
    );

    return successResponse(res, monthlyGrid);
  } catch (err) {
    console.error('Monthly calendar error:', err);
    return errorResponse(res, err, 500);
  }
};

// ============================================================================
// ADVANCED FEATURES
// ============================================================================

/**
 * Start Google Calendar watch for real-time updates
 */
const handleStartWatch = async (req, res) => {
  try {
    const { calendarId } = req.body;

    const user = await User.findById(req.user._id || req.user.id)
      .select('+googleCalendar.refreshToken +googleCalendar.accessToken');

    if (!user.googleCalendar || !user.googleCalendar.refreshToken) {
      return errorResponse(res, {
        error: 'not_linked',
        message: 'No Google account linked.'
      }, 400);
    }

    const watchResult = await googleSvc.startWatch(user, calendarId);
    return successResponse(res, watchResult, 201, 'Watch started successfully');
  } catch (err) {
    console.error('Start watch error:', err);
    const errorData = googleUtils.handleGoogleOAuthError(err, res);
    return errorResponse(res, errorData, errorData.statusCode);
  }
};

/**
 * Stop Google Calendar watch
 */
const handleStopWatch = async (req, res) => {
  try {
    const { calendarId } = req.body;

    const user = await User.findById(req.user._id || req.user.id)
      .select('+googleCalendar.refreshToken +googleCalendar.accessToken');

    if (!user.googleCalendar || !user.googleCalendar.refreshToken) {
      return errorResponse(res, {
        error: 'not_linked',
        message: 'No Google account linked.'
      }, 400);
    }

    await googleSvc.stopWatch(user, calendarId);
    return successResponse(res, null, 200, 'Watch stopped successfully');
  } catch (err) {
    console.error('Stop watch error:', err);
    const errorData = googleUtils.handleGoogleOAuthError(err, res);
    return errorResponse(res, errorData, errorData.statusCode);
  }
};

/**
 * Backfill sync for Google Calendar
 */
const handleBackfillSync = async (req, res) => {
  try {
    const { calendarId, daysBack = 30 } = req.body;

    const user = await User.findById(req.user._id || req.user.id)
      .select('+googleCalendar.refreshToken +googleCalendar.accessToken');

    if (!user.googleCalendar || !user.googleCalendar.refreshToken) {
      return errorResponse(res, {
        error: 'not_linked',
        message: 'No Google account linked.'
      }, 400);
    }

    const syncResult = await googleSvc.backfillSync(user, calendarId, daysBack);
    return successResponse(res, syncResult, 200, 'Backfill sync completed');
  } catch (err) {
    console.error('Backfill sync error:', err);
    const errorData = googleUtils.handleGoogleOAuthError(err, res);
    return errorResponse(res, errorData, errorData.statusCode);
  }
};

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Get Google OAuth diagnostics
 */
const handleDiagnostics = async (req, res) => {
  try {
    const diagnostics = {
      environment: process.env.NODE_ENV || 'development',
      googleClientId: !!process.env.GOOGLE_CLIENT_ID,
      googleClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      googleRedirectUri: !!process.env.GOOGLE_REDIRECT_URI,
      googleWebhookUrl: !!process.env.GOOGLE_WEBHOOK_URL,
      timestamp: new Date().toISOString()
    };

    // Check user's Google Calendar status
    const user = await User.findById(req.user._id || req.user.id)
      .select('+googleCalendar.refreshToken +googleCalendar.accessToken +googleCalendar.expiryDate +googleCalendar.scope');

    if (user?.googleCalendar) {
      diagnostics.userStatus = {
        hasRefreshToken: !!user.googleCalendar.refreshToken,
        hasAccessToken: !!user.googleCalendar.accessToken,
        hasExpiryDate: !!user.googleCalendar.expiryDate,
        hasScope: !!user.googleCalendar.scope,
        isExpired: user.googleCalendar.expiryDate ?
          new Date() >= new Date(user.googleCalendar.expiryDate) : true
      };
    } else {
      diagnostics.userStatus = {
        hasRefreshToken: false,
        hasAccessToken: false,
        hasExpiryDate: false,
        hasScope: false,
        isExpired: true
      };
    }

    return successResponse(res, diagnostics);
  } catch (err) {
    console.error('Diagnostics error:', err);
    return errorResponse(res, err, 500);
  }
};

/**
 * Handle OAuth callback (for debugging)
 */
const handleOAuthCallback = (req, res) => {
  try {
    const { code, error, state } = req.query;

    if (error) {
      return res.status(400).json({
        error: 'OAuth Error',
        message: error,
        state
      });
    }

    if (code) {
      return res.json({
        message: 'Authorization code received',
        code: code.substring(0, 10) + '...',
        state,
        note: 'This endpoint is for debugging. Use the /link endpoint with the serverAuthCode.'
      });
    }

    return res.json({
      message: 'OAuth callback endpoint',
      note: 'This endpoint receives Google OAuth callbacks for debugging purposes.'
    });
  } catch (err) {
    console.error('OAuth callback error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// ============================================================================
// ROUTE REGISTRATION
// ============================================================================

// Core OAuth operations
router.post('/link', apiLimiter, handleGoogleLink);
router.post('/refresh', apiLimiter, handleTokenRefresh);
router.delete('/link', apiLimiter, handleGoogleUnlink);

// Calendar operations
router.get('/calendars', apiLimiter, handleListCalendars);
router.post('/calendars/select', apiLimiter, handleSelectCalendars);
router.post('/calendar-mapping', apiLimiter, handleCalendarMapping);
router.get('/calendar-mapping', apiLimiter, handleGetCalendarMapping);

// Event operations
router.post('/events', apiLimiter, handleListEvents);
router.post('/freebusy', apiLimiter, handleFreeBusy);

// Unified calendar (MAIN ENDPOINT)
router.get('/unified-calendar', apiLimiter, handleUnifiedCalendar);
router.get('/calendar/monthly/:year/:month', apiLimiter, handleMonthlyCalendar);

// Advanced features
router.post('/sync/backfill', apiLimiter, handleBackfillSync);
router.post('/watch/start', apiLimiter, handleStartWatch);
router.post('/watch/stop', apiLimiter, handleStopWatch);

// Utilities
router.get('/diagnostics', apiLimiter, handleDiagnostics);
router.get('/callback', handleOAuthCallback);

module.exports = router;