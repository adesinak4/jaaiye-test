const ApiKey = require('../models/ApiKey');

// Validate mobile API key
exports.validateMobileApiKey = async (req, res, next) => {
  const apiKey = req.headers['x-api-key'];

  if (!apiKey) {
    return res.status(401).json({
      success: false,
      error: 'API key is required'
    });
  }

  try {
    const validKey = await ApiKey.findOne({
      key: apiKey,
      isActive: true,
      expiresAt: { $gt: new Date() }
    });

    if (!validKey) {
      return res.status(401).json({
        success: false,
        error: 'Invalid or expired API key'
      });
    }

    // Update last used timestamp
    validKey.lastUsed = new Date();
    await validKey.save();

    req.apiKey = validKey;
    next();
  } catch(error) {
    res.status(500).json({
      success: false,
      error: 'Error validating API key'
    });
  }
};