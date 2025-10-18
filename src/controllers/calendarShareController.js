const CalendarShare = require('../models/CalendarShare');
const Calendar = require('../models/Calendar');
const User = require('../models/User');
const { sendNotification } = require('../services/notificationService');
const { sendEmail } = require('../services/emailService');
const { NotFoundError, BadRequestError, ForbiddenError } = require('../utils/errors');

// Share calendar with another user
exports.shareCalendar = async (req, res, next) => {
  const { calendarId } = req.params;
  const { userId, permission } = req.body;
  const ownerId = req.user._id;

  // Check if calendar exists and user owns it
  const calendar = await Calendar.findOne({ _id: calendarId, owner: ownerId });
  if (!calendar) {
    throw new NotFoundError('Calendar not found');
  }

  // Check if user exists
  const user = await User.findById(userId);
  if (!user) {
    throw new NotFoundError('User not found');
  }

  // Check if already shared
  const existingShare = await CalendarShare.findOne({
    calendar: calendarId,
    sharedWith: userId
  });

  if (existingShare) {
    throw new BadRequestError('Calendar already shared with this user');
  }

  // Create share
  const share = await CalendarShare.create({
    calendar: calendarId,
    sharedWith: userId,
    permission
  });

  // Send notification
  await sendNotification(userId, {
    title: 'Calendar Share Request',
    body: `${req.user.name} wants to share their calendar with you`
  }, {
    type: 'calendar_share',
    calendarId,
    shareId: share._id.toString()
  });

  // Send email
  await sendEmail({
    to: user.email,
    subject: 'Calendar Share Request',
    html: `
      <h2>Calendar Share Request</h2>
      <p>${req.user.name} wants to share their calendar "${calendar.name}" with you.</p>
      <p>Permission level: ${permission}</p>
      <p>Please log in to accept or decline this request.</p>
    `
  });

  res.status(201).json(share);
};

// Accept calendar share
exports.acceptShare = async (req, res, next) => {
  const { shareId } = req.params;
  const userId = req.user._id;

  const share = await CalendarShare.findOne({
    _id: shareId,
    sharedWith: userId,
    status: 'pending'
  });

  if (!share) {
    throw new NotFoundError('Share request not found');
  }

  share.status = 'accepted';
  await share.save();

  // Notify owner
  const calendar = await Calendar.findById(share.calendar);
  const owner = await User.findById(calendar.owner);

  await sendNotification(owner._id, {
    title: 'Calendar Share Accepted',
    body: `${req.user.name} accepted your calendar share request`
  }, {
    type: 'calendar_share_accepted',
    calendarId: calendar._id.toString()
  });

  res.json(share);
};

// Decline calendar share
exports.declineShare = async (req, res, next) => {
  const { shareId } = req.params;
  const userId = req.user._id;

  const share = await CalendarShare.findOne({
    _id: shareId,
    sharedWith: userId,
    status: 'pending'
  });

  if (!share) {
    throw new NotFoundError('Share request not found');
  }

  share.status = 'declined';
  await share.save();

  // Notify owner
  const calendar = await Calendar.findById(share.calendar);
  const owner = await User.findById(calendar.owner);

  await sendNotification(owner._id, {
    title: 'Calendar Share Declined',
    body: `${req.user.name} declined your calendar share request`
  }, {
    type: 'calendar_share_declined',
    calendarId: calendar._id.toString()
  });

  res.json(share);
};

// Get shared calendars
exports.getSharedCalendars = async (req, res, next) => {
  const userId = req.user._id;

  const shares = await CalendarShare.find({
    sharedWith: userId,
    status: 'accepted'
  }).populate('calendar');

  res.json(shares);
};

// Get pending share requests
exports.getPendingShares = async (req, res, next) => {
  const userId = req.user._id;

  const shares = await CalendarShare.find({
    sharedWith: userId,
    status: 'pending'
  }).populate('calendar');

  res.json(shares);
};

// Update share permission
exports.updateSharePermission = async (req, res, next) => {
  const { shareId } = req.params;
  const { permission } = req.body;
  const userId = req.user._id;

  const share = await CalendarShare.findOne({
    _id: shareId,
    calendar: { $in: await Calendar.find({ owner: userId }).select('_id') }
  });

  if (!share) {
    throw new NotFoundError('Share not found');
  }

  share.permission = permission;
  await share.save();

  res.json(share);
};

// Remove calendar share
exports.removeShare = async (req, res, next) => {
  const { shareId } = req.params;
  const userId = req.user._id;

  const share = await CalendarShare.findOne({
    _id: shareId,
    $or: [
      { calendar: { $in: await Calendar.find({ owner: userId }).select('_id') } },
      { sharedWith: userId }
    ]
  });

  if (!share) {
    throw new NotFoundError('Share not found');
  }

  await share.remove();

  res.json({ message: 'Share removed successfully' });
};