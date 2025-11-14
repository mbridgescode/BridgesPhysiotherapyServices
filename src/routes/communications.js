const express = require('express');
const Communication = require('../models/communications');
const Patient = require('../models/patients');
const { authenticate, authorize } = require('../middleware/auth');
const { buildPatientScopeQuery } = require('../utils/accessControl');
const { toPlainObject } = require('../utils/mongoose');

const router = express.Router();

const COMMUNICATION_ROLES = ['admin', 'therapist', 'receptionist'];

const sanitizeRegexInput = (value = '') => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const parseLimit = (value) => {
  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric <= 0) {
    return 50;
  }
  return Math.min(Math.max(numeric, 1), 200);
};

const parseOffset = (value) => {
  const numeric = Number(value);
  if (Number.isNaN(numeric) || numeric < 0) {
    return 0;
  }
  return numeric;
};

router.get(
  '/',
  authenticate,
  authorize(...COMMUNICATION_ROLES),
  async (req, res, next) => {
    try {
      const {
        type,
        status,
        search,
        from,
        to,
        limit = 50,
        offset = 0,
      } = req.query;

      const parsedLimit = parseLimit(limit);
      const parsedOffset = parseOffset(offset);

      const query = {};

      if (type) {
        query.type = type;
      }

      if (status) {
        query.delivery_status = status;
      }

      let patientIdFilter = null;
      if (search && typeof search === 'string') {
        const trimmedSearch = search.trim();
        if (trimmedSearch) {
          const numericSearch = Number(trimmedSearch);
          if (!Number.isNaN(numericSearch)) {
            patientIdFilter = numericSearch;
          } else {
            const regex = new RegExp(sanitizeRegexInput(trimmedSearch), 'i');
            query.$or = [
              { subject: regex },
              { content: regex },
              { 'metadata.reference': regex },
            ];
          }
        }
      }

      if (from || to) {
        query.date = {};
        if (from) {
          const fromDate = new Date(from);
          if (!Number.isNaN(fromDate.getTime())) {
            query.date.$gte = fromDate;
          }
        }
        if (to) {
          const toDate = new Date(to);
          if (!Number.isNaN(toDate.getTime())) {
            query.date.$lte = toDate;
          }
        }
        if (Object.keys(query.date).length === 0) {
          delete query.date;
        }
      }

      const scopeQuery = buildPatientScopeQuery(req.user);
      if (scopeQuery) {
        const scopedPatients = await Patient.find(scopeQuery).select('patient_id');
        const patientIds = scopedPatients.map((patient) => patient.patient_id).filter((id) => id !== undefined && id !== null);
        if (!patientIds.length) {
          return res.json({ success: true, communications: [], total: 0 });
        }
        if (patientIdFilter !== null) {
          if (!patientIds.includes(Number(patientIdFilter))) {
            return res.json({ success: true, communications: [], total: 0 });
          }
          query.patient_id = Number(patientIdFilter);
        } else {
          query.patient_id = { $in: patientIds };
        }
      } else if (patientIdFilter !== null) {
        query.patient_id = Number(patientIdFilter);
      }

      const [communications, total] = await Promise.all([
        Communication.find(query)
          .sort({ date: -1 })
          .skip(parsedOffset)
          .limit(parsedLimit)
          .populate('patient', 'patient_id first_name surname preferred_name')
          .populate('user', 'name username email role'),
        Communication.countDocuments(query),
      ]);

      res.json({
        success: true,
        communications: toPlainObject(communications),
        total,
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
