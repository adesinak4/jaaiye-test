const express = require('express');
const router = express.Router();
const { healthCheck, detailedHealthCheck } = require('../controllers/healthController');

// Basic health check - no API key required
router.get('/', healthCheck);

// Detailed health check - requires API key
router.get('/detailed', detailedHealthCheck);

module.exports = router;