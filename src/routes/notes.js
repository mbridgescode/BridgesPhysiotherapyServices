const express = require('express');
const Note = require('../models/notes');
const Patient = require('../models/patients');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/audit');
const { userCanAccessPatient } = require('../utils/accessControl');

const router = express.Router();

const buildPatientFilter = (patientId) => {
  const normalizedPatientId = Number(patientId);
  return Number.isNaN(normalizedPatientId)
    ? { patient_id: patientId }
    : { patient_id: normalizedPatientId };
};

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

      const patient = await Patient.findOne(buildPatientFilter(patientId));
      if (!patient) {
        return res.status(404).json({ success: false, message: 'Patient not found' });
      }

      if (!userCanAccessPatient(patient.toObject ? patient.toObject() : patient, req.user)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const payload = {
        patient_id: patient.patient_id,
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
      const filter = buildPatientFilter(patientId);

      const patient = await Patient.findOne(filter);
      if (!patient) {
        return res.status(404).json({ success: false, message: 'Patient not found' });
      }

      if (!userCanAccessPatient(patient.toObject ? patient.toObject() : patient, req.user)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

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
