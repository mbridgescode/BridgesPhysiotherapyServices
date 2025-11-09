const express = require('express');
const DataSubjectRequest = require('../models/dataSubjectRequest');
const Counter = require('../models/counter');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/audit');

const router = express.Router();

const normalizePatientId = (value) => {
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
};

const calculateDueDate = (override) => {
  if (override) {
    const parsed = new Date(override);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  const now = new Date();
  return new Date(now.getTime() + (30 * 24 * 60 * 60 * 1000)); // 30 days
};

router.get(
  '/',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const { status } = req.query;
      const query = {};
      if (status) {
        query.status = status;
      }

      const requests = await DataSubjectRequest.find(query)
        .sort({ dueAt: 1 })
        .lean({ getters: true, virtuals: true });

      res.json({
        success: true,
        requests,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/',
  authenticate,
  authorize('admin', 'receptionist'),
  async (req, res, next) => {
    try {
      const {
        patient_id: patientIdValue,
        type,
        requesterName,
        requesterEmail,
        notes,
        dueAt,
      } = req.body;

      const patientId = normalizePatientId(patientIdValue);
      if (!patientId) {
        return res.status(400).json({ success: false, message: 'patient_id must be numeric' });
      }

      if (!type || !requesterName) {
        return res.status(400).json({ success: false, message: 'type and requesterName are required' });
      }

      const nextRequestId = await Counter.next('data_request_id', 1);

      const payload = await DataSubjectRequest.create({
        request_id: nextRequestId,
        patient_id: patientId,
        type,
        requesterName,
        requesterEmail,
        notes,
        dueAt: calculateDueDate(dueAt),
        handledBy: req.user.id,
        history: notes
          ? [{
            action: 'note',
            note: notes,
            actor: req.user.id,
          }]
          : [],
      });

      await recordAuditEvent({
        event: 'patient.data_request.create',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { patient_id: patientId.toString(), request_id: nextRequestId.toString(), type },
      });

      res.status(201).json({
        success: true,
        request: payload.toObject({ getters: true, virtuals: true }),
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
      const requestId = normalizePatientId(req.params.id);

      if (!requestId) {
        return res.status(400).json({ success: false, message: 'Invalid request id' });
      }

      const request = await DataSubjectRequest.findOne({ request_id: requestId });

      if (!request) {
        return res.status(404).json({ success: false, message: 'Request not found' });
      }

      const { status, notes, completedAt } = req.body;

      if (status) {
        request.status = status;
        if (status === 'fulfilled' && !request.completedAt) {
          request.completedAt = new Date();
        }
      }

      if (completedAt) {
        const parsed = new Date(completedAt);
        if (!Number.isNaN(parsed.getTime())) {
          request.completedAt = parsed;
        }
      }

      if (notes) {
        request.history.push({
          action: 'note',
          note: notes,
          actor: req.user.id,
        });
        request.notes = notes;
      }

      request.handledBy = req.user.id;
      await request.save();

      await recordAuditEvent({
        event: 'patient.data_request.update',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: {
          request_id: requestId.toString(),
          status: request.status,
        },
      });

      res.json({
        success: true,
        request: request.toObject({ getters: true, virtuals: true }),
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
