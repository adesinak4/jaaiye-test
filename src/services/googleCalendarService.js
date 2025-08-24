const { google } = require('googleapis');
const logger = require('../utils/logger');

function createOAuth2Client() {
  const client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
  );
  return client;
}

async function setUserCredentials(client, user) {
  if (!user.googleCalendar || !user.googleCalendar.refreshToken) {
    throw new Error('Google account not linked');
  }

  try {
    // Check if access token is expired or will expire soon (within 5 minutes)
    const now = new Date();
    const tokenExpiry = user.googleCalendar.expiryDate;
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);

    if (tokenExpiry && now >= tokenExpiry) {
      logger.info('Access token expired, refreshing...', { userId: user._id });

      // Refresh the access token
      const newTokens = await exports.refreshAccessToken(user);

      // Update user with new tokens
      if (newTokens.access_token) {
        user.googleCalendar.accessToken = newTokens.access_token;
        user.googleCalendar.expiryDate = newTokens.expiry_date;
        await user.save();
      }
    }

    client.setCredentials({
      refresh_token: user.googleCalendar.refreshToken,
      access_token: user.googleCalendar.accessToken,
      expiry_date: user.googleCalendar.expiryDate ? new Date(user.googleCalendar.expiryDate).getTime() : undefined,
      scope: user.googleCalendar.scope
    });
  } catch (error) {
    logger.error('Failed to set user credentials:', {
      error: error.message,
      userId: user._id
    });
    throw new Error(`Failed to authenticate with Google: ${error.message}`);
  }
}

exports.exchangeServerAuthCode = async function exchangeServerAuthCode(serverAuthCode) {
  try {
    const client = createOAuth2Client();
    const { tokens } = await client.getToken(serverAuthCode);
    logger.info('Exchanged Google server auth code successfully');
    return tokens; // { access_token, refresh_token, scope, expiry_date, id_token }
  } catch (error) {
    logger.error('Failed to exchange Google server auth code:', {
      error: error.message,
      code: error.code,
      status: error.status
    });

    // Re-throw with enhanced error information
    const enhancedError = new Error(error.message || 'Failed to exchange auth code');
    enhancedError.originalError = error;
    enhancedError.code = error.code;
    enhancedError.status = error.status;
    throw enhancedError;
  }
};

exports.refreshAccessToken = async function refreshAccessToken(user) {
  try {
    if (!user.googleCalendar || !user.googleCalendar.refreshToken) {
      throw new Error('No refresh token available');
    }

    const client = createOAuth2Client();
    client.setCredentials({
      refresh_token: user.googleCalendar.refreshToken
    });

    const { credentials } = await client.refreshAccessToken();
    logger.info('Refreshed Google access token successfully');

    return {
      access_token: credentials.access_token,
      expiry_date: credentials.expiry_date,
      scope: credentials.scope
    };
  } catch (error) {
    logger.error('Failed to refresh Google access token:', {
      error: error.message,
      code: error.code,
      status: error.status,
      userId: user._id
    });

    // Re-throw with enhanced error information
    const enhancedError = new Error(error.message || 'Failed to refresh access token');
    enhancedError.originalError = error;
    enhancedError.code = error.code;
    enhancedError.status = error.status;
    throw enhancedError;
  }
};

exports.saveTokensToUser = async function saveTokensToUser(user, tokens) {
  user.providerLinks = user.providerLinks || {};
  user.providerLinks.google = true;
  user.googleCalendar = user.googleCalendar || {};
  if (tokens.refresh_token) user.googleCalendar.refreshToken = tokens.refresh_token;
  if (tokens.access_token) user.googleCalendar.accessToken = tokens.access_token;
  if (tokens.expiry_date) user.googleCalendar.expiryDate = new Date(tokens.expiry_date);
  if (tokens.scope) user.googleCalendar.scope = tokens.scope;
  await user.save();
};

