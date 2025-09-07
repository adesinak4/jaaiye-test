const express = require('express');
const router = express.Router();
const { body, param } = require('express-validator');
const { protect } = require('../middleware/authMiddleware');
const {
  createGroup,
  createGroupFromEvent,
  getUserGroups,
  getGroup,
  updateGroup,
  addMember,
  removeMember,
  updateMemberRole,
  createGroupEvent,
  searchGroups,
  deleteGroup
} = require('../controllers/groupController');

// Validation middleware
const validateCreateGroup = [
  body('name')
    .notEmpty()
    .withMessage('Group name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Group name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('memberIds')
    .optional()
    .isArray()
    .withMessage('memberIds must be an array'),
  body('memberIds.*')
    .optional()
    .isMongoId()
    .withMessage('Invalid member ID format')
];

const validateCreateGroupFromEvent = [
  body('eventId')
    .isMongoId()
    .withMessage('Valid event ID is required'),
  body('groupName')
    .notEmpty()
    .withMessage('Group name is required')
    .isLength({ min: 1, max: 100 })
    .withMessage('Group name must be between 1 and 100 characters')
];

const validateUpdateGroup = [
  body('name')
    .optional()
    .isLength({ min: 1, max: 100 })
    .withMessage('Group name must be between 1 and 100 characters'),
  body('description')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Description cannot exceed 500 characters'),
  body('settings.allowMemberInvites')
    .optional()
    .isBoolean()
    .withMessage('allowMemberInvites must be boolean'),
  body('settings.allowMemberEventCreation')
    .optional()
    .isBoolean()
    .withMessage('allowMemberEventCreation must be boolean'),
  body('settings.defaultEventParticipation')
    .optional()
    .isIn(['auto_add', 'invite_only'])
    .withMessage('defaultEventParticipation must be either "auto_add" or "invite_only"')
];

const validateAddMember = [
  body('userId')
    .isMongoId()
    .withMessage('Valid user ID is required'),
  body('role')
    .optional()
    .isIn(['admin', 'member'])
    .withMessage('Role must be either "admin" or "member"')
];

const validateUpdateMemberRole = [
  body('role')
    .isIn(['admin', 'member'])
    .withMessage('Role must be either "admin" or "member"')
];

const validateCreateGroupEvent = [
  body('title')
    .notEmpty()
    .withMessage('Event title is required')
    .isLength({ min: 1, max: 200 })
    .withMessage('Event title must be between 1 and 200 characters'),
  body('description')
    .optional()
    .isLength({ max: 1000 })
    .withMessage('Description cannot exceed 1000 characters'),
  body('startTime')
    .isISO8601()
    .withMessage('Valid start time is required'),
  body('endTime')
    .isISO8601()
    .withMessage('Valid end time is required'),
  body('location')
    .optional()
    .isLength({ max: 200 })
    .withMessage('Location cannot exceed 200 characters'),
  body('isAllDay')
    .optional()
    .isBoolean()
    .withMessage('isAllDay must be boolean'),
  body('participationMode')
    .optional()
    .isIn(['auto_add', 'invite_only'])
    .withMessage('participationMode must be either "auto_add" or "invite_only"')
];

const validateMongoId = [
  param('id')
    .isMongoId()
    .withMessage('Invalid group ID format')
];

const validateMemberId = [
  param('memberId')
    .isMongoId()
    .withMessage('Invalid member ID format')
];

// Protected routes
router.use(protect);

// Group CRUD routes
router.post('/', validateCreateGroup, createGroup);
router.post('/from-event', validateCreateGroupFromEvent, createGroupFromEvent);
router.get('/', getUserGroups);
router.get('/search', searchGroups);
router.get('/:id', validateMongoId, getGroup);
router.put('/:id', validateMongoId, validateUpdateGroup, updateGroup);
router.delete('/:id', validateMongoId, deleteGroup);

// Member management routes
router.post('/:id/members', validateMongoId, validateAddMember, addMember);
router.delete('/:id/members/:memberId', validateMongoId, validateMemberId, removeMember);
router.put('/:id/members/:memberId/role', validateMongoId, validateMemberId, validateUpdateMemberRole, updateMemberRole);

// Group event routes
router.post('/:id/events', validateMongoId, validateCreateGroupEvent, createGroupEvent);

module.exports = router;
