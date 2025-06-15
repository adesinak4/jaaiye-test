const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createCalendar,
  getCalendars,
  createEvent,
  getEvents,
  updateEvent,
  deleteEvent
} = require('../controllers/calendarController');

// Calendar routes
router.post('/', protect, createCalendar);
router.get('/', protect, getCalendars);

// Event routes
router.post('/events', protect, createEvent);
router.get('/:calendarId/events', protect, getEvents);
router.put('/events/:eventId', protect, updateEvent);
router.delete('/events/:eventId', protect, deleteEvent);

module.exports = router;