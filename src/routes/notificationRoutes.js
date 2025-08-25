const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  registerDeviceToken,
  removeDeviceToken,
  getNotifications,
  markAsRead,
  bulkMarkAsRead,
  markRead,
  deleteNotification,
  bulkDelete,
  deleteFlexible
} = require('../controllers/notificationController');

// Device token management
router.post('/device-token', protect, registerDeviceToken);
router.delete('/device-token', protect, removeDeviceToken);

// Notification management
router.get('/', protect, getNotifications);
// Flexible endpoints (body: { all: true } or { ids: [...] } or { id })
router.put('/read', protect, markRead);
router.delete('/', protect, deleteFlexible);

module.exports = router;