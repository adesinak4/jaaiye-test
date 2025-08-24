const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { apiLimiter, securityHeaders, sanitizeRequest } = require('../middleware/securityMiddleware');
const { successResponse, errorResponse } = require('../utils/response');
const googleSvc = require('../services/googleCalendarService');
const User = require('../models/User');

router.use(securityHeaders);
router.use(sanitizeRequest);
router.use(protect);

// Helper function to handle Google OAuth errors
function handleGoogleOAuthError(err, res) {
  const errorMessage = err.message || err.toString();

  // Handle specific Google OAuth errors
  if (errorMessage.includes('invalid_grant')) {
    return errorResponse(res, {
      error: 'invalid_grant',
      message: 'Google authorization has expired or was revoked. Please re-authenticate with Google.',
      requiresReauth: true
    }, 401);
  }

  if (errorMessage.includes('unauthorized_client')) {
    return errorResponse(res, {
      error: 'unauthorized_client',
      message: 'Google OAuth client is not authorized. Please check your Google OAuth configuration.',
      requiresConfigCheck: true
    }, 401);
  }

  if (errorMessage.includes('invalid_client')) {
    return errorResponse(res, {
      error: 'invalid_client',
      message: 'Invalid Google OAuth client configuration. Please check your client ID and secret.',
      requiresConfigCheck: true
    }, 401);
  }

  if (errorMessage.includes('access_denied')) {
    return errorResponse(res, {
      error: 'access_denied',
      message: 'Access to Google Calendar was denied. Please grant the required permissions.',
      requiresReauth: true
    }, 403);
  }

  // Generic Google API error
  return errorResponse(res, {
    error: 'google_api_error',
    message: 'Google API error occurred. Please try again later.',
    details: errorMessage
  }, 500);
}

// Link/Update Google account with serverAuthCode (POST handles both initial linking and updating)
router.post('/link', apiLimiter, async (req, res) => {
  console.log('Linking/Updating Google account with serverAuthCode: ', req.body);
  try {
    const { serverAuthCode } = req.body;
    if (!serverAuthCode) {
      return errorResponse(res, new Error('serverAuthCode is required'), 400);
    }

    const user = await User.findById(req.user._id || req.user.id);

    // Check if user already has Google linked
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
    return handleGoogleOAuthError(err, res);
  }
});

// Refresh Google access token using refresh token
router.post('/refresh', apiLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.user._id || req.user.id)
      .select('+googleCalendar.refreshToken +googleCalendar.accessToken +googleCalendar.expiryDate');

    if (!user.googleCalendar || !user.googleCalendar.refreshToken) {
      return errorResponse(res, {
        error: 'not_linked',
        message: 'No Google account linked. Please link your Google account first.'
      }, 400);
    }

    // Check if token refresh is needed
    const now = new Date();
    const tokenExpiry = user.googleCalendar.expiryDate;

    if (tokenExpiry && now < tokenExpiry) {
      return successResponse(res, {
        message: 'Access token is still valid',
        expiresAt: tokenExpiry
      }, 200);
    }

    // Refresh the token
    const newTokens = await googleSvc.refreshAccessToken(user);
    await googleSvc.saveTokensToUser(user, newTokens);

    return successResponse(res, {
      message: 'Access token refreshed successfully',
      expiresAt: newTokens.expiry_date
    }, 200);
  } catch (err) {
    console.error('Token refresh error:', err);
    return handleGoogleOAuthError(err, res);
  }
});

// Unlink Google account
router.delete('/link', apiLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.user._id || req.user.id);

    if (!user.googleCalendar || !user.googleCalendar.refreshToken) {
      return errorResponse(res, {
        error: 'not_linked',
        message: 'No Google account linked to unlink.'
      }, 400);
    }

    // Clear Google calendar data
    user.googleCalendar = undefined;
    user.providerLinks.google = false;
    await user.save();

    return successResponse(res, null, 200, 'Google account unlinked successfully');
  } catch (err) {
    console.error('Google account unlink error:', err);
    return errorResponse(res, err, 500);
  }
});

// List Google calendars
router.get('/calendars', apiLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.user._id || req.user.id).select('+googleCalendar.refreshToken +googleCalendar.accessToken');
    const calendars = await googleSvc.listCalendars(user);
    const selected = new Set(user.googleCalendar?.selectedCalendarIds || []);
    const data = calendars.map(c => ({ ...c, selected: selected.has(c.id) }));
    return successResponse(res, { calendars: data });
  } catch (err) {
    return errorResponse(res, err, 400);
  }
});

