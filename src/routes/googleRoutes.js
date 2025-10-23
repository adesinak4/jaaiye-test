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

/**
 * @swagger
 * tags:
 *   name: Google
 *   description: Google Calendar integration
 */

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
    const selectedCalendarIds = user.googleCalendar.selectedCalendarIds || [];
    const formattedCalendars = googleUtils.formatGoogleCalendarData(calendars, selectedCalendarIds);

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
    const { action, calendarId } = req.body;

    // Validate required fields
    if (!action || !calendarId) {
      return errorResponse(res, new Error('action and calendarId are required'), 400);
    }

    if (!['add', 'remove'].includes(action)) {
      return errorResponse(res, new Error('action must be "add" or "remove"'), 400);
    }

    const user = await User.findById(req.user._id || req.user.id);
    if (!user.googleCalendar) {
      return errorResponse(res, {
        error: 'not_linked',
        message: 'No Google account linked.'
      }, 400);
    }

    // Initialize selectedCalendarIds if it doesn't exist
    if (!user.googleCalendar.selectedCalendarIds) {
      user.googleCalendar.selectedCalendarIds = [];
    }

    let message = '';
    let updatedCalendarIds = [...user.googleCalendar.selectedCalendarIds];

    if (action === 'add') {
      // Add calendar ID if not already present
      if (!updatedCalendarIds.includes(calendarId)) {
        updatedCalendarIds.push(calendarId);
        message = 'Calendar added successfully';
      } else {
        message = 'Calendar already selected';
      }
    } else if (action === 'remove') {
      // Remove calendar ID if present
      const index = updatedCalendarIds.indexOf(calendarId);
      if (index > -1) {
        updatedCalendarIds.splice(index, 1);
        message = 'Calendar removed successfully';
      } else {
        message = 'Calendar was not selected';
      }
    }

    // Update user's selected calendar IDs
    user.googleCalendar.selectedCalendarIds = updatedCalendarIds;
    await user.save();

    return successResponse(res, {
      selectedCalendarIds: updatedCalendarIds,
      message,
      action,
      calendarId
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

    const calendarIds = user.googleCalendar.selectedCalendarIds;

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
/**
 * @swagger
 * /api/v1/google/link:
 *   post:
 *     summary: Link or update Google account using serverAuthCode
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               serverAuthCode:
 *                 type: string
 *     responses:
 *       200:
 *         description: Linked/Updated
 */
router.post('/link', apiLimiter, handleGoogleLink);
/**
 * @swagger
 * /api/v1/google/refresh:
 *   post:
 *     summary: Refresh Google access token
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Refreshed
 */
router.post('/refresh', apiLimiter, handleTokenRefresh);
/**
 * @swagger
 * /api/v1/google/link:
 *   delete:
 *     summary: Unlink Google account
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Unlinked
 */
router.delete('/link', apiLimiter, handleGoogleUnlink);

// Calendar operations
/**
 * @swagger
 * /api/v1/google/calendars:
 *   get:
 *     summary: List Google calendars
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/calendars', apiLimiter, handleListCalendars);
/**
 * @swagger
 * /api/v1/google/calendars/select:
 *   post:
 *     summary: Add or remove Google calendar from selection
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [action, calendarId]
 *             properties:
 *               action:
 *                 type: string
 *                 enum: [add, remove]
 *                 description: Action to perform on the calendar
 *               calendarId:
 *                 type: string
 *                 description: Google calendar ID to add or remove
 *     responses:
 *       200:
 *         description: Calendar selection updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     selectedCalendarIds:
 *                       type: array
 *                       items:
 *                         type: string
 *                     message:
 *                       type: string
 *                     action:
 *                       type: string
 *                     calendarId:
 *                       type: string
 */
router.post('/calendars/select', apiLimiter, handleSelectCalendars);
/**
 * @swagger
 * /api/v1/google/calendar-mapping:
 *   post:
 *     summary: Create or update calendar mapping (Google ↔ Jaaiye)
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               googleCalendarId: { type: string }
 *               jaaiyeCalendarId: { type: string }
 *     responses:
 *       201:
 *         description: Created
 */
router.post('/calendar-mapping', apiLimiter, handleCalendarMapping);
/**
 * @swagger
 * /api/v1/google/calendar-mapping:
 *   get:
 *     summary: Get calendar mappings
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/calendar-mapping', apiLimiter, handleGetCalendarMapping);

// Event operations
/**
 * @swagger
 * /api/v1/google/events:
 *   post:
 *     summary: List Google events by time range
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [timeMin, timeMax]
 *             properties:
 *               timeMin: { type: string, format: date-time }
 *               timeMax: { type: string, format: date-time }
 *               calendarIds:
 *                 type: array
 *                 items: { type: string }
 *               includeAllDay: { type: boolean }
 *               maxResults: { type: number }
 *               viewType: { type: string }
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/events', apiLimiter, handleListEvents);
/**
 * @swagger
 * /api/v1/google/freebusy:
 *   post:
 *     summary: Get Google free/busy
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [timeMin, timeMax]
 *             properties:
 *               timeMin: { type: string, format: date-time }
 *               timeMax: { type: string, format: date-time }
 *               calendarIds:
 *                 type: array
 *                 items: { type: string }
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/freebusy', apiLimiter, handleFreeBusy);

// Unified calendar (MAIN ENDPOINT)
/**
 * @swagger
 * /api/v1/google/unified-calendar:
 *   get:
 *     summary: Get unified calendar (Jaaiye + Google)
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: timeMin
 *         required: true
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: timeMax
 *         required: true
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: includeJaaiye
 *         schema: { type: boolean }
 *       - in: query
 *         name: includeGoogle
 *         schema: { type: boolean }
 *       - in: query
 *         name: viewType
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/unified-calendar', apiLimiter, handleUnifiedCalendar);
/**
 * @swagger
 * /api/v1/google/calendar/monthly/{year}/{month}:
 *   get:
 *     summary: Get monthly calendar grid
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: year
 *         required: true
 *         schema: { type: integer }
 *       - in: path
 *         name: month
 *         required: true
 *         schema: { type: integer }
 *       - in: query
 *         name: includeJaaiye
 *         schema: { type: boolean }
 *       - in: query
 *         name: includeGoogle
 *         schema: { type: boolean }
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/calendar/monthly/:year/:month', apiLimiter, handleMonthlyCalendar);

// Advanced features
/**
 * @swagger
 * /api/v1/google/sync/backfill:
 *   post:
 *     summary: Backfill sync for Google Calendar
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               calendarId: { type: string }
 *               daysBack: { type: integer }
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/sync/backfill', apiLimiter, handleBackfillSync);
/**
 * @swagger
 * /api/v1/google/watch/start:
 *   post:
 *     summary: Start Google Calendar watch
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               calendarId: { type: string }
 *     responses:
 *       201:
 *         description: Started
 */
router.post('/watch/start', apiLimiter, handleStartWatch);
/**
 * @swagger
 * /api/v1/google/watch/stop:
 *   post:
 *     summary: Stop Google Calendar watch
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               calendarId: { type: string }
 *     responses:
 *       200:
 *         description: Stopped
 */
router.post('/watch/stop', apiLimiter, handleStopWatch);

// Utilities
/**
 * @swagger
 * /api/v1/google/diagnostics:
 *   get:
 *     summary: Google OAuth diagnostics
 *     tags: [Google]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 */
router.get('/diagnostics', apiLimiter, handleDiagnostics);
router.get('/callback', handleOAuthCallback);

module.exports = router;