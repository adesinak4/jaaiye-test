const express = require('express');
const router = express.Router();
const { protect, admin } = require('../middleware/authMiddleware');
const {
  generateReport,
  getReports,
  getReport,
  deleteReport,
  downloadReport,
  getReportStatus,
  getReportTypes
} = require('../controllers/reportController');

// All routes are protected
router.use(protect);

// Report generation and management
router.post('/', generateReport);
router.get('/', getReports);
router.get('/types', getReportTypes);
router.get('/:id', getReport);
router.get('/:id/download', downloadReport);
router.get('/:id/status', getReportStatus);

// Admin routes for report management
router.use(admin);
router.delete('/:id', deleteReport);

module.exports = router;