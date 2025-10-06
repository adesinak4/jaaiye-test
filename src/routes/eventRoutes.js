const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createEvent,
  getEvent,
  updateEvent,
  deleteEvent,
  listEvents,
  addParticipant,
  addParticipantsBatch,
  updateParticipantStatus,
  removeParticipant
} = require('../controllers/eventController');

// Event management routes
router.post('/', protect, createEvent);
router.get('/:id', protect, getEvent);
router.put('/:id', protect, updateEvent);
router.delete('/:id', protect, deleteEvent);
router.get('/', protect, listEvents);

// Participant management routes
router.post('/:id/participants', protect, addParticipant);
router.post('/:id/participants/batch', protect, addParticipantsBatch);
router.put('/:id/participants/status', protect, updateParticipantStatus);
router.delete('/:id/participants/:userId', protect, removeParticipant);

module.exports = router;