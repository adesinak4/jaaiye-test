const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createIntegration,
  getIntegrations,
  getIntegration,
  updateIntegration,
  deleteIntegration,
  syncIntegration,
  getIntegrationStatus,
  getIntegrationLogs
} = require('../controllers/integrationController');

// All routes are protected
router.use(protect);

router.post('/', createIntegration);
router.get('/', getIntegrations);
router.get('/:id', getIntegration);
router.put('/:id', updateIntegration);
router.delete('/:id', deleteIntegration);
router.post('/:id/sync', syncIntegration);
router.get('/:id/status', getIntegrationStatus);
router.get('/:id/logs', getIntegrationLogs);

module.exports = router;