exports.listCalendars = async function listCalendars(user) {
  const client = createOAuth2Client();
  await setUserCredentials(client, user);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const res = await calendar.calendarList.list();
  const items = res.data.items || [];
  return items.map(c => ({ id: c.id, summary: c.summary, primary: !!c.primary }));
};

// Validate that tokens have required scopes
function validateCalendarScopes(tokens) {
  const requiredScopes = [
    'https://www.googleapis.com/auth/calendar',
    'https://www.googleapis.com/auth/calendar.events'
  ];

  if (!tokens.scope) {
    throw new Error('No scope information in tokens');
  }

  const userScopes = tokens.scope.split(' ');
  const missingScopes = requiredScopes.filter(scope => !userScopes.includes(scope));

  if (missingScopes.length > 0) {
    console.warn('Missing required scopes:', missingScopes);
    console.warn('User has scopes:', userScopes);
    throw new Error(`Insufficient scopes. Missing: ${missingScopes.join(', ')}`);
  }

  console.log('✅ All required scopes are present:', userScopes);
  return true;
}

exports.ensureJaaiyeCalendar = async function ensureJaaiyeCalendar(user, tokens = null) {
  const client = createOAuth2Client();

  if (tokens) {
    // Validate scopes before proceeding
    validateCalendarScopes(tokens);

    // Use provided tokens directly (for initial linking)
    console.log('Setting credentials with tokens:', {
      hasAccessToken: !!tokens.access_token,
      hasRefreshToken: !!tokens.refresh_token,
      scope: tokens.scope,
      expiryDate: tokens.expiry_date
    });

    client.setCredentials({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      scope: tokens.scope,
      expiry_date: tokens.expiry_date ? new Date(tokens.expiry_date).getTime() : undefined
    });
  } else {
    // Use saved user credentials (for existing users)
    await setUserCredentials(client, user);
  }

  const calendar = google.calendar({ version: 'v3', auth: client });

  if (user.googleCalendar && user.googleCalendar.jaaiyeCalendarId) {
    return user.googleCalendar.jaaiyeCalendarId;
  }

  // Try to find existing by summary
  const list = await calendar.calendarList.list();
  const existing = (list.data.items || []).find(i => i.summary === 'Jaaiye – Hangouts');
  if (existing) {
    user.googleCalendar.jaaiyeCalendarId = existing.id;
    await user.save();
    return existing.id;
  }

  // Create new calendar
  const created = await calendar.calendars.insert({ requestBody: { summary: 'Jaaiye – Hangouts' } });
  const calId = created.data.id;
  // Insert into calendar list (ensures it appears)
  await calendar.calendarList.insert({ requestBody: { id: calId } });
  user.googleCalendar.jaaiyeCalendarId = calId;
  await user.save();
  return calId;
};

exports.insertEvent = async function insertEvent(user, eventBody) {
  const client = createOAuth2Client();
  await setUserCredentials(client, user);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const calendarId = user.googleCalendar.jaaiyeCalendarId || await exports.ensureJaaiyeCalendar(user);
  const res = await calendar.events.insert({ calendarId, requestBody: eventBody });
  return res.data; // contains id, etag, etc.
};

exports.updateEvent = async function updateEvent(user, calendarId, eventId, eventBody) {
  const client = createOAuth2Client();
  await setUserCredentials(client, user);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const res = await calendar.events.patch({ calendarId, eventId, requestBody: eventBody });
  return res.data;
};

exports.deleteEvent = async function deleteEvent(user, calendarId, eventId) {
  const client = createOAuth2Client();
  await setUserCredentials(client, user);
  const calendar = google.calendar({ version: 'v3', auth: client });
  await calendar.events.delete({ calendarId, eventId });
  return true;
};

exports.freeBusy = async function freeBusy(user, timeMin, timeMax, calendarIds) {
  const client = createOAuth2Client();
  await setUserCredentials(client, user);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const items = (calendarIds && calendarIds.length ? calendarIds : (user.googleCalendar?.selectedCalendarIds || ['primary']))
    .map(id => ({ id }));
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin,
      timeMax,
      items
    }
  });
  return res.data.calendars || {};
};

