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

// Link Google account with serverAuthCode
router.post('/link', apiLimiter, async (req, res) => {
  console.log('Linking Google account with serverAuthCode: ', req.body);
  try {
    const { serverAuthCode } = req.body;
    if (!serverAuthCode) {
      return errorResponse(res, new Error('serverAuthCode is required'), 400);
    }
    const user = await User.findById(req.user._id || req.user.id);
    const tokens = await googleSvc.exchangeServerAuthCode(serverAuthCode);
    await googleSvc.saveTokensToUser(user, tokens);
    await googleSvc.ensureJaaiyeCalendar(user);
    return successResponse(res, null, 200, 'Google account linked');
  } catch (err) {
    return errorResponse(res, err, 400);
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

module.exports = router;