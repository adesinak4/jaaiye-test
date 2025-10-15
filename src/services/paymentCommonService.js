const Transaction = require('../models/Transaction');
const { createTicketInternal } = require('./ticketService');
const { emailQueue } = require('../queues');
const Ticket = require('../models/Ticket');

async function handleSuccessfulPayment({ provider, reference, amount, currency, metadata, raw }) {
  const { eventId, ticketTypeId, quantity = 1, userId, assignees = [] } = metadata || {};
  if (!eventId || !ticketTypeId || !userId) {
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
      ticketTypeId,
      quantity,
      metadata,
      raw,
      status: 'pending'
    });
  }

  const createdTickets = [];

  // Handle assigned recipients
  if (Array.isArray(assignees) && assignees.length > 0) {
    for (const assignee of assignees) {
      const { name, email } = assignee;
      const ticket = await createTicketInternal({
        eventId,
        ticketTypeId,
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
        ticketTypeId,
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
