const express = require('express');
const User = require('../models/user');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/audit');

const router = express.Router();

const formatUser = (user) => ({
  id: user.id,
  username: user.username,
  email: user.email,
  role: user.role,
  employeeID: user.employeeID,
  administrator: user.administrator,
  active: user.active,
  lastLoginAt: user.lastLoginAt,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
  twoFactorEnabled: Boolean(user.twoFactorEnabled),
});

const ALLOWED_ROLES = ['admin', 'therapist', 'receptionist'];

const parseBoolean = (value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  return Boolean(value);
};

const normalizeUsername = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    return String(value).trim().toLowerCase();
  }
  return value.trim().toLowerCase();
};

const normalizeEmail = (value) => {
  if (value === undefined || value === null) {
    return '';
  }
  if (typeof value !== 'string') {
    return String(value).trim().toLowerCase();
  }
  return value.trim().toLowerCase();
};

router.get('/me', authenticate, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    return res.json({
      success: true,
      user: formatUser(user),
    });
  } catch (error) {
    return next(error);
  }
});

router.get(
  '/',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const users = await User.find({}).sort({ username: 1 });
      res.json({ success: true, users: users.map(formatUser) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/providers',
  authenticate,
  authorize('admin', 'receptionist', 'therapist'),
  async (req, res, next) => {
    try {
      const therapists = await User.find(
        { role: { $in: ['therapist', 'admin'] }, active: true },
        'username employeeID role administrator',
      ).sort({ username: 1 });

      res.json({
        success: true,
        therapists: therapists.map((user) => ({
          id: user.id,
          name: user.username,
          employeeID: typeof user.employeeID === 'number' ? user.employeeID : null,
          role: user.role,
        })),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.patch(
  '/:id',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const user = await User.findById(req.params.id);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      if (req.body.role !== undefined && !ALLOWED_ROLES.includes(req.body.role)) {
        return res.status(400).json({ success: false, message: 'Invalid role provided' });
      }

      if (req.body.username !== undefined) {
        const normalizedUsername = normalizeUsername(req.body.username);
        if (!normalizedUsername) {
          return res.status(400).json({ success: false, message: 'Username cannot be empty' });
        }
        const existingUsername = await User.findOne({
          username: normalizedUsername,
          _id: { $ne: user._id },
        }).lean();
        if (existingUsername) {
          return res.status(409).json({ success: false, message: 'Username already in use' });
        }
        user.username = normalizedUsername;
      }

      if (req.body.email !== undefined) {
        const normalizedEmail = normalizeEmail(req.body.email);
        if (!normalizedEmail) {
          user.email = undefined;
        } else {
          const existingEmail = await User.findOne({
            email: normalizedEmail,
            _id: { $ne: user._id },
          }).lean();
          if (existingEmail) {
            return res.status(409).json({ success: false, message: 'Email already in use' });
          }
          user.email = normalizedEmail;
        }
      }

      if (req.body.employeeID !== undefined) {
        if (req.body.employeeID === null || req.body.employeeID === '') {
          user.employeeID = undefined;
        } else {
          const numericEmployeeId = Number(req.body.employeeID);
          if (Number.isNaN(numericEmployeeId)) {
            return res.status(400).json({ success: false, message: 'employeeID must be numeric' });
          }
          user.employeeID = numericEmployeeId;
        }
      }

      if (req.body.active !== undefined) {
        user.active = parseBoolean(req.body.active);
      }

      if (req.body.role !== undefined) {
        user.role = req.body.role;
      }

      if (req.body.administrator !== undefined) {
        const administratorFlag = parseBoolean(req.body.administrator);
        if (administratorFlag) {
          user.role = 'admin';
        } else if (req.body.role === undefined && user.role === 'admin') {
          user.role = 'therapist';
        }
        user.administrator = administratorFlag;
      }

      user.administrator = user.role === 'admin';

      await user.save();

      await recordAuditEvent({
        event: 'user.update',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        userId: user.id,
        userRole: user.role,
      });

      res.json({ success: true, user: formatUser(user) });
    } catch (error) {
      next(error);
    }
  },
);

router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      if (req.user.id === req.params.id) {
        return res.status(400).json({
          success: false,
          message: 'You cannot delete your own account.',
        });
      }

      const user = await User.findByIdAndDelete(req.params.id);

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      await recordAuditEvent({
        event: 'user.delete',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        userId: user.id,
        userRole: user.role,
      });

      return res.json({ success: true });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
