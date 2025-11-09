const express = require('express');
const AuditLog = require('../models/auditLog');
const { authenticate, authorize } = require('../middleware/auth');

const router = express.Router();

router.get(
  '/',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const { limit = 100 } = req.query;

      const logs = await AuditLog.find({})
        .sort({ createdAt: -1 })
        .limit(Number(limit));

      res.json({ success: true, logs });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
