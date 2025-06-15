const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  registerDeviceToken,
  removeDeviceToken,
  getNotifications,
  markAsRead,
  bulkMarkAsRead,
  deleteNotification,
  bulkDelete
} = require('../controllers/notificationController');

// Device token management
router.post('/device-token', protect, registerDeviceToken);
router.delete('/device-token/:token', protect, removeDeviceToken);

// Notification management
router.get('/', protect, getNotifications);
router.put('/:id/read', protect, markAsRead);
router.put('/bulk-read', protect, bulkMarkAsRead);
router.delete('/:id', protect, deleteNotification);
router.delete('/bulk', protect, bulkDelete);

module.exports = router;