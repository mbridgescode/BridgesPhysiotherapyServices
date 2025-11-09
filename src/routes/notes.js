const express = require('express');
const Note = require('../models/notes');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/audit');

const router = express.Router();

router.post(
  '/',
  authenticate,
  authorize('admin', 'therapist'),
  async (req, res, next) => {
    try {
      const {
        patient_id: patientId,
        appointment_id: appointmentId,
        note,
        date,
        employeeID,
        type,
        visibility,
      } = req.body;

      if (!patientId || !note) {
        return res.status(400).json({
          success: false,
          message: 'patient_id and note are required',
        });
      }

      const payload = {
        patient_id: patientId,
        appointment_id: appointmentId,
        note,
        employeeID,
        type,
        visibility,
        date: date ? new Date(date) : new Date(),
        author: req.user.id,
        createdBy: req.user.id,
        updatedBy: req.user.id,
      };

      const createdNote = await Note.create(payload);

      await recordAuditEvent({
        event: 'note.create',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { patient_id: patientId.toString() },
      });

      return res.status(201).json({
        success: true,
        note: createdNote,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/:patientId',
  authenticate,
  authorize('admin', 'therapist'),
  async (req, res, next) => {
    try {
      const { patientId } = req.params;
      const normalizedPatientId = Number(patientId);
      const filter = Number.isNaN(normalizedPatientId)
        ? { patient_id: patientId }
        : { patient_id: normalizedPatientId };

      const notes = await Note.find(filter)
        .sort({ date: -1 })
        .populate('author', 'username role employeeID');

      return res.json({
        success: true,
        notes,
      });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
