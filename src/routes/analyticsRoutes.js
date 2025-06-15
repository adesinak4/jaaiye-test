const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  trackEventView,
  getEventAnalytics,
  getCalendarAnalytics,
  getUserAnalytics
} = require('../controllers/analyticsController');

// Event analytics
router.post('/events/:eventId/view', protect, trackEventView);
router.get('/events/:eventId', protect, getEventAnalytics);

// Calendar analytics
router.get('/calendars/:calendarId', protect, getCalendarAnalytics);

// User analytics
router.get('/users/:userId', protect, getUserAnalytics);

module.exports = router;