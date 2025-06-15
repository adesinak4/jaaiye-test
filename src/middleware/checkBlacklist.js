const TokenBlacklist = require('../models/TokenBlacklist');

const isBlacklisted = async (token) => {
    return await TokenBlacklist.exists({ token });
};

module.exports = async (req, res, next) => {
    if (await isBlacklisted(req.token)) {
        return res.status(401).json({ error: 'Token revoked' });
    }
    next();
};