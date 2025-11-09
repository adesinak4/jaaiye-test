const Transaction = require('../models/Transaction');
const Ticket = require('../models/Ticket');
const Event = require('../models/Event');
const User = require('../models/User');
const Notification = require('../models/Notification');
const Group = require('../models/Group');

const SUCCESS_STATUSES = ['successful', 'completed'];

function toDate(value, fallback) {
  if (!value) {
    return fallback;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? fallback : parsed;
}

function normalizeRange(input = {}) {
  const now = new Date();
  const defaultFrom = new Date(now);
  defaultFrom.setDate(defaultFrom.getDate() - 30);
  const from = toDate(input.from, defaultFrom);
  const to = toDate(input.to, now);
  return { from, to };
}

function buildDateMatch(range, field = 'createdAt') {
  return {
    [field]: {
      $gte: range.from,
      $lte: range.to,
    },
  };
}

async function computeRevenueSummary(range) {
  const match = {
    ...buildDateMatch(range),
    status: { $in: SUCCESS_STATUSES },
  };
  const [summary] = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$amount' },
        transactionCount: { $sum: 1 },
        totalQuantity: { $sum: '$quantity' },
      },
    },
  ]);
  const totals = summary || {
    totalRevenue: 0,
    transactionCount: 0,
    totalQuantity: 0,
  };
  return totals;
}

async function computeTransactionRates(range) {
  const match = buildDateMatch(range);
  const counts = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);
  const total = counts.reduce((sum, item) => sum + item.count, 0);
  const success = counts
    .filter((item) => SUCCESS_STATUSES.includes(item._id))
    .reduce((sum, item) => sum + item.count, 0);
  return {
    totalTransactions: total,
    successfulTransactions: success,
    successRate: total === 0 ? 0 : success / total,
  };
}

async function computeProviderBreakdown(range) {
  const match = {
    ...buildDateMatch(range),
    status: { $in: SUCCESS_STATUSES },
  };
  const breakdown = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$provider',
        revenue: { $sum: '$amount' },
        transactions: { $sum: 1 },
      },
    },
    { $sort: { revenue: -1 } },
  ]);
  return breakdown.map((entry) => ({
    provider: entry._id,
    revenue: entry.revenue,
    transactions: entry.transactions,
  }));
}

async function computeRevenueTimeline(range) {
  const match = {
    ...buildDateMatch(range),
    status: { $in: SUCCESS_STATUSES },
  };
  const timeline = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
        },
        revenue: { $sum: '$amount' },
        transactions: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return timeline.map((point) => ({
    date: point._id,
    revenue: point.revenue,
    transactions: point.transactions,
  }));
}

async function getRevenueAnalytics(rangeInput) {
  const range = normalizeRange(rangeInput);
  const [summary, rates, providerBreakdown, timeline] = await Promise.all([
    computeRevenueSummary(range),
    computeTransactionRates(range),
    computeProviderBreakdown(range),
    computeRevenueTimeline(range),
  ]);
  const averageOrderValue =
    summary.transactionCount === 0
      ? 0
      : summary.totalRevenue / summary.transactionCount;
  return {
    range,
    totals: {
      totalRevenue: summary.totalRevenue,
      transactionCount: summary.transactionCount,
      totalQuantity: summary.totalQuantity,
      averageOrderValue,
    },
    transactionPerformance: rates,
    providerBreakdown,
    timeline,
  };
}

async function computeTicketStatus(range) {
  const match = buildDateMatch(range);
  const statuses = await Ticket.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        tickets: { $sum: '$quantity' },
        orders: { $sum: 1 },
        revenue: { $sum: { $multiply: ['$price', '$quantity'] } },
      },
    },
  ]);
  return statuses.map((entry) => ({
    status: entry._id,
    tickets: entry.tickets,
    orders: entry.orders,
    revenue: entry.revenue,
  }));
}

async function computeTicketAverages(range) {
  const match = buildDateMatch(range);
  const [result] = await Ticket.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        tickets: { $sum: '$quantity' },
        revenue: { $sum: { $multiply: ['$price', '$quantity'] } },
        orders: { $sum: 1 },
      },
    },
  ]);
  if (!result) {
    return { tickets: 0, revenue: 0, orders: 0, avgPrice: 0 };
  }
  const avgPrice = result.tickets === 0 ? 0 : result.revenue / result.tickets;
  return {
    tickets: result.tickets,
    revenue: result.revenue,
    orders: result.orders,
    avgPrice,
  };
}

async function computeTopTicketEvents(range, limit = 5) {
  const match = buildDateMatch(range);
  const aggregation = await Ticket.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$eventId',
        tickets: { $sum: '$quantity' },
        revenue: { $sum: { $multiply: ['$price', '$quantity'] } },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ]);
  const eventIds = aggregation.map((item) => item._id);
  const events = await Event.find({ _id: { $in: eventIds } })
    .select('title startTime venue')
    .lean();
  const eventMap = new Map(events.map((event) => [String(event._id), event]));
  return aggregation.map((item) => {
    const event = eventMap.get(String(item._id));
    return {
      eventId: item._id,
      title: event?.title || 'Unknown Event',
      startTime: event?.startTime || null,
      venue: event?.venue || null,
      tickets: item.tickets,
      revenue: item.revenue,
    };
  });
}

async function getTicketAnalytics(rangeInput) {
  const range = normalizeRange(rangeInput);
  const [statusBreakdown, averages, topEvents] = await Promise.all([
    computeTicketStatus(range),
    computeTicketAverages(range),
    computeTopTicketEvents(range),
  ]);
  return {
    range,
    summary: averages,
    statusBreakdown,
    topEvents,
  };
}