// Select calendars to include in unified view
router.post('/calendars/select', apiLimiter, async (req, res) => {
  try {
    const { calendarIds } = req.body;
    if (!Array.isArray(calendarIds)) {
      return errorResponse(res, new Error('calendarIds must be an array'), 400);
    }
    const user = await User.findById(req.user._id || req.user.id);
    user.googleCalendar = user.googleCalendar || {};
    user.googleCalendar.selectedCalendarIds = calendarIds;
    await user.save();
    return successResponse(res, null, 200, 'Calendars selection updated');
  } catch (err) {
    return errorResponse(res, err, 400);
  }
});

// Free/busy query
router.post('/freebusy', apiLimiter, async (req, res) => {
  try {
    const { timeMin, timeMax, calendarIds } = req.body;
    if (!timeMin || !timeMax) {
      return errorResponse(res, new Error('timeMin and timeMax are required (ISO strings)'), 400);
    }
    const user = await User.findById(req.user._id || req.user.id).select('+googleCalendar.refreshToken +googleCalendar.accessToken');
    const calendars = await googleSvc.freeBusy(user, timeMin, timeMax, calendarIds);
    return successResponse(res, { calendars });
  } catch (err) {
    return errorResponse(res, err, 400);
  }
});

// List provider events in a time range (MVP, read-only)
router.post('/events', apiLimiter, async (req, res) => {
  try {
    const { timeMin, timeMax, calendarIds } = req.body;
    if (!timeMin || !timeMax) {
      return errorResponse(res, new Error('timeMin and timeMax are required (ISO strings)'), 400);
    }
    const user = await User.findById(req.user._id || req.user.id).select('+googleCalendar.refreshToken +googleCalendar.accessToken');
    const events = await googleSvc.listEvents(user, timeMin, timeMax, calendarIds);
    return successResponse(res, { events });
  } catch (err) {
    return errorResponse(res, err, 400);
  }
});

// Backfill selected calendars (time-bounded)
router.post('/sync/backfill', apiLimiter, async (req, res) => {
  try {
    const { timeMin, timeMax } = req.body;
    if (!timeMin || !timeMax) {
      return errorResponse(res, new Error('timeMin and timeMax are required (ISO strings)'), 400);
    }
    const user = await User.findById(req.user._id || req.user.id).select('+googleCalendar.refreshToken +googleCalendar.accessToken');
    const perCal = await googleSvc.backfillSelectedCalendars(user, timeMin, timeMax);
    return successResponse(res, { perCal }, 200, 'Backfill complete');
  } catch (err) {
    return errorResponse(res, err, 400);
  }
});

// Incremental sync using per-calendar syncTokens
router.post('/sync/incremental', apiLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.user._id || req.user.id).select('+googleCalendar.refreshToken +googleCalendar.accessToken +googleCalendar.calendars.syncToken');
    const updates = await googleSvc.incrementalSync(user);
    return successResponse(res, { updates }, 200, 'Incremental sync complete');
  } catch (err) {
    return errorResponse(res, err, 400);
  }
});

// Start watch channel for a calendar
router.post('/watch/start', apiLimiter, async (req, res) => {
  try {
    const { calendarId, channelId } = req.body; // channelId should be a UUID generated by client/server
    if (!calendarId || !channelId) {
      return errorResponse(res, new Error('calendarId and channelId are required'), 400);
    }
    const user = await User.findById(req.user._id || req.user.id).select('+googleCalendar.refreshToken +googleCalendar.accessToken');
    const data = await googleSvc.startWatch(user, calendarId, channelId, process.env.GOOGLE_WEBHOOK_URL);
    return successResponse(res, { data }, 200, 'Watch started');
  } catch (err) {
    return errorResponse(res, err, 400);
  }
});

// Stop watch channel for a calendar
router.post('/watch/stop', apiLimiter, async (req, res) => {
  try {
    const { calendarId } = req.body;
    if (!calendarId) {
      return errorResponse(res, new Error('calendarId is required'), 400);
    }
    const user = await User.findById(req.user._id || req.user.id).select('+googleCalendar.refreshToken +googleCalendar.accessToken');
    const ok = await googleSvc.stopWatch(user, calendarId);
    return successResponse(res, { stopped: ok }, 200, ok ? 'Watch stopped' : 'No active watch');
  } catch (err) {
    return errorResponse(res, err, 400);
  }
});

