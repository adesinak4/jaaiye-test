const logger = require('./logger');

/**
 * Handle Google OAuth errors with standardized responses
 */
exports.handleGoogleOAuthError = (err, res) => {
  const errorMessage = err.message || err.toString();

  // Handle specific Google OAuth errors
  if (errorMessage.includes('invalid_grant')) {
    return {
      error: 'invalid_grant',
      message: 'Google authorization has expired or was revoked. Please re-authenticate with Google.',
      requiresReauth: true,
      statusCode: 401
    };
  }

  if (errorMessage.includes('unauthorized_client')) {
    return {
      error: 'unauthorized_client',
      message: 'Google OAuth client is not authorized. Please check your Google OAuth configuration.',
      requiresConfigCheck: true,
      statusCode: 401
    };
  }

  if (errorMessage.includes('invalid_client')) {
    return {
      error: 'invalid_client',
      message: 'Invalid Google OAuth client configuration. Please check your client ID and secret.',
      requiresConfigCheck: true,
      statusCode: 401
    };
  }

  if (errorMessage.includes('access_denied')) {
    return {
      error: 'access_denied',
      message: 'Access to Google Calendar was denied. Please grant the required permissions.',
      requiresReauth: true,
      statusCode: 403
    };
  }

  if (errorMessage.includes('insufficient authentication scopes')) {
    return {
      error: 'insufficient_scopes',
      message: 'Insufficient permissions. Please grant full access to Google Calendar.',
      requiresReauth: true,
      statusCode: 403
    };
  }

  // Generic Google API error
  return {
    error: 'google_api_error',
    message: 'Google API error occurred. Please try again later.',
    details: errorMessage,
    statusCode: 500
  };
};

/**
 * Validate Google OAuth tokens
 */
exports.validateGoogleTokens = (tokens) => {
  try {
    if (!tokens) {
      throw new Error('No tokens provided');
    }

    if (!tokens.access_token) {
      throw new Error('Access token is required');
    }

    if (!tokens.refresh_token) {
      throw new Error('Refresh token is required');
    }

    if (!tokens.scope) {
      throw new Error('Token scope is required');
    }

    // Check if tokens have required scopes
    const requiredScopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ];

    const hasRequiredScopes = requiredScopes.some(scope =>
      tokens.scope.includes(scope)
    );

    if (!hasRequiredScopes) {
      throw new Error('Tokens do not have required Google Calendar scopes');
    }

    logger.info('Google tokens validated successfully');
    return true;
  } catch (error) {
    logger.error('Google token validation failed', { error: error.message });
    throw error;
  }
};

/**
 * Validate calendar scopes for Google Calendar API
 */
exports.validateCalendarScopes = (tokens) => {
  try {
    if (!tokens.scope) {
      throw new Error('Token scope is required');
    }

    const requiredScopes = [
      'https://www.googleapis.com/auth/calendar',
      'https://www.googleapis.com/auth/calendar.events'
    ];

    const hasRequiredScopes = requiredScopes.some(scope =>
      tokens.scope.includes(scope)
    );

    if (!hasRequiredScopes) {
      throw new Error('Insufficient authentication scopes. Required: calendar and calendar.events');
    }

    logger.info('Calendar scopes validated successfully');
    return true;
  } catch (error) {
    logger.error('Calendar scope validation failed', { error: error.message });
    throw error;
  }
};

/**
 * Create Google OAuth2 client with credentials
 */
exports.createGoogleOAuthClient = (tokens) => {
  try {
    const { OAuth2Client } = require('google-auth-library');
    const client = new OAuth2Client(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI
    );

    if (tokens) {
      client.setCredentials({
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        scope: tokens.scope,
        expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).getTime() : undefined
      });
    }

    return client;
  } catch (error) {
    logger.error('Failed to create Google OAuth client', { error: error.message });
    throw error;
  }
};

/**
 * Get Google Calendar name by ID
 */
exports.getGoogleCalendarName = (calendarId, googleCalendars = {}) => {
  try {
    if (calendarId === 'primary') {
      return 'Primary Calendar';
    }

    const calendar = googleCalendars[calendarId];
    if (calendar) {
      return calendar.summary || calendar.name || 'Unknown Calendar';
    }

    return calendarId;
  } catch (error) {
    logger.error('Failed to get Google calendar name', { calendarId, error: error.message });
    return calendarId;
  }
};

/**
 * Check if Google Calendar is accessible
 */
exports.isGoogleCalendarAccessible = (user) => {
  try {
    return !!(user?.googleCalendar?.refreshToken &&
              user?.googleCalendar?.accessToken &&
              user?.googleCalendar?.scope);
  } catch (error) {
    logger.error('Failed to check Google Calendar accessibility', { error: error.message });
    return false;
  }
};

/**
 * Format Google Calendar data for consistent structure
 */
exports.formatGoogleCalendarData = (googleCalendars = [], selectedCalendarIds = []) => {
  try {
    const formatted = {};

    googleCalendars.forEach(calendar => {
      const calendarId = calendar.id;
      formatted[calendarId] = {
        id: calendarId,
        name: calendar.summary || calendar.name || 'Unknown Calendar',
        description: calendar.description || '',
        color: calendar.backgroundColor || '#4285F4',
        accessRole: calendar.accessRole || 'none',
        primary: calendar.primary || false,
        selected: selectedCalendarIds.includes(calendarId),
        timeZone: calendar.timeZone || 'UTC',
        location: calendar.location || '',
        etag: calendar.etag
      };
    });

    return formatted;
  } catch (error) {
    logger.error('Failed to format Google calendar data', { error: error.message });
    return {};
  }
};

/**
 * Check if Google tokens are expired or near expiration
 */
exports.isTokenExpired = (expiryDate, bufferMinutes = 5) => {
  try {
    if (!expiryDate) {
      return true; // No expiry date means expired
    }

    const now = new Date();
    const expiry = new Date(expiryDate);
    const bufferMs = bufferMinutes * 60 * 1000;

    return now >= (expiry.getTime() - bufferMs);
  } catch (error) {
    logger.error('Failed to check token expiration', { error: error.message });
    return true; // Assume expired on error
  }
};

/**
 * Log Google API operation for debugging
 */
exports.logGoogleOperation = (operation, details = {}) => {
  try {
    logger.info(`Google API operation: ${operation}`, {
      operation,
      timestamp: new Date().toISOString(),
      ...details
    });
  } catch (error) {
    // Don't let logging errors break the main flow
    console.error('Failed to log Google operation:', error);
  }
};

/**
 * Sanitize Google API response for logging
 */
exports.sanitizeGoogleResponse = (response) => {
  try {
    if (!response) return response;

    const sanitized = { ...response };

    // Remove sensitive fields
    if (sanitized.access_token) {
      sanitized.access_token = '[REDACTED]';
    }

    if (sanitized.refresh_token) {
      sanitized.refresh_token = '[REDACTED]';
    }

    if (sanitized.id_token) {
      sanitized.id_token = '[REDACTED]';
    }

    return sanitized;
  } catch (error) {
    logger.error('Failed to sanitize Google response', { error: error.message });
    return response;
  }
};
