const express = require('express');
const { Types } = require('mongoose');
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

router.put(
  '/:noteId',
  authenticate,
  authorize('admin', 'therapist'),
  async (req, res, next) => {
    try {
      const { noteId } = req.params;
      if (!Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({ success: false, message: 'Invalid note id' });
      }

      const existingNote = await Note.findById(noteId);
      if (!existingNote) {
        return res.status(404).json({ success: false, message: 'Note not found' });
      }

      const patient = await Patient.findOne({ patient_id: existingNote.patient_id });
      if (!patient) {
        return res.status(404).json({ success: false, message: 'Patient not found' });
      }

      if (!userCanAccessPatient(patient.toObject ? patient.toObject() : patient, req.user)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      const allowedFields = [
        'note',
        'visibility',
        'type',
        'date',
        'attachments',
        'appointment_id',
        'employeeID',
      ];
      const updates = {};

      allowedFields.forEach((field) => {
        if (req.body[field] !== undefined) {
          updates[field] = req.body[field];
        }
      });

      if ('note' in req.body) {
        const trimmedNote = typeof req.body.note === 'string' ? req.body.note.trim() : req.body.note;
        if (!trimmedNote) {
          return res.status(400).json({ success: false, message: 'Note cannot be empty' });
        }
        updates.note = trimmedNote;
      }

      if ('date' in updates && updates.date) {
        updates.date = new Date(updates.date);
      }

      if (Object.keys(updates).length === 0) {
        return res.status(400).json({ success: false, message: 'No updates provided' });
      }

      updates.updatedBy = req.user.id;

      const updatedNote = await Note.findByIdAndUpdate(
        noteId,
        { $set: updates },
        { new: true },
      );

      await recordAuditEvent({
        event: 'note.update',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: {
          patient_id: existingNote.patient_id?.toString(),
          note_id: noteId.toString(),
        },
      });

      return res.json({
        success: true,
        note: updatedNote,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  '/:noteId',
  authenticate,
  authorize('admin', 'therapist'),
  async (req, res, next) => {
    try {
      const { noteId } = req.params;
      if (!Types.ObjectId.isValid(noteId)) {
        return res.status(400).json({ success: false, message: 'Invalid note id' });
      }

      const existingNote = await Note.findById(noteId);
      if (!existingNote) {
        return res.status(404).json({ success: false, message: 'Note not found' });
      }

      const patient = await Patient.findOne({ patient_id: existingNote.patient_id });
      if (!patient) {
        return res.status(404).json({ success: false, message: 'Patient not found' });
      }

      if (!userCanAccessPatient(patient.toObject ? patient.toObject() : patient, req.user)) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }

      await existingNote.deleteOne();

      await recordAuditEvent({
        event: 'note.delete',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: {
          patient_id: existingNote.patient_id?.toString(),
          note_id: noteId.toString(),
        },
      });

      return res.json({
        success: true,
        message: 'Note deleted',
      });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
