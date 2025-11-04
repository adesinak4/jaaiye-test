const { generateTicketQRCode } = require('../utils/qrGenerator');
const Ticket = require('../models/Ticket');
const Event = require('../models/Event');
const { ValidationError, NotFoundError, ConflictError } = require('../middleware/errorHandler');

async function createTicketInternal({ eventId, ticketTypeId = null, quantity = 1, userId, assignedTo = null, complimentary = false, bypassCapacity = false }) {
  if (!eventId) {
    throw new ValidationError('Event ID is required');
  }

  if (quantity < 1 || quantity > 10) {
    throw new ValidationError('Quantity must be between 1 and 10');
  }

  const event = await Event.findById(eventId);
  if (!event) throw new NotFoundError('Event not found');

  if (event.status !== 'scheduled') {
    throw new ValidationError('Cannot create ticket for cancelled or completed event');
  }

  // Determine ticket pricing mode (free vs paid with types)
  let chosenType = null;
  let resolvedPrice = 0;

  if (event.ticketFee === 'free') {
    // Free mode: all tickets are free
    resolvedPrice = 0;
  } else if (Array.isArray(event.ticketTypes) && event.ticketTypes.length > 0) {
    // Paid mode with ticket types
    if (ticketTypeId) {
      const tt = event.ticketTypes.id(ticketTypeId);
      if (!tt) throw new NotFoundError('Ticket type not found');

      // Validate availability
      const now = new Date();
      const inWindow = (!tt.salesStartDate || now >= tt.salesStartDate) && (!tt.salesEndDate || now <= tt.salesEndDate);
      const hasCapacity = !tt.capacity || (tt.soldCount + quantity) <= tt.capacity;
      if (!tt.isActive || !inWindow || (!hasCapacity && !bypassCapacity)) {
        throw new ValidationError('Ticket type is not available for purchase');
      }
      chosenType = tt;
    } else {
      // Auto-pick: Early Bird priority (by name), else Regular, else first available
      const available = event.getAvailableTicketTypes();
      const availableWithCapacity = available.filter(tt => !tt.capacity || (tt.soldCount + quantity) <= tt.capacity);
      chosenType =
        availableWithCapacity.find(tt => /early\s*bird/i.test(tt.name)) ||
        availableWithCapacity.find(tt => /regular/i.test(tt.name)) ||
        availableWithCapacity[0];
      if (!chosenType) {
        throw new ValidationError('No available ticket types');
      }
    }
    resolvedPrice = Number(chosenType.price) || 0;
  } else {
    // Paid without configured types: fallback to legacy ticketFee numeric
    if (event.ticketFee === null || event.ticketFee === undefined || event.ticketFee === 'free') {
      resolvedPrice = 0;
    } else if (isNaN(event.ticketFee)) {
      throw new ValidationError('Event is paid but no ticket types configured');
    } else {
      resolvedPrice = Number(event.ticketFee);
    }
  }

  // Complimentary overrides price
  if (complimentary) {
    resolvedPrice = 0;
  }

  // Avoid duplicate tickets per user for same event type
  // const existingTicket = await Ticket.findOne({ userId, eventId });
  // if (existingTicket && !assignedTo) {
  //   throw new ConflictError('You already have a ticket for this event');
  // }

  const ticket = await Ticket.create({
    userId,
    eventId,
    ticketTypeId: chosenType ? chosenType._id : undefined,
    ticketTypeName: chosenType ? chosenType.name : undefined,
    price: resolvedPrice,
    quantity,
    assignedTo
  });

  // Ensure a human-readable publicId (e.g., jaaiye-XXXXXX)
  if (!ticket.publicId) {
    const suffix = (ticket._id?.toString?.() || Math.random().toString(36).slice(2)).slice(-8);
    ticket.publicId = `jaaiye-${suffix}`;
  }

  const { qrCode, verifyUrl } = await generateTicketQRCode(ticket);
  ticket.qrCode = qrCode;
  ticket.ticketData = JSON.stringify({ verifyUrl });
  await ticket.save();

  // Increment event’s sold ticket count (and specific type if selected)
  await event.incrementTicketSales(chosenType ? chosenType._id : null, quantity, bypassCapacity);

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
