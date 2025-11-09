const express = require('express');
const ClinicSettings = require('../models/clinicSettings');
const TherapistAvailability = require('../models/therapistAvailability');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/audit');

const router = express.Router();

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
        .populate('therapist', 'username email role employeeID')
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
