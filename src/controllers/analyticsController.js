const {
  getRevenueAnalytics,
  getTicketAnalytics,
  getEventAnalytics,
  getUserAnalytics,
  getEngagementAnalytics,
} = require('../services/analyticsService');
const { asyncHandler } = require('../utils/asyncHandler');
const { successResponse } = require('../utils/response');

function extractRange(query) {
  return {
    from: query.from,
    to: query.to,
  };
}

exports.revenue = asyncHandler(async (req, res) => {
  const range = extractRange(req.query);
  const analytics = await getRevenueAnalytics(range);
  return successResponse(res, { analytics });
});

exports.tickets = asyncHandler(async (req, res) => {
  const range = extractRange(req.query);
  const analytics = await getTicketAnalytics(range);
  return successResponse(res, { analytics });
});

exports.events = asyncHandler(async (req, res) => {
  const range = extractRange(req.query);
  const analytics = await getEventAnalytics(range);
  return successResponse(res, { analytics });
});

exports.users = asyncHandler(async (req, res) => {
  const range = extractRange(req.query);
  const analytics = await getUserAnalytics(range);
  return successResponse(res, { analytics });
});

exports.engagement = asyncHandler(async (req, res) => {
  const range = extractRange(req.query);
  const analytics = await getEngagementAnalytics(range);
  return successResponse(res, { analytics });
});

