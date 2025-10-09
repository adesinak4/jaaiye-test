const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createCalendar,
  getCalendars,
  getCalendar,
  updateCalendar,
  deleteCalendar,
  getCalendarEvents,
  linkGoogleCalendars,
  setPrimaryGoogleCalendar
} = require('../controllers/calendarController');

// Calendar routes
router.post('/', protect, createCalendar);
router.get('/', protect, getCalendars);
router.get('/:id', protect, getCalendar);
router.put('/:id', protect, updateCalendar);
router.delete('/:id', protect, deleteCalendar);

// Calendar events routes (read-only for calendar context)
router.get('/:calendarId/events', protect, getCalendarEvents);

// Google mappings for calendar
router.post('/:id/google/link', protect, linkGoogleCalendars);
router.post('/:id/google/primary', protect, setPrimaryGoogleCalendar);

module.exports = router;