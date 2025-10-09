const express = require('express');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const {
  createCalendar,
  getCalendars,
  getCalendar,
  updateCalendar,
  deleteCalendar,
  getCalendarEvents,
  linkGoogleCalendars,
  setPrimaryGoogleCalendar
} = require('../controllers/calendarController');

/**
 * @swagger
 * tags:
 *   name: Calendars
 *   description: Calendar management
 */

// Calendar routes
/**
 * @swagger
 * /api/v1/calendars:
 *   post:
 *     summary: Create user's calendar (one per user)
 *     tags: [Calendars]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               color:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       201:
 *         description: Calendar created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 calendar:
 *                   $ref: '#/components/schemas/Calendar'
 *       400:
 *         description: User already has a calendar
 */
router.post('/', protect, createCalendar);
/**
 * @swagger
 * /api/v1/calendars:
 *   get:
 *     summary: List calendars for current user
 *     tags: [Calendars]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 calendars:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Calendar'
 */
router.get('/', protect, getCalendars);
/**
 * @swagger
 * /api/v1/calendars/{id}:
 *   get:
 *     summary: Get calendar by id
 *     tags: [Calendars]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 calendar:
 *                   $ref: '#/components/schemas/Calendar'
 *       404:
 *         description: Not found
 */
router.get('/:id', protect, getCalendar);
/**
 * @swagger
 * /api/v1/calendars/{id}:
 *   put:
 *     summary: Update calendar by id
 *     tags: [Calendars]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               description:
 *                 type: string
 *               color:
 *                 type: string
 *               isPublic:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success: { type: boolean }
 *                 calendar:
 *                   $ref: '#/components/schemas/Calendar'
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.put('/:id', protect, updateCalendar);
/**
 * @swagger
 * /api/v1/calendars/{id}:
 *   delete:
 *     summary: Delete calendar by id
 *     tags: [Calendars]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         schema:
 *           type: string
 *         required: true
 *     responses:
 *       200:
 *         description: Deleted
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       403:
 *         description: Forbidden
 *       404:
 *         description: Not found
 */
router.delete('/:id', protect, deleteCalendar);

// Calendar events routes (read-only for calendar context)
/**
 * @swagger
 * /api/v1/calendars/{calendarId}/events:
 *   get:
 *     summary: Get events for a calendar
 *     tags: [Calendars]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: calendarId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: startDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: endDate
 *         schema:
 *           type: string
 *           format: date-time
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
router.get('/:calendarId/events', protect, getCalendarEvents);

// Google mappings for calendar
/**
 * @swagger
 * /api/v1/calendars/{id}/google/link:
 *   post:
 *     summary: Link multiple Google calendars to a Jaaiye calendar (replace set)
 *     tags: [Calendars]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               linkedIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:id/google/link', protect, linkGoogleCalendars);
/**
 * @swagger
 * /api/v1/calendars/{id}/google/primary:
 *   post:
 *     summary: Set primary Google calendar for write-through
 *     tags: [Calendars]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               primaryId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.post('/:id/google/primary', protect, setPrimaryGoogleCalendar);

module.exports = router;