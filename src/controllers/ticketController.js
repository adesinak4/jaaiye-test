const QRCode = require('qrcode');
const Ticket = require('../models/Ticket');
const Event = require('../models/Event');
const User = require('../models/User');
const { asyncHandler } = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');
const {
  ValidationError,
  NotFoundError,
  ConflictError
} = require('../middleware/errorHandler');
const logger = require('../utils/logger');
const { createTicketInternal, verifyAndUseTicket } = require('../services/ticketService');
const { verifyQRToken } = require('../utils/qrGenerator');

class TicketController {
  /**
   * Create a new ticket for an event
   * @route POST /api/v1/tickets
   * @access Private
   */
  static createTicket = asyncHandler(async (req, res) => {
    const { eventId, ticketTypeId, quantity = 1, username, userId: userIdBody, complimentary = false, bypassCapacity = false } = req.body;

    // Admin route: require explicit user target via userId or username (no fallback to req.user)
    let userId = null;
    if (userIdBody) {
      userId = userIdBody;
    } else if (username) {
      const targetUser = await User.findOne({ username }).select('_id email fullName username');
      if (!targetUser) {
        throw new NotFoundError('User not found');
      }
      userId = targetUser._id;
    }

    if (!userId) {
      throw new ValidationError('Target user is required (provide userId or username)');
    }

    const ticket = await createTicketInternal({ eventId, ticketTypeId, quantity, userId, complimentary, bypassCapacity });

    logger.info('Ticket created successfully', {
      ticketId: ticket._id,
      userId,
      eventId,
      ticketTypeId,
      quantity
    });

    // Try to send email notification to the ticket owner
    try {
      const targetUser = await User.findById(userId).select('email fullName username');
      if (targetUser && targetUser.email) {
        const emailService = require('../services/emailService');
        // Send full ticket so template can render QR and IDs
        await emailService.sendPaymentConfirmationEmail(targetUser, ticket);
      }
    } catch (e) {
      logger.warn('Failed to send ticket email', { error: e.message, userId, ticketId: ticket._id });
    }

    return successResponse(res, {
      ticket: {
        id: ticket._id,
        qrCode: ticket.qrCode,
        ticketData: JSON.parse(ticket.ticketData),
        ticketTypeName: ticket.ticketTypeName,
        price: ticket.price,
        quantity: ticket.quantity,
        status: ticket.status,
        createdAt: ticket.createdAt,
        event: ticket.eventId,
        user: ticket.userId
      }
    }, 201, 'Ticket created successfully');
  });

  /**
   * Get all tickets for the authenticated user
   * @route GET /api/v1/tickets/my-tickets
   * @access Private
   */
  static getMyTickets = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const tickets = await Ticket.findByUser(userId).populate('eventId');

    const grouped = tickets.reduce((acc, ticket) => {
      const eventId = ticket.eventId._id?.toString?.() || ticket.eventId.toString();

      if (!acc[eventId]) {
        acc[eventId] = {
          event: {
            id: ticket.eventId._id,
            name: ticket.eventId.name,
            category: ticket.eventId.category,
            image: ticket.eventId.image,
            venue: ticket.eventId.venue,
            ticketFee: ticket.eventId.ticketFee,
            createdAt: ticket.eventId.createdAt,
            date: new Date(ticket.eventId.startTime).toLocaleDateString(),
            time: new Date(ticket.eventId.startTime).toLocaleTimeString()
          },
          ticketCount: 0,
          tickets: []
        };
      }

      acc[eventId].tickets.push({
        id: ticket._id,
        qrCode: ticket.qrCode,
        ticketTypeName: ticket.ticketTypeName,
        price: ticket.price,
        quantity: ticket.quantity,
        status: ticket.status,
        usedAt: ticket.usedAt,
        createdAt: ticket.createdAt
      });

      acc[eventId].ticketCount += ticket.quantity || 1;

      return acc;
    }, {});

