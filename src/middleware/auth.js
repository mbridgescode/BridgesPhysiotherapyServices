const jwt = require('jsonwebtoken');
const { accessTokenSecret } = require('../config/env');

const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ success: false, message: 'Authorization header missing' });
  }

  const token = authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ success: false, message: 'Bearer token missing' });
  }

  try {
    const decoded = jwt.verify(token, accessTokenSecret);
    const numericEmployeeId = Number(decoded.employeeID);
    req.user = {
      id: decoded.userId,
      role: decoded.role,
      employeeID: Number.isNaN(numericEmployeeId) ? null : numericEmployeeId,
    };
    return next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
};

module.exports = {
  authenticate,
  authorize: (...roles) => (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    if (roles.length > 0 && !roles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Forbidden' });
    }

    return next();
  },
};