// Suggest times: given window and duration (minutes), return slots where all selected calendars are free
router.post('/suggest-times', apiLimiter, async (req, res) => {
  try {
    const { timeMin, timeMax, durationMinutes = 60, calendarIds } = req.body;
    if (!timeMin || !timeMax) {
      return errorResponse(res, new Error('timeMin and timeMax are required (ISO strings)'), 400);
    }
    const user = await User.findById(req.user._id || req.user.id).select('+googleCalendar.refreshToken +googleCalendar.accessToken');
    const fb = await googleSvc.freeBusy(user, timeMin, timeMax, calendarIds);
    const slots = computeSlots(timeMin, timeMax, durationMinutes, fb);
    return successResponse(res, { slots });
  } catch (err) {
    return errorResponse(res, err, 400);
  }
});

function computeSlots(timeMin, timeMax, durationMinutes, freebusyCalendars) {
  const start = new Date(timeMin).getTime();
  const end = new Date(timeMax).getTime();
  const step = durationMinutes * 60 * 1000;
  const busyBlocks = Object.values(freebusyCalendars).flatMap(c => (c.busy || []).map(b => ({
    s: new Date(b.start).getTime(),
    e: new Date(b.end).getTime()
  })));
  const slots = [];
  for (let t = start; t + step <= end; t += step) {
    const slotStart = t;
    const slotEnd = t + step;
    const overlaps = busyBlocks.some(b => !(slotEnd <= b.s || slotStart >= b.e));
    if (!overlaps) slots.push({ start: new Date(slotStart).toISOString(), end: new Date(slotEnd).toISOString() });
  }
  return slots;
}

// Diagnostic route to check OAuth configuration
router.get('/diagnostics', apiLimiter, async (req, res) => {
  try {
    const user = await User.findById(req.user._id || req.user.id)
      .select('+googleCalendar.refreshToken +googleCalendar.accessToken +googleCalendar.expiryDate +googleCalendar.scope');

    const diagnostics = {
      hasGoogleAccount: !!(user.googleCalendar && user.googleCalendar.refreshToken),
      hasAccessToken: !!(user.googleCalendar && user.googleCalendar.accessToken),
      hasExpiryDate: !!(user.googleCalendar && user.googleCalendar.expiryDate),
      scope: user.googleCalendar?.scope || 'No scope set',
      environment: process.env.NODE_ENV || 'development',
      hasClientId: !!process.env.GOOGLE_CLIENT_ID,
      hasClientSecret: !!process.env.GOOGLE_CLIENT_SECRET,
      hasRedirectUri: !!process.env.GOOGLE_REDIRECT_URI,
      clientIdLength: process.env.GOOGLE_CLIENT_ID ? process.env.GOOGLE_CLIENT_ID.length : 0,
      clientSecretLength: process.env.GOOGLE_CLIENT_SECRET ? process.env.GOOGLE_CLIENT_SECRET.length : 0
    };

    // Check if tokens are expired
    if (user.googleCalendar && user.googleCalendar.expiryDate) {
      const now = new Date();
      const expiry = new Date(user.googleCalendar.expiryDate);
      diagnostics.isExpired = now >= expiry;
      diagnostics.expiresIn = Math.floor((expiry.getTime() - now.getTime()) / 1000); // seconds
    }

    return successResponse(res, { diagnostics });
  } catch (err) {
    console.error('Diagnostics error:', err);
    return errorResponse(res, err, 500);
  }
});

// Simple callback route for Google OAuth (for debugging/testing)
router.get('/callback', (req, res) => {
  const { code, error } = req.query;

  if (error) {
    return res.status(400).json({
      status: 'error',
      message: 'OAuth error occurred',
      error: error
    });
  }

  if (code) {
    return res.status(200).json({
      status: 'success',
      message: 'Authorization code received successfully',
      code: code,
      note: 'Use this code with POST /api/v1/google/link to link or update your Google account'
    });
  }

  return res.status(400).json({
    status: 'error',
    message: 'No authorization code received'
  });
});

module.exports = router;