    return successResponse(res, {
      ticketsByEvent: Object.values(grouped)
    });
  });

  /**
   * Get all tickets for a specific event (admin only)
   * @route GET /api/v1/tickets/event/:eventId
   * @access Private (Admin)
   */
  static getEventTickets = asyncHandler(async (req, res) => {
    const { eventId } = req.params;

    // Check if event exists
    const event = await Event.findById(eventId);
    if (!event) {
      throw new NotFoundError('Event not found');
    }

    const tickets = await Ticket.findByEvent(eventId);

    return successResponse(res, {
      event: {
        id: event._id,
        title: event.title,
        attendeeCount: event.attendeeCount,
        ticketTypes: event.ticketTypes.map(tt => ({
          id: tt._id,
          name: tt.name,
          price: tt.price,
          soldCount: tt.soldCount,
          capacity: tt.capacity
        }))
      },
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        qrCode: ticket.qrCode,
        ticketTypeName: ticket.ticketTypeName,
        price: ticket.price,
        quantity: ticket.quantity,
        status: ticket.status,
        usedAt: ticket.usedAt,
        createdAt: ticket.createdAt,
        user: ticket.userId
      }))
    });
  });

  /**
   * Get active tickets for the authenticated user
   * @route GET /api/v1/tickets/active
   * @access Private
   */
  static getActiveTickets = asyncHandler(async (req, res) => {
    const userId = req.user._id;

    const tickets = await Ticket.findActiveByUser(userId);

    return successResponse(res, {
      tickets: tickets.map(ticket => ({
        id: ticket._id,
        qrCode: ticket.qrCode,
        ticketTypeName: ticket.ticketTypeName,
        price: ticket.price,
        quantity: ticket.quantity,
        createdAt: ticket.createdAt,
        event: ticket.eventId
      }))
    });
  });

  static scanTicket = asyncHandler(async (req, res) => {
    try {
      const token = req.query.t;
      if (!token) return res.status(400).json({ error: 'Missing token' });

      const decoded = await verifyQRToken(token);
      if (!decoded) return res.status(400).json({ error: 'Invalid or expired token' });

      const scannerUser = req.user || null; // null = public access

      const result = await verifyAndUseTicket(decoded.ticketId, scannerUser);
      res.json(result);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Cancel a ticket
   * @route PATCH /api/v1/tickets/:ticketId/cancel
   * @access Private
   */
  static cancelTicket = asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const userId = req.user._id;

    const ticket = await Ticket.findById(ticketId);
    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    // Check if user owns the ticket
    if (ticket.userId.toString() !== userId.toString()) {
      throw new ValidationError('You can only cancel your own tickets');
    }

    if (ticket.status === 'used') {
      throw new ValidationError('Cannot cancel a used ticket');
    }

    if (ticket.status === 'cancelled') {
      throw new ValidationError('Ticket is already cancelled');
    }

    await ticket.cancel();

    // Decrement event ticket sales
    const event = await Event.findById(ticket.eventId);
    if (event) {
      await event.decrementTicketSales(ticket.ticketTypeId, ticket.quantity);
    }

    logger.info('Ticket cancelled', {
      ticketId: ticket._id,
      userId: ticket.userId,
      eventId: ticket.eventId
    });

    return successResponse(res, {
      ticket: {
        id: ticket._id,
        status: ticket.status
      }
    }, 200, 'Ticket cancelled successfully');
  });

  /**
   * Get ticket details by ID
   * @route GET /api/v1/tickets/:ticketId
   * @access Private
   */
  static getTicketById = asyncHandler(async (req, res) => {
    const { ticketId } = req.params;
    const userId = req.user._id;

    const ticket = await Ticket.findById(ticketId)
      .populate('eventId', 'title startTime endTime venue image')
      .populate('userId', 'fullName email');

    if (!ticket) {
      throw new NotFoundError('Ticket not found');
    }

    // Check if user owns the ticket or is admin
    if (ticket.userId._id.toString() !== userId.toString() && req.user.role === 'user') {
      throw new ValidationError('You can only view your own tickets');
    }

    return successResponse(res, {
      ticket: {
        id: ticket._id,
        qrCode: ticket.qrCode,
        ticketData: JSON.parse(ticket.ticketData),
        ticketTypeName: ticket.ticketTypeName,
        price: ticket.price,
        quantity: ticket.quantity,
        status: ticket.status,
        usedAt: ticket.usedAt,
        createdAt: ticket.createdAt,
        event: ticket.eventId,
        user: ticket.userId
      }
    });
  });
}

module.exports = TicketController;
