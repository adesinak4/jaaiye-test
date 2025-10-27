const Transaction = require('../models/Transaction');
const { createTicketInternal } = require('./ticketService');
const User = require('../models/User');
const Event = require('../models/Event');
const googleSvc = require('./googleCalendarService');
const logger = require('../utils/logger');
const { addCalendarGuidanceToResponse } = require('../utils/calendarGuidance');

// Helper function to add event to user's Google Calendar
async function addEventToUserCalendar(userId, eventId) {
  try {
    const userForCalendar = await User.findById(userId).select('+googleCalendar.refreshToken +googleCalendar.accessToken');
    const event = await Event.findById(eventId);

    if (!userForCalendar || !event) {
      logger.warn('User or event not found for calendar integration', { userId, eventId });
      return { success: false, reason: 'user_or_event_not_found' };
    }

    // Check if user has Google Calendar linked
    if (!userForCalendar.googleCalendar || !userForCalendar.googleCalendar.refreshToken) {
      logger.info('User does not have Google Calendar linked', { userId });
      return { success: false, reason: 'calendar_not_linked' };
    }

    // Check if event already has Google Calendar entry
    if (event.external && event.external.google && event.external.google.eventId) {
      logger.info('Event already has Google Calendar entry', { eventId, googleEventId: event.external.google.eventId });
      return { success: true, reason: 'already_exists' };
    }

    // Create Google Calendar event
    const eventBody = {
      summary: event.title,
      description: event.description || `Ticket purchased for ${event.title}`,
      start: { dateTime: new Date(event.startTime).toISOString() },
      end: { dateTime: new Date(event.endTime || event.startTime).toISOString() },
      location: event.venue || undefined
    };

    const googleEvent = await googleSvc.insertEvent(userForCalendar, eventBody);

    // Update event with Google Calendar info
    event.external = event.external || {};
    event.external.google = {
      calendarId: userForCalendar.googleCalendar.jaaiyeCalendarId,
      eventId: googleEvent.id,
      etag: googleEvent.etag
    };
    await event.save();

    logger.info('Event added to user Google Calendar', {
      userId,
      eventId,
      googleEventId: googleEvent.id
    });

    return { success: true, googleEventId: googleEvent.id };
  } catch (error) {
    logger.error('Failed to add event to user calendar', {
      userId,
      eventId,
      error: error.message
    });
    return { success: false, reason: 'calendar_error', error: error.message };
  }
}

async function handleSuccessfulPayment({ provider, reference, amount, currency, metadata, raw }) {
  const { eventId, ticketTypeId, quantity = 1, userId, assignees = [] } = metadata || {};
  if (!eventId || !userId) {
    return { ok: false, reason: 'missing_metadata' };
  }

  const buyer = await User.findById(userId);

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
  // let finalTicketTypeId = ticketTypeId;
  // if (!finalTicketTypeId) {
  //   const Event = require('../models/Event');
  //   const event = await Event.findById(eventId);
  //   if (!event) {
  //     return { ok: false, reason: 'event_not_found' };
  //   }

  //   const availableTicketTypes = event.getAvailableTicketTypes();
  //   if (availableTicketTypes.length === 0) {
  //     return { ok: false, reason: 'no_available_ticket_types' };
  //   }

  //   finalTicketTypeId = availableTicketTypes[0]._id;
  //   console.log('Using first available ticket type:', finalTicketTypeId);
  // }

  const createdTickets = [];

  // Handle assigned recipients
  if (Array.isArray(assignees) && assignees.length > 0) {
    for (const assignee of assignees) {
      const { name, email } = assignee;
      console.log(assignee)
      const ticket = await createTicketInternal({
        eventId,
        userId,
        quantity: 1,
        assignedTo: { name, email }
      });
      createdTickets.push(ticket);
      const { emailQueue } = require('../queues');
      await emailQueue.sendPaymentConfirmationEmailAsync(email, ticket);
    }
  } else {
    // Single buyer or unassigned multiple tickets
    for (let i = 0; i < quantity; i++) {
      const ticket = await createTicketInternal({
        eventId,
        // ticketTypeId: finalTicketTypeId,
        userId,
        quantity: 1
      });
      createdTickets.push(ticket);
    }

    // Send confirmation email to buyer (with all QR codes if multiple)
    const { emailQueue } = require('../queues');
    await emailQueue.sendPaymentConfirmationEmailAsync(buyer.email, createdTickets);
  }

  trx.status = 'successful';
  await trx.save();

  // Add event to user's Google Calendar if linked
  try {
    const calendarResult = await addEventToUserCalendar(userId, eventId);
    if (calendarResult.success) {
      logger.info('Calendar integration successful for ticket purchase', {
        userId,
        eventId,
        googleEventId: calendarResult.googleEventId
      });
    } else if (calendarResult.reason === 'calendar_not_linked') {
      logger.info('User does not have Google Calendar linked - skipping calendar integration', { userId });
    } else {
      logger.warn('Calendar integration failed for ticket purchase', {
        userId,
        eventId,
        reason: calendarResult.reason
      });
    }
  } catch (error) {
    logger.error('Calendar integration error during ticket purchase', {
      userId,
      eventId,
      error: error.message
    });
    // Don't fail the payment process if calendar integration fails
  }

  const result = { ok: true, tickets: createdTickets, transaction: trx };

  // Add calendar guidance if user doesn't have calendar linked
  const userForGuidance = await User.findById(userId);
  return addCalendarGuidanceToResponse(result, userForGuidance, 'ticket_purchase');
}

module.exports = {
  handleSuccessfulPayment
};
