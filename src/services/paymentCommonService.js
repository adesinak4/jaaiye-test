const Transaction = require('../models/Transaction');
const { createTicketInternal } = require('./ticketService');
const { emailQueue } = require('../queues');
const Ticket = require('../models/Ticket');

async function handleSuccessfulPayment({ provider, reference, amount, currency, metadata, raw }) {
  const { eventId, ticketTypeId, quantity = 1, userId, assignees = [] } = metadata || {};
  if (!eventId || !userId) {
    return { ok: false, reason: 'missing_metadata' };
  }

  // Check for existing transaction
  let trx = await Transaction.findOne({ provider, reference });
  if (trx && trx.status === 'successful') {
    return { ok: true, alreadyProcessed: true, transaction: trx };
  }

  if (!trx) {
    trx = await Transaction.create({
      provider,
      reference,
      amount,
      currency,
      userId,
      eventId,
      ticketTypeId: ticketTypeId || null,
      quantity,
      metadata,
      raw,
      status: 'pending'
    });
  }

  // If no ticketTypeId provided, get the first available ticket type
  let finalTicketTypeId = ticketTypeId;
  if (!finalTicketTypeId) {
    const Event = require('../models/Event');
    const event = await Event.findById(eventId);
    if (!event) {
      return { ok: false, reason: 'event_not_found' };
    }

    const availableTicketTypes = event.getAvailableTicketTypes();
    if (availableTicketTypes.length === 0) {
      return { ok: false, reason: 'no_available_ticket_types' };
    }

    finalTicketTypeId = availableTicketTypes[0]._id;
    console.log('Using first available ticket type:', finalTicketTypeId);
  }

  const createdTickets = [];

  // Handle assigned recipients
  if (Array.isArray(assignees) && assignees.length > 0) {
    for (const assignee of assignees) {
      const { name, email } = assignee;
      const ticket = await createTicketInternal({
        eventId,
        ticketTypeId: finalTicketTypeId,
        userId,
        quantity: 1,
        assignedTo: { name, email }
      });
      createdTickets.push(ticket);
      await emailQueue.sendPaymentConfirmationEmailAsync(email, ticket);
    }
  } else {
    // Single buyer or unassigned multiple tickets
    for (let i = 0; i < quantity; i++) {
      const ticket = await createTicketInternal({
        eventId,
        ticketTypeId: finalTicketTypeId,
        userId,
        quantity: 1
      });
      createdTickets.push(ticket);
    }

    // Send confirmation email to buyer (with all QR codes if multiple)
    await emailQueue.sendPaymentConfirmationEmailAsync(metadata.email, createdTickets);
  }

  trx.status = 'successful';
  await trx.save();

  return { ok: true, tickets: createdTickets, transaction: trx };
}

module.exports = {
  handleSuccessfulPayment
};
