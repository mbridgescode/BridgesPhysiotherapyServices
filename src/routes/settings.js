const express = require('express');
const ClinicSettings = require('../models/clinicSettings');
const TherapistAvailability = require('../models/therapistAvailability');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/audit');
const { sendTransactionalEmail } = require('../services/emailService');
const { getLatestClinicSettings } = require('../services/clinicSettingsService');
const { EMAIL_TEMPLATE_DEFINITIONS, EMAIL_TEMPLATE_BUILDERS } = require('../templates/email/templateCatalogue');

const router = express.Router();

const DEFAULT_BRANDING = {
  clinic_name: 'Bridges Physiotherapy Services',
  phone: '07455 285117',
  email: 'hello@bridgesphysiotherapy.co.uk',
  website: 'https://www.bridgesphysiotherapy.co.uk',
  address: 'Community practice, Gloucestershire',
  privacy_policy_url: process.env.PRIVACY_POLICY_URL || 'https://www.bridgesphysiotherapy.co.uk/privacy-policy',
  cancellation_policy_url: process.env.CANCELLATION_POLICY_URL || 'https://www.bridgesphysiotherapy.co.uk/cancellation-charges',
};

const DEFAULT_PAYMENT_INSTRUCTIONS = {
  text: [
    'Please make payment via bank transfer to:',
    'Bridges Physiotherapy Services',
    'Account: 80856460',
    'Sort code: 30-92-16',
    'Reference: invoice number',
  ].join('\n'),
};

const withClinicDefaults = (settings = {}) => {
  const branding = {
    ...DEFAULT_BRANDING,
    ...(settings?.branding || {}),
  };
  const paymentInstructions = settings?.payment_instructions || DEFAULT_PAYMENT_INSTRUCTIONS;
  return {
    ...settings,
    branding,
    payment_instructions: paymentInstructions,
  };
};

const normalizeEmailAddress = (value) => {
  if (!value) {
    return null;
  }
  const trimmed = String(value).trim();
  if (!trimmed) {
    return null;
  }
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(trimmed) ? trimmed.toLowerCase() : null;
};

router.get(
  '/test-emails',
  authenticate,
  authorize('admin'),
  async (req, res) => {
    res.json({
      success: true,
      types: EMAIL_TEMPLATE_DEFINITIONS.map(({ id, label, description }) => ({
        id,
        label,
        description,
      })),
    });
  },
);

router.post(
  '/test-emails',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const { type, recipient } = req.body || {};
      const normalizedType = String(type || '').trim();
      const builder = EMAIL_TEMPLATE_BUILDERS[normalizedType];
      if (!builder) {
        return res.status(400).json({ success: false, message: 'Unknown email type.' });
      }
      const normalizedRecipient = normalizeEmailAddress(recipient);
      if (!normalizedRecipient) {
        return res.status(400).json({ success: false, message: 'A valid recipient email is required.' });
      }

      const rawSettings = await getLatestClinicSettings();
      const clinicSettings = withClinicDefaults(rawSettings);
      const payload = builder({ clinicSettings });

      const emailResult = await sendTransactionalEmail({
        to: normalizedRecipient,
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
        attachments: payload.attachments,
        metadata: {
          ...(payload.metadata || {}),
          template: normalizedType,
          is_test_email: true,
          requested_by: req.user.id,
        },
      });

      const success = emailResult.status !== 'failed';

      await recordAuditEvent({
        event: 'settings.test_email.send',
        success,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: {
          template: normalizedType,
          recipient: normalizedRecipient,
          status: emailResult.status,
          provider: emailResult.provider || 'not_configured',
        },
      });

      if (!success) {
        return res.status(502).json({
          success: false,
          message: emailResult.errorMessage || 'Unable to send test email',
          result: emailResult,
        });
      }

      return res.json({
        success: true,
        result: {
          status: emailResult.status,
          provider: emailResult.provider,
          simulated: emailResult.simulated,
        },
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/email-templates/preview',
  authenticate,
      authorize('admin', 'therapist', 'receptionist'),
  async (req, res, next) => {
    try {
      const rawSettings = await getLatestClinicSettings();
      const clinicSettings = withClinicDefaults(rawSettings);

      const templates = EMAIL_TEMPLATE_DEFINITIONS.map((definition) => {
        const payload = definition.build({ clinicSettings });
        return {
          id: definition.id,
          label: definition.label,
          description: definition.description,
          subject: payload.subject,
          html: payload.html,
          text: payload.text,
          metadata: payload.metadata || {},
        };
      });

      res.json({
        success: true,
        templates,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/clinic',
  authenticate,
  authorize('admin', 'therapist', 'receptionist'),
  async (req, res, next) => {
    try {
      const settings = await ClinicSettings.findOne().sort({ updatedAt: -1 });
      res.json({ success: true, settings });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/clinic',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const update = {
        ...req.body,
        updatedBy: req.user.id,
      };

      const settings = await ClinicSettings.findOneAndUpdate(
        {},
        { $set: update },
        { upsert: true, new: true },
      );

      await recordAuditEvent({
        event: 'settings.clinic.update',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
      });

      res.json({ success: true, settings });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/availability',
  authenticate,
  authorize('admin', 'therapist'),
  async (req, res, next) => {
    try {
      const { therapist_id: therapistId } = req.query;
      const query = {};
      if (therapistId) {
        query.therapist_employee_id = Number(therapistId);
      }

      const availability = await TherapistAvailability.find(query)
        .populate('therapist', 'name username email role employeeID')
        .sort({ effective_from: -1 });

      res.json({ success: true, availability });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/availability',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const availability = await TherapistAvailability.create({
        ...req.body,
      });

      await recordAuditEvent({
        event: 'settings.availability.create',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { therapist_employee_id: availability.therapist_employee_id.toString() },
      });

      res.status(201).json({ success: true, availability });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/availability/:id',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const availability = await TherapistAvailability.findByIdAndUpdate(
        req.params.id,
        { $set: req.body },
        { new: true },
      );

      if (!availability) {
        return res.status(404).json({ success: false, message: 'Record not found' });
      }

      await recordAuditEvent({
        event: 'settings.availability.update',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { availability_id: availability.id },
      });

      res.json({ success: true, availability });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