async function computeEventCounts(range) {
  const match = buildDateMatch(range, 'createdAt');
  const counts = await Event.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$status',
        count: { $sum: 1 },
      },
    },
  ]);
  return counts.map((entry) => ({
    status: entry._id,
    count: entry.count,
  }));
}

async function computeUpcomingEvents(range) {
  const now = new Date();
  const futureMatch = {
    startTime: { $gte: now },
    ...buildDateMatch(range, 'startTime'),
  };
  const count = await Event.countDocuments(futureMatch);
  return count;
}

async function computeEventCategoryMix(range) {
  const match = buildDateMatch(range, 'createdAt');
  const categories = await Event.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$category',
        count: { $sum: 1 },
      },
    },
    { $sort: { count: -1 } },
  ]);
  return categories.map((entry) => ({
    category: entry._id,
    count: entry.count,
  }));
}

async function computeRevenueByEvent(range, limit = 5) {
  const match = {
    ...buildDateMatch(range),
    status: { $in: SUCCESS_STATUSES },
  };
  const aggregation = await Transaction.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$eventId',
        revenue: { $sum: '$amount' },
        transactions: { $sum: 1 },
      },
    },
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ]);
  const events = await Event.find({ _id: { $in: aggregation.map((item) => item._id) } })
    .select('title startTime')
    .lean();
  const eventMap = new Map(events.map((event) => [String(event._id), event]));
  return aggregation.map((item) => {
    const event = eventMap.get(String(item._id));
    return {
      eventId: item._id,
      title: event?.title || 'Unknown Event',
      startTime: event?.startTime || null,
      revenue: item.revenue,
      transactions: item.transactions,
    };
  });
}

async function getEventAnalytics(rangeInput) {
  const range = normalizeRange(rangeInput);
  const [statusCounts, upcomingEvents, categoryMix, topEvents] = await Promise.all([
    computeEventCounts(range),
    computeUpcomingEvents(range),
    computeEventCategoryMix(range),
    computeRevenueByEvent(range),
  ]);
  return {
    range,
    statusCounts,
    upcomingEvents,
    categoryMix,
    topRevenueEvents: topEvents,
  };
}

async function computeUserGrowth(range) {
  const match = buildDateMatch(range, 'createdAt');
  const timeline = await User.aggregate([
    { $match: match },
    {
      $group: {
        _id: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
        },
        registrations: { $sum: 1 },
      },
    },
    { $sort: { _id: 1 } },
  ]);
  return timeline.map((point) => ({
    date: point._id,
    registrations: point.registrations,
  }));
}

async function computeUserTotals(range) {
  const match = buildDateMatch(range, 'createdAt');
  const totalUsers = await User.countDocuments(match);
  const verifiedUsers = await User.countDocuments({
    ...match,
    emailVerified: true,
  });
  const activeSince = new Date();
  activeSince.setDate(activeSince.getDate() - 30);
  const activeUsers = await User.countDocuments({
    lastLogin: { $gte: activeSince },
  });
  const providerLinks = await User.aggregate([
    { $match: match },
    {
      $group: {
        _id: null,
        google: {
          $sum: { $cond: ['$providerLinks.google', 1, 0] },
        },
        apple: {
          $sum: { $cond: ['$providerLinks.apple', 1, 0] },
        },
      },
    },
  ]);
  const providers = providerLinks[0] || { google: 0, apple: 0 };
  return {
    totalUsers,
    verifiedUsers,
    activeUsers,
    providerLinks: providers,
  };
}

async function getUserAnalytics(rangeInput) {
  const range = normalizeRange(rangeInput);
  const [totals, growthTimeline] = await Promise.all([
    computeUserTotals(range),
    computeUserGrowth(range),
  ]);
  return {
    range,
    totals,
    growthTimeline,
  };
}

async function computeGroupMetrics(range) {
  const match = buildDateMatch(range, 'createdAt');
  const totalGroups = await Group.countDocuments(match);
  const activeGroups = await Group.countDocuments({
    ...match,
    isActive: true,
  });
  const memberAggregates = await Group.aggregate([
    { $match: match },
    {
      $project: {
        memberCount: { $size: '$members' },
      },
    },
    {
      $group: {
        _id: null,
        totalMembers: { $sum: '$memberCount' },
        averageMembers: { $avg: '$memberCount' },
      },
    },
  ]);
  const summary = memberAggregates[0] || { totalMembers: 0, averageMembers: 0 };
  return {
    totalGroups,
    activeGroups,
    totalMembers: summary.totalMembers,
    averageMembers: summary.averageMembers,
  };
}

async function computeNotificationMetrics(range) {
  const match = buildDateMatch(range);
  const totals = await Notification.aggregate([
    { $match: match },
    {
      $group: {
        _id: '$read',
        count: { $sum: 1 },
      },
    },
  ]);
  const total = totals.reduce((sum, entry) => sum + entry.count, 0);
  const read = totals
    .filter((entry) => entry._id === true)
    .reduce((sum, entry) => sum + entry.count, 0);
  return {
    totalNotifications: total,
    readNotifications: read,
    readRate: total === 0 ? 0 : read / total,
  };
}

async function getEngagementAnalytics(rangeInput) {
  const range = normalizeRange(rangeInput);
  const [groupMetrics, notificationMetrics] = await Promise.all([
    computeGroupMetrics(range),
    computeNotificationMetrics(range),
  ]);
  return {
    range,
    groupMetrics,
    notificationMetrics,
  };
}

module.exports = {
  getRevenueAnalytics,
  getTicketAnalytics,
  getEventAnalytics,
  getUserAnalytics,
  getEngagementAnalytics,
};

