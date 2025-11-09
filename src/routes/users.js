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

      const allowedFields = ['role', 'administrator', 'active', 'email'];
      allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          user[field] = req.body[field];
        }
      });

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
