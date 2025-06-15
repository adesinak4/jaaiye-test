const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  shareCalendar,
  acceptShare,
  declineShare,
  getSharedCalendars,
  getPendingShares,
  updateSharePermission,
  removeShare
} = require('../controllers/calendarShareController');

// All routes are protected
router.use(protect);

router.post('/', shareCalendar);
router.post('/:id/accept', acceptShare);
router.post('/:id/decline', declineShare);
router.get('/shared', getSharedCalendars);
router.get('/pending', getPendingShares);
router.put('/:id', updateSharePermission);
router.delete('/:id', removeShare);

module.exports = router;