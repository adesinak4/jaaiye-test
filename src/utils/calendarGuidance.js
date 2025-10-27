const logger = require('./logger');

/**
 * Provides guidance for users who don't have Google Calendar linked
 * @param {string} context - The context where calendar linking would be helpful
 * @returns {Object} Guidance object with message and action suggestions
 */
function getCalendarGuidance(context = 'general') {
  const guidanceMessages = {
    ticket_purchase: {
      message: "Link your Google Calendar to automatically add events to your calendar when you purchase tickets!",
      benefits: [
        "Events automatically appear in your Google Calendar",
        "Never miss an event you've paid for",
        "Sync with your other calendar apps"
      ],
      actionText: "Link Google Calendar",
      actionUrl: "/api/google/link"
    },
    event_creation: {
      message: "Link your Google Calendar to automatically sync events with participants!",
      benefits: [
        "Events automatically appear in participants' calendars",
        "Better event coordination",
        "Reduced manual calendar management"
      ],
      actionText: "Link Google Calendar",
      actionUrl: "/api/google/link"
    },
    participant_addition: {
      message: "Link your Google Calendar to automatically add events to participants' calendars!",
      benefits: [
        "Invited participants get events in their calendars",
        "Better event attendance",
        "Seamless calendar integration"
      ],
      actionText: "Link Google Calendar",
      actionUrl: "/api/google/link"
    },
    general: {
      message: "Link your Google Calendar to get the most out of Jaaiye!",
      benefits: [
        "Automatic event synchronization",
        "Never miss important events",
        "Better event coordination with friends"
      ],
      actionText: "Link Google Calendar",
      actionUrl: "/api/google/link"
    }
  };

  return guidanceMessages[context] || guidanceMessages.general;
}

/**
 * Checks if a user has Google Calendar linked
 * @param {Object} user - User object
 * @returns {boolean} True if calendar is linked
 */
function isCalendarLinked(user) {
  return !!(user && user.googleCalendar && user.googleCalendar.refreshToken);
}

/**
 * Adds calendar guidance to API responses when appropriate
 * @param {Object} response - The response object
 * @param {Object} user - User object
 * @param {string} context - Context for the guidance
 * @returns {Object} Enhanced response with calendar guidance
 */
function addCalendarGuidanceToResponse(response, user, context = 'general') {
  if (!isCalendarLinked(user)) {
    response.calendarGuidance = getCalendarGuidance(context);
    logger.info('Added calendar guidance to response', {
      userId: user?._id || user?.id,
      context
    });
  }
  return response;
}

module.exports = {
  getCalendarGuidance,
  isCalendarLinked,
  addCalendarGuidanceToResponse
};
