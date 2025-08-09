const express = require('express');
const router = express.Router();
const ics = require('ics');
const crypto = require('crypto');
const User = require('../models/User');
const Event = require('../models/Event');
const { successResponse, errorResponse } = require('../utils/response');
const { protect } = require('../middleware/authMiddleware');
const { apiLimiter } = require('../middleware/securityMiddleware');

// Helper to build feed URL
function buildFeedUrl(req, userId, token) {
  const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  return `${base}/api/v1/ics/unified/${userId}?token=${token}`;
}

// Protected: issue ICS token if not present
router.post('/token/issue', apiLimiter, protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id || req.user.id).select('+ics.token');
    if (!user) return errorResponse(res, new Error('User not found'), 404);
    if (!user.ics) user.ics = {};
    if (!user.ics.token) {
      user.ics.token = crypto.randomBytes(24).toString('hex');
      await user.save();
      const feedUrl = buildFeedUrl(req, user.id || user._id, user.ics.token);
      return successResponse(res, { token: user.ics.token, feedUrl }, 201, 'ICS token issued');
    }
    const feedUrl = buildFeedUrl(req, user.id || user._id, user.ics.token);
    return successResponse(res, { token: user.ics.token, feedUrl }, 200, 'ICS token already exists');
  } catch (err) {
    return errorResponse(res, err, 400);
  }
});

// Protected: rotate ICS token (invalidate previous)
router.post('/token/rotate', apiLimiter, protect, async (req, res) => {
  try {
    const user = await User.findById(req.user._id || req.user.id).select('+ics.token');
    if (!user) return errorResponse(res, new Error('User not found'), 404);
    if (!user.ics) user.ics = {};
    user.ics.token = crypto.randomBytes(24).toString('hex');
    await user.save();
    const feedUrl = buildFeedUrl(req, user.id || user._id, user.ics.token);
    return successResponse(res, { token: user.ics.token, feedUrl }, 200, 'ICS token rotated');
  } catch (err) {
    return errorResponse(res, err, 400);
  }
});

// Public: GET /api/v1/ics/unified/:userId?token=...
router.get('/unified/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const { token } = req.query;
    const user = await User.findById(userId).select('+ics.token');
    if (!user || !user.ics?.token || user.ics.token !== token) {
      return errorResponse(res, new Error('Unauthorized'), 401);
    }

    // Get events from our DB (could be extended to fetch provider in real-time if needed)
    const now = new Date();
    const future = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const calendars = await require('../models/Calendar').find({
      $or: [ { owner: userId }, { 'sharedWith.user': userId } ]
    });
    const events = await Event.find({
      calendar: { $in: calendars.map(c => c._id) },
      startTime: { $gte: now },
      endTime: { $lte: future }
    });

    const icsEvents = events.map(ev => ({
      title: ev.title,
      description: ev.description,
      location: ev.location,
      start: toIcsArray(ev.startTime),
      end: toIcsArray(ev.endTime)
    }));

    ics.createEvents(icsEvents, (error, value) => {
      if (error) {
        return res.status(500).send('Failed to generate feed');
      }
      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename=jaaiye-unified.ics');
      return res.send(value);
    });
  } catch (err) {
    return res.status(500).send('Server error');
  }
});

function toIcsArray(date) {
  const d = new Date(date);
  return [d.getFullYear(), d.getMonth() + 1, d.getDate(), d.getHours(), d.getMinutes()];
}

module.exports = router;