const express = require('express');

const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const { apiLimiter, securityHeaders, sanitizeRequest } = require('../middleware/securityMiddleware');
const {
  revenue,
  tickets,
  events,
  users,
  engagement,
} = require('../controllers/analyticsController');

router.use(securityHeaders);
router.use(sanitizeRequest);
router.use(apiLimiter, protect);

router.get('/revenue', admin, revenue);
router.get('/tickets', admin, tickets);
router.get('/events', admin, events);
router.get('/users', admin, users);
router.get('/engagement', admin, engagement);

module.exports = router;

