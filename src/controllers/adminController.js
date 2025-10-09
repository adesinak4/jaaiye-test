const User = require('../models/User');
const { successResponse } = require('../utils/response');
const { asyncHandler } = require('../utils/asyncHandler');

// GET /api/v1/admin/health
exports.health = asyncHandler(async (req, res) => {
  return successResponse(res, { status: 'ok', timestamp: new Date().toISOString() });
});

// GET /api/v1/admin/users
exports.listUsers = asyncHandler(async (req, res) => {
  const { limit = 50, page = 1, role } = req.query;
  const query = {};
  if (role) query.role = role;

  const users = await User.find(query)
    .select('email username fullName role emailVerified isActive createdAt')
    .limit(Number(limit))
    .skip((Number(page) - 1) * Number(limit))
    .sort({ createdAt: -1 });

  return successResponse(res, { users });
});

// PATCH /api/v1/admin/users/:id/role
exports.updateUserRole = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { role } = req.body;

  if (!['superadmin', 'admin', 'user'].includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role' });
  }

  const user = await User.findByIdAndUpdate(
    id,
    { role },
    { new: true, runValidators: true }
  ).select('email username fullName role emailVerified isActive createdAt');

  if (!user) {
    return res.status(404).json({ success: false, error: 'User not found' });
  }

  return successResponse(res, { user });
});


