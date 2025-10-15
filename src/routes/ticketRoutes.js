const express = require('express');
const router = express.Router();
const { protect, admin, scanner } = require('../middleware/authMiddleware');
const TicketController = require('../controllers/ticketController');

/**
 * @swagger
 * tags:
 *   name: Tickets
 *   description: Ticket management for events
 */

/**
 * @swagger
 * /api/v1/tickets:
 *   post:
 *     summary: Create a new ticket for an event
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - eventId
 *               - ticketTypeId
 *             properties:
 *               eventId:
 *                 type: string
 *                 description: ID of the event to create a ticket for
 *               ticketTypeId:
 *                 type: string
 *                 description: ID of the ticket type to purchase
 *               quantity:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 10
 *                 default: 1
 *                 description: Number of tickets to purchase
 *     responses:
 *       201:
 *         description: Ticket created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     ticket:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         qrCode:
 *                           type: string
 *                         ticketData:
 *                           type: object
 *                         status:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                         event:
 *                           type: object
 *                         user:
 *                           type: object
 *       400:
 *         description: Bad request
 *       404:
 *         description: Event not found
 *       409:
 *         description: User already has a ticket for this event
 */
router.post('/', admin, TicketController.createTicket);

/**
 * @swagger
 * /api/v1/tickets/my-tickets:
 *   get:
 *     summary: Get all tickets for the authenticated user
 *     tags: [Tickets]
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
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     tickets:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           qrCode:
 *                             type: string
 *                           status:
 *                             type: string
 *                           usedAt:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                           event:
 *                             type: object
 */
router.get('/my-tickets', protect, TicketController.getMyTickets);

/**
 * @swagger
 * /api/v1/tickets/active:
 *   get:
 *     summary: Get active tickets for the authenticated user
 *     tags: [Tickets]
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
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     tickets:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           qrCode:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                           event:
 *                             type: object
 */
router.get('/active', protect, TicketController.getActiveTickets);

/**
 * @swagger
 * /api/v1/tickets/event/{eventId}:
 *   get:
 *     summary: Get all tickets for a specific event (admin only)
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: eventId
 *         required: true
 *         schema:
 *           type: string
 *         description: Event ID
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     event:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         title:
 *                           type: string
 *                         attendeeCount:
 *                           type: number
 *                     tickets:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           qrCode:
 *                             type: string
 *                           status:
 *                             type: string
 *                           usedAt:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                           user:
 *                             type: object
 *       404:
 *         description: Event not found
 */
router.get('/event/:eventId', protect, admin, TicketController.getEventTickets);

/**
 * @swagger
 * /api/v1/tickets/{ticketId}:
 *   get:
 *     summary: Get ticket details by ID
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *         description: Ticket ID
 *     responses:
 *       200:
 *         description: Success
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     ticket:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         qrCode:
 *                           type: string
 *                         ticketData:
 *                           type: object
 *                         status:
 *                           type: string
 *                         usedAt:
 *                           type: string
 *                         createdAt:
 *                           type: string
 *                         event:
 *                           type: object
 *                         user:
 *                           type: object
 *       404:
 *         description: Ticket not found
 *       403:
 *         description: Access denied
 */
router.get('/:ticketId', protect, TicketController.getTicketById);

// Public scanning (view only)
router.get('/scan', TicketController.scanTicket);

// Authenticated scanner (mark as used)
router.get('/scan/auth', protect, scanner, TicketController.scanTicket);

/**
 * @swagger
 * /api/v1/tickets/{ticketId}/cancel:
 *   patch:
 *     summary: Cancel a ticket
 *     tags: [Tickets]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: ticketId
 *         required: true
 *         schema:
 *           type: string
 *         description: Ticket ID
 *     responses:
 *       200:
 *         description: Ticket cancelled successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     ticket:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         status:
 *                           type: string
 *       404:
 *         description: Ticket not found
 *       400:
 *         description: Invalid operation
 *       403:
 *         description: Access denied
 */
router.patch('/:ticketId/cancel', protect, TicketController.cancelTicket);

module.exports = router;
