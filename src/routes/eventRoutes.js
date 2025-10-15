const express = require('express');
const router = express.Router();
const multer = require('multer');
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
  removeParticipant,
  createEventWithImage,
  getAllEvents,
  getEventsByCategory,
  addTicketType,
  updateTicketType,
  removeTicketType,
  getAvailableTicketTypes
} = require('../controllers/eventController');

// Configure multer for image uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'), false);
    }
  }
});

/**
 * @swagger
 * tags:
 *   name: Events
 *   description: Event management
 */

// Event management routes
/**
 * @swagger
 * /api/v1/events:
 *   post:
 *     summary: Create an event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               startTime: { type: string, format: date-time }
 *               endTime: { type: string, format: date-time }
 *               location: { type: string }
 *               isAllDay: { type: boolean }
 *               recurrence: { type: object }
 *               calendarId: { type: string, description: 'optional; defaults to user calendar' }
 *               googleCalendarId: { type: string, description: 'optional; overrides Google write target' }
 *     responses:
 *       201:
 *         description: Created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 event:
 *                   $ref: '#/components/schemas/Event'
 */
router.post('/', protect, createEvent);
/**
 * @swagger
 * /api/v1/events/{id}:
 *   get:
 *     summary: Get an event by id
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 event:
 *                   $ref: '#/components/schemas/Event'
 *       404:
 *         description: Not found
 */
router.get('/:id', protect, getEvent);
/**
 * @swagger
 * /api/v1/events/{id}:
 *   put:
 *     summary: Update an event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *     responses:
 *       200:
 *         description: Updated
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 message: { type: string }
 *                 event:
 *                   $ref: '#/components/schemas/Event'
 */
router.put('/:id', protect, updateEvent);
/**
 * @swagger
 * /api/v1/events/{id}:
 *   delete:
 *     summary: Delete an event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.delete('/:id', protect, deleteEvent);
/**
 * @swagger
 * /api/v1/events:
 *   get:
 *     summary: List events (optionally by calendar and date range)
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: calendarId
 *         schema: { type: string }
 *       - in: query
 *         name: startDate
 *         schema: { type: string, format: date-time }
 *       - in: query
 *         name: endDate
 *         schema: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 events:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Event'
 */
router.get('/user-events', protect, listEvents);

// Participant management routes
/**
 * @swagger
 * /api/v1/events/{id}/participants:
 *   post:
 *     summary: Add a participant to an event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               userId: { type: string }
 *               role: { type: string }
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/:id/participants', protect, addParticipant);
/**
 * @swagger
 * /api/v1/events/{id}/participants/batch:
 *   post:
 *     summary: Batch add participants
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               participants:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Success
 */
router.post('/:id/participants/batch', protect, addParticipantsBatch);
/**
 * @swagger
 * /api/v1/events/{id}/participants/status:
 *   put:
 *     summary: Update participant status for the current user
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status: { type: string }
 *     responses:
 *       200:
 *         description: Success
 */
router.put('/:id/participants/status', protect, updateParticipantStatus);
/**
 * @swagger
 * /api/v1/events/{id}/participants/{userId}:
 *   delete:
 *     summary: Remove a participant from an event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: userId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Success
 */
router.delete('/:id/participants/:userId', protect, removeParticipant);

// New ticketing system routes
/**
 * @swagger
 * /api/v1/events/create-with-image:
 *   post:
 *     summary: Create an event with image upload
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               title: { type: string }
 *               description: { type: string }
 *               startTime: { type: string, format: date-time }
 *               endTime: { type: string, format: date-time }
 *               location: { type: string }
 *               venue: { type: string }
 *               category: { type: string, enum: ['hangout', 'event'] }
 *               ticketFee: { type: string, description: 'Can be "free", number, or null' }
 *               image: { type: string, format: binary }
 *               isAllDay: { type: boolean }
 *               recurrence: { type: object }
 *               calendarId: { type: string }
 *               participants: { type: array }
 *     responses:
 *       201:
 *         description: Event created successfully
 */
router.post('/create-with-image', protect, upload.single('image'), createEventWithImage);

/**
 * @swagger
 * /api/v1/events:
 *   get:
 *     summary: Get all public events
 *     tags: [Events]
 *     parameters:
 *       - in: query
 *         name: category
 *         schema: { type: string, enum: ['hangout', 'event'] }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 events:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Event'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     total: { type: integer }
 *                     pages: { type: integer }
 */
router.get('/', getAllEvents);

/**
 * @swagger
 * /api/v1/events/category/{category}:
 *   get:
 *     summary: Get events by category
 *     tags: [Events]
 *     parameters:
 *       - in: path
 *         name: category
 *         required: true
 *         schema: { type: string, enum: ['hangout', 'event'] }
 *       - in: query
 *         name: limit
 *         schema: { type: integer, default: 20 }
 *       - in: query
 *         name: page
 *         schema: { type: integer, default: 1 }
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 events:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Event'
 *                 pagination:
 *                   type: object
 *                   properties:
 *                     page: { type: integer }
 *                     limit: { type: integer }
 *                     total: { type: integer }
 *                     pages: { type: integer }
 */
router.get('/category/:category', getEventsByCategory);

// Ticket type management routes
/**
 * @swagger
 * /api/v1/events/{eventId}/ticket-types:
 *   post:
 *     summary: Add a ticket type to an event
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - price
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               price: { type: number, minimum: 0 }
 *               capacity: { type: number, minimum: 0 }
 *               salesStartDate: { type: string, format: date-time }
 *               salesEndDate: { type: string, format: date-time }
 *     responses:
 *       201:
 *         description: Ticket type added successfully
 */
router.post('/:eventId/ticket-types', protect, addTicketType);

/**
 * @swagger
 * /api/v1/events/{eventId}/ticket-types/{ticketTypeId}:
 *   put:
 *     summary: Update a ticket type
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: ticketTypeId
 *         required: true
 *         schema: { type: string }
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name: { type: string }
 *               description: { type: string }
 *               price: { type: number, minimum: 0 }
 *               capacity: { type: number, minimum: 0 }
 *               isActive: { type: boolean }
 *               salesStartDate: { type: string, format: date-time }
 *               salesEndDate: { type: string, format: date-time }
 *     responses:
 *       200:
 *         description: Ticket type updated successfully
 */
router.put('/:eventId/ticket-types/:ticketTypeId', protect, updateTicketType);

/**
 * @swagger
 * /api/v1/events/{eventId}/ticket-types/{ticketTypeId}:
 *   delete:
 *     summary: Remove a ticket type
 *     tags: [Events]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: string }
 *       - in: path
 *         name: ticketTypeId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Ticket type removed successfully
 */
router.delete('/:eventId/ticket-types/:ticketTypeId', protect, removeTicketType);

/**
 * @swagger
 * /api/v1/events/{eventId}/ticket-types/available:
 *   get:
 *     summary: Get available ticket types for an event
 *     tags: [Events]
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema: { type: string }
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 data:
 *                   type: object
 *                   properties:
 *                     ticketTypes:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id: { type: string }
 *                           name: { type: string }
 *                           description: { type: string }
 *                           price: { type: number }
 *                           capacity: { type: number }
 *                           soldCount: { type: number }
 *                           remainingCapacity: { type: number }
 *                           salesStartDate: { type: string }
 *                           salesEndDate: { type: string }
 */
router.get('/:eventId/ticket-types/available', getAvailableTicketTypes);

module.exports = router;