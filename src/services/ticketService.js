const { generateTicketQRCode } = require('../utils/qrGenerator');
const Ticket = require('../models/Ticket');
const Event = require('../models/Event');
const { ValidationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');

async function createTicketInternal({ eventId, quantity = 1, userId, assignedTo = null }) {
  if (!eventId) {
    throw new ValidationError('Event ID and Ticket Type ID are required');
  }

  if (quantity < 1 || quantity > 10) {
    throw new ValidationError('Quantity must be between 1 and 10');
  }

  const event = await Event.findById(eventId);
  if (!event) throw new NotFoundError('Event not found');

  if (event.status !== 'scheduled') {
    throw new ValidationError('Cannot create ticket for cancelled or completed event');
  }

  // const ticketType = event.ticketTypes.id(ticketTypeId);
  // if (!ticketType) throw new NotFoundError('Ticket type not found');

  // const availableTicketTypes = event.getAvailableTicketTypes();
  // const availableTicketType = availableTicketTypes.find(
  //   t => t._id.toString() === ticketTypeId.toString()
  // );
  // if (!availableTicketType) {
  //   throw new ValidationError('Ticket type is not available for purchase');
  // }

  // Avoid duplicate tickets per user for same event type
  // const existingTicket = await Ticket.findOne({ userId, eventId });
  // if (existingTicket && !assignedTo) {
  //   throw new ConflictError('You already have a ticket for this event');
  // }

  const ticket = await Ticket.create({
    userId,
    eventId,
    // ticketTypeId,
    // ticketTypeName: ticketType.name,
    price: event.ticketFee,
    quantity,
    assignedTo
  });

  const { qrCode, verifyUrl } = await generateTicketQRCode(ticket);
  ticket.qrCode = qrCode;
  ticket.ticketData = JSON.stringify({ verifyUrl });
  await ticket.save();

  // Increment event’s sold ticket count
  await event.incrementTicketSales(quantity = 1);

  await ticket.populate([
    { path: 'eventId', select: 'title startTime endTime venue image ticketTypes' },
    { path: 'userId', select: 'username fullName email' }
  ]);

  return ticket;
}

async function verifyAndUseTicket(ticketId, scannerUser = null) {
  const ticket = await Ticket.findById(ticketId).populate('event user');
  if (!ticket) throw new Error('Ticket not found');

  // If scanner is authenticated
  if (scannerUser) {
    if (ticket.status === 'used') throw new Error('Ticket already used');

    ticket.status = 'used';
    ticket.usedAt = new Date();
    ticket.usedBy = scannerUser._id;
    await ticket.save();

    return {
      message: 'Ticket verified and marked as used',
      data: ticket
    };
  }

  // Non-authenticated (public check)
  return {
    message: 'Ticket valid',
    data: {
      eventName: ticket.eventId.name,
      holderName: ticket.userId.name,
      status: ticket.status
    }
  };
}

module.exports = {
  createTicketInternal,
  verifyAndUseTicket
};