exports.listEvents = async function listEvents(user, timeMin, timeMax, calendarIds) {
  const client = createOAuth2Client();
  await setUserCredentials(client, user);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const ids = (calendarIds && calendarIds.length ? calendarIds : (user.googleCalendar?.selectedCalendarIds || ['primary']));
  const results = [];
  for (const id of ids) {
    const res = await calendar.events.list({
      calendarId: id,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime'
    });
    const items = res.data.items || [];
    for (const ev of items) {
      results.push({
        calendarId: id,
        id: ev.id,
        summary: ev.summary,
        description: ev.description,
        location: ev.location,
        start: ev.start?.dateTime || ev.start?.date,
        end: ev.end?.dateTime || ev.end?.date
      });
    }
  }
  return results;
};

exports.backfillSelectedCalendars = async function backfillSelectedCalendars(user, timeMin, timeMax) {
  const client = createOAuth2Client();
  await setUserCredentials(client, user);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const ids = user.googleCalendar?.selectedCalendarIds || ['primary'];
  const perCal = [];
  for (const id of ids) {
    const res = await calendar.events.list({
      calendarId: id,
      timeMin,
      timeMax,
      singleEvents: true,
      orderBy: 'startTime'
    });
    perCal.push({ id, items: res.data.items || [] });
  }
  return perCal;
};

exports.incrementalSync = async function incrementalSync(user) {
  const client = createOAuth2Client();
  await setUserCredentials(client, user);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const updates = [];
  const selected = user.googleCalendar?.selectedCalendarIds || ['primary'];
  user.googleCalendar.calendars = user.googleCalendar.calendars || [];
  for (const id of selected) {
    let calState = user.googleCalendar.calendars.find(c => c.id === id);
    if (!calState) {
      calState = { id };
      user.googleCalendar.calendars.push(calState);
    }
    const params = { calendarId: id, singleEvents: true, orderBy: 'startTime' };
    if (calState.syncToken) params.syncToken = calState.syncToken;
    const res = await calendar.events.list(params).catch(async (err) => {
      if (err?.code === 410) {
        calState.syncToken = undefined; // reset
        return await calendar.events.list({ calendarId: id, singleEvents: true, orderBy: 'startTime' });
      }
      throw err;
    });
    calState.syncToken = res.data.nextSyncToken || calState.syncToken;
    if (Array.isArray(res.data.items)) {
      updates.push({ calendarId: id, items: res.data.items });
    }
  }
  await user.save();
  return updates;
};

exports.startWatch = async function startWatch(user, calendarId, channelId, webhookUrl) {
  const client = createOAuth2Client();
  await setUserCredentials(client, user);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const resource = await calendar.events.watch({
    calendarId,
    requestBody: {
      id: channelId, // UUID you generate
      type: 'web_hook',
      address: webhookUrl,
      token: process.env.GOOGLE_CHANNEL_TOKEN || undefined
    }
  });
  const calState = (user.googleCalendar.calendars || []).find(c => c.id === calendarId);
  if (calState) {
    calState.channelId = resource.data.id;
    calState.resourceId = resource.data.resourceId;
    calState.expiration = resource.data.expiration ? new Date(Number(resource.data.expiration)) : undefined;
    await user.save();
  }
  return resource.data;
};

exports.stopWatch = async function stopWatch(user, calendarId) {
  const client = createOAuth2Client();
  await setUserCredentials(client, user);
  const calendar = google.calendar({ version: 'v3', auth: client });
  const calState = (user.googleCalendar.calendars || []).find(c => c.id === calendarId);
  if (calState?.channelId && calState?.resourceId) {
    await calendar.channels.stop({ requestBody: { id: calState.channelId, resourceId: calState.resourceId } });
    calState.channelId = undefined;
    calState.resourceId = undefined;
    calState.expiration = undefined;
    await user.save();
    return true;
  }
  return false;
};