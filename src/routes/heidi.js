const express = require('express');
const User = require('../models/user');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/audit');
const { getHeidiJwt } = require('../services/heidiService');
const {
  heidiApiKey,
  heidiRegion,
  heidiWidgetUrl,
  heidiProductName,
} = require('../config/env');

const router = express.Router();

const getErrorStatus = (error) => {
  if (error?.code === 'HEIDI_TIMEOUT') {
    return 504;
  }
  if (error?.status === 429) {
    return 429;
  }
  return 502;
};

router.get(
  '/token',
  authenticate,
  authorize('admin', 'therapist'),
  async (req, res, next) => {
    if (!heidiApiKey) {
      return res.status(503).json({
        success: false,
        code: 'HEIDI_NOT_CONFIGURED',
        message: 'Heidi is not configured. Add HEIDI_API_KEY to the server environment.',
      });
    }

    try {
      const user = await User.findById(req.user.id).select('email username');
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      const email = (user.email || '').trim().toLowerCase();
      if (!email) {
        return res.status(400).json({
          success: false,
          message: 'Add an email address to your user profile before connecting Heidi.',
        });
      }

      const jwt = await getHeidiJwt({
        email,
        thirdPartyInternalId: String(user.id),
      });

      await recordAuditEvent({
        event: 'heidi.token.issue',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { region: heidiRegion },
      });

      return res.json({
        success: true,
        token: jwt.token,
        expirationTime: jwt.expirationTime,
        region: heidiRegion,
        widgetUrl: heidiWidgetUrl,
        productName: heidiProductName,
      });
    } catch (error) {
      console.error('Failed to obtain Heidi authentication token', {
        code: error.code,
        status: error.status,
      });

      await recordAuditEvent({
        event: 'heidi.token.issue',
        success: false,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { region: heidiRegion, reason: error.code || 'provider_error' },
      });

      return res.status(getErrorStatus(error)).json({
        success: false,
        message: 'Heidi could not authenticate this account. Check the Heidi API key, region, and account access.',
      });
    }
  },
);

module.exports = router;
