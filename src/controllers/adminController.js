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

// ✅ POST /api/v1/admin/users (Create user)
exports.createUser = asyncHandler(async (req, res) => {
  const { email, fullName, username, password, role = 'admin', isActive = true } = req.body;

  if (!email || !fullName || !password) {
    return res.status(400).json({ success: false, error: 'Email, fullName and password are required' });
  }

  const validRoles = ['superadmin', 'admin', 'scanner'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({ success: false, error: 'Invalid role' });
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    return res.status(400).json({ success: false, error: 'Email already in use' });
  }
  const user = await User.create({
    email,
    username: username || email.split('@')[0],
    fullName,
    password,
    role,
    isActive,
    emailVerified: true
  });

  return successResponse(res, {
    message: 'User created successfully',
    user: {
      id: user._id,
      email: user.email,
      fullName: user.fullName,
      username: user.username,
      role: user.role,
      isActive: user.isActive,
      emailVerified: user.emailVerified,
      createdAt: user.createdAt
    }
  });
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


