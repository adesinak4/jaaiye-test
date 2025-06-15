const Integration = require('../models/Integration');
const User = require('../models/User');
const { NotFoundError, BadRequestError } = require('../utils/errors');
const { google } = require('googleapis');
const { outlook } = require('@microsoft/microsoft-graph-client');
const { zoom } = require('@zoomus/websdk');

// Connect to a third-party service
exports.connectIntegration = async (req, res, next) => {
  const { type, credentials } = req.body;
  const userId = req.user._id;

  // Check if integration already exists
  const existingIntegration = await Integration.findOne({
    user: userId,
    type
  });

  if (existingIntegration) {
    throw new BadRequestError('Integration already exists');
  }

  // Validate and store credentials
  let validatedCredentials;
  try {
    validatedCredentials = await validateCredentials(type, credentials);
  } catch(error) {
    throw new BadRequestError(`Invalid credentials: ${error.message}`);
  }

  // Create integration
  const integration = await Integration.create({
    type,
    user: userId,
    credentials: validatedCredentials,
    settings: getDefaultSettings(type)
  });

  // Initial sync
  try {
    await syncIntegration(integration);
  } catch(error) {
    console.error('Initial sync failed:', err);
    // Don't fail the request if sync fails
  }

  res.status(201).json(integration);
};

// Get user's integrations
exports.getIntegrations = async (req, res, next) => {
  const integrations = await Integration.find({ user: req.user._id });
  res.json(integrations);
};

// Update integration settings
exports.updateIntegration = async (req, res, next) => {
  const { settings } = req.body;
  const integration = await Integration.findOne({
    _id: req.params.id,
    user: req.user._id
  });

  if (!integration) {
    throw new NotFoundError('Integration not found');
  }

  // Update settings
  Object.assign(integration.settings, settings);
  await integration.save();

  res.json(integration);
};

// Disconnect integration
exports.disconnectIntegration = async (req, res, next) => {
  const integration = await Integration.findOneAndDelete({
    _id: req.params.id,
    user: req.user._id
  });

  if (!integration) {
    throw new NotFoundError('Integration not found');
  }

  res.json({ message: 'Integration disconnected successfully' });
};

// Force sync integration
exports.syncIntegration = async (req, res, next) => {
  const integration = await Integration.findOne({
    _id: req.params.id,
    user: req.user._id
  });

  if (!integration) {
    throw new NotFoundError('Integration not found');
  }

  try {
    await syncIntegration(integration);
    res.json({ message: 'Integration synced successfully' });
  } catch(error) {
    throw new BadRequestError(`Sync failed: ${error.message}`);
  }
};

// Helper functions
async function validateCredentials(type, credentials) {
  switch (type) {
    case 'google':
      return validateGoogleCredentials(credentials);
    case 'outlook':
      return validateOutlookCredentials(credentials);
    case 'zoom':
      return validateZoomCredentials(credentials);
    default:
      throw new BadRequestError('Unsupported integration type');
  }
}

async function validateGoogleCredentials(credentials) {
  const auth = new google.auth.OAuth2(
    credentials.clientId,
    credentials.clientSecret,
    credentials.redirectUri
  );

  auth.setCredentials({
    access_token: credentials.accessToken,
    refresh_token: credentials.refreshToken
  });

  const calendar = google.calendar({ version: 'v3', auth });
  await calendar.calendarList.list(); // Test API access

  return credentials;
}

async function validateOutlookCredentials(credentials) {
  const client = outlook.Client.init({
    authProvider: (done) => {
      done(null, credentials.accessToken);
    }
  });

  await client.api('/me/calendars').get(); // Test API access

  return credentials;
}

async function validateZoomCredentials(credentials) {
  const client = zoom({
    apiKey: credentials.apiKey,
    apiSecret: credentials.apiSecret
  });

  await client.users.me(); // Test API access

  return credentials;
}

