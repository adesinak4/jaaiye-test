const express = require('express');
const router = express.Router();
const { protect, admin, superadmin } = require('../middleware/authMiddleware');
const { apiLimiter, securityHeaders, sanitizeRequest } = require('../middleware/securityMiddleware');
const { health, listUsers, updateUserRole } = require('../controllers/adminController');

// Security
router.use(securityHeaders);
router.use(sanitizeRequest);

// All admin routes require auth + admin role
router.use(apiLimiter, protect, admin);

router.get('/health', health);
router.get('/users', listUsers);
router.patch('/users/:id/role', superadmin, updateUserRole); // only superadmin can change roles

module.exports = router;