function getDefaultSettings(type) {
  const baseSettings = {
    syncFrequency: 'hourly',
    autoAccept: false,
    twoWaySync: true,
    notifications: true
  };

  switch (type) {
    case 'google':
      return {
        ...baseSettings,
        eventTypes: ['meeting', 'task'],
        calendars: []
      };
    case 'outlook':
      return {
        ...baseSettings,
        eventTypes: ['meeting', 'appointment'],
        calendars: []
      };
    case 'zoom':
      return {
        ...baseSettings,
        autoJoin: false,
        recordMeetings: false
      };
    default:
      return baseSettings;
  }
}

async function syncIntegration(integration) {
  const startTime = new Date();
  let itemsSynced = 0;
  let error = null;

  try {
    switch (integration.type) {
      case 'google':
        itemsSynced = await syncGoogleCalendar(integration);
        break;
      case 'outlook':
        itemsSynced = await syncOutlookCalendar(integration);
        break;
      case 'zoom':
        itemsSynced = await syncZoomMeetings(integration);
        break;
    }

    integration.status = 'active';
    integration.error = null;
  } catch (err) {
    integration.status = 'error';
    integration.error = {
      message: err.message,
      code: err.code,
      timestamp: new Date()
    };
    error = err.message;
  }

  // Update sync history
  integration.lastSync = new Date();
  integration.syncHistory.push({
    timestamp: startTime,
    status: error ? 'error' : 'success',
    itemsSynced,
    error
  });

  // Keep only last 10 sync records
  if (integration.syncHistory.length > 10) {
    integration.syncHistory = integration.syncHistory.slice(-10);
  }

  await integration.save();
}

async function syncGoogleCalendar(integration) {
  const auth = new google.auth.OAuth2(
    integration.credentials.clientId,
    integration.credentials.clientSecret
  );

  auth.setCredentials({
    access_token: integration.credentials.accessToken,
    refresh_token: integration.credentials.refreshToken
  });

  const calendar = google.calendar({ version: 'v3', auth });
  let itemsSynced = 0;

  // Sync calendars
  const calendars = await calendar.calendarList.list();
  for (const cal of calendars.data.items) {
    if (integration.settings.calendars.includes(cal.id)) {
      const events = await calendar.events.list({
        calendarId: cal.id,
        timeMin: new Date().toISOString(),
        timeMax: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
      });

      // Process events
      for (const event of events.data.items) {
        if (integration.settings.eventTypes.includes(event.eventType)) {
          await processGoogleEvent(event, integration);
          itemsSynced++;
        }
      }
    }
  }

  return itemsSynced;
}

async function syncOutlookCalendar(integration) {
  const client = outlook.Client.init({
    authProvider: (done) => {
      done(null, integration.credentials.accessToken);
    }
  });

  let itemsSynced = 0;

  // Sync calendars
  const calendars = await client.api('/me/calendars').get();
  for (const cal of calendars.value) {
    if (integration.settings.calendars.includes(cal.id)) {
      const events = await client.api(`/me/calendars/${cal.id}/events`)
        .filter(`start/dateTime ge '${new Date().toISOString()}'`)
        .get();

      // Process events
      for (const event of events.value) {
        if (integration.settings.eventTypes.includes(event.type)) {
          await processOutlookEvent(event, integration);
          itemsSynced++;
        }
      }
    }
  }

  return itemsSynced;
}

async function syncZoomMeetings(integration) {
  const client = zoom({
    apiKey: integration.credentials.apiKey,
    apiSecret: integration.credentials.apiSecret
  });

  let itemsSynced = 0;

  // Get upcoming meetings
  const meetings = await client.meetings.list('me', {
    type: 'upcoming',
    page_size: 100
  });

  // Process meetings
  for (const meeting of meetings.meetings) {
    await processZoomMeeting(meeting, integration);
    itemsSynced++;
  }

  return itemsSynced;
}

async function processGoogleEvent(event, integration) {
  // Implement event processing logic
  // This is a placeholder
  console.log('Processing Google event:', event.id);
}

async function processOutlookEvent(event, integration) {
  // Implement event processing logic
  // This is a placeholder
  console.log('Processing Outlook event:', event.id);
}

async function processZoomMeeting(meeting, integration) {
  // Implement meeting processing logic
  // This is a placeholder
  console.log('Processing Zoom meeting:', meeting.id);
}