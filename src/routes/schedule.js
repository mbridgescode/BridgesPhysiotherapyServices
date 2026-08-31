const express = require('express');
const Appointment = require('../models/appointments');
const { authenticate, authorize } = require('../middleware/auth');
const { fetchPaymentStatuses } = require('../utils/payments');
const { toPlainObject } = require('../utils/mongoose');

const router = express.Router();

const CANCELLED_STATUSES = [
  'cancelled',
  'cancelled_same_day',
  'cancelled_by_patient',
  'cancelled_by_therapist',
];

const CALENDAR_FIELDS = [
  'appointment_id',
  'patient_id',
  'employeeID',
  'therapist',
  'date',
  'duration_minutes',
  'location',
  'room',
  'first_name',
  'surname',
  'contact',
  'treatment_description',
  'treatment_notes',
  'status',
  'completed',
].join(' ');

const TABLE_FIELDS = [
  'appointment_id',
  'series_id',
  'patient_id',
  'patient',
  'employeeID',
  'therapist',
  'date',
  'duration_minutes',
  'location',
  'room',
  'first_name',
  'surname',
  'contact',
  'completed',
  'status',
  'completion_status',
  'completion_note',
  'cancellation_reason',
  'cancelled_at',
  'treatment_id',
  'treatment_description',
  'treatment_count',
  'price',
  'recurrence',
  'treatment_notes',
  'billing_mode',
  'createdBy',
  'updatedBy',
].join(' ');

const toDateOrNull = (value) => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const defaultCalendarRange = () => {
  const now = new Date();
  const from = new Date(now);
  from.setDate(from.getDate() - 31);
  from.setHours(0, 0, 0, 0);
  const to = new Date(now);
  to.setDate(to.getDate() + 93);
  to.setHours(23, 59, 59, 999);
  return { from, to };
};

const parseCalendarRange = (fromValue, toValue) => {
  const fallback = defaultCalendarRange();
  const from = toDateOrNull(fromValue) || fallback.from;
  const to = toDateOrNull(toValue) || fallback.to;

  if (from > to) {
    return fallback;
  }

  return { from, to };
};

const parseBoolean = (value) => {
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', '1', 'yes', 'on'].includes(normalized)) {
      return true;
    }
    if (['false', '0', 'no', 'off'].includes(normalized)) {
      return false;
    }
  }
  return Boolean(value);
};

const addAppointmentFilters = (query, req, options = {}) => {
  const {
    from,
    to,
    employeeID,
    status,
    includeCancelled,
  } = options;

  if (from || to) {
    query.date = {};
    if (from) {
      query.date.$gte = from;
    }
    if (to) {
      query.date.$lte = to;
    }
  }

  if (status) {
    query.status = status;
  } else if (!parseBoolean(includeCancelled)) {
    query.status = { $nin: CANCELLED_STATUSES };
  }

  if (req.user.role === 'admin') {
    if (employeeID !== undefined && employeeID !== '') {
      const numericEmployeeId = Number(employeeID);
      query.employeeID = Number.isNaN(numericEmployeeId) ? employeeID : numericEmployeeId;
    }
    return query;
  }

  if (req.user.employeeID !== null && req.user.employeeID !== undefined) {
    query.employeeID = req.user.employeeID;
  } else {
    query.therapist = req.user.id;
  }

  return query;
};

router.get(
  '/calendar',
  authenticate,
  authorize('admin', 'therapist', 'receptionist'),
  async (req, res, next) => {
    try {
      const range = parseCalendarRange(req.query.from, req.query.to);
      const query = addAppointmentFilters({}, req, {
        ...range,
        employeeID: req.query.employeeID,
        status: req.query.status,
        includeCancelled: req.query.includeCancelled,
      });

      const appointmentDocs = await Appointment.find(query)
        .select(CALENDAR_FIELDS)
        .sort({ date: 1 });

      return res.json({
        success: true,
        appointments: toPlainObject(appointmentDocs),
        range: {
          from: range.from.toISOString(),
          to: range.to.toISOString(),
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/table',
  authenticate,
  authorize('admin', 'therapist', 'receptionist'),
  async (req, res, next) => {
    try {
      const from = toDateOrNull(req.query.from);
      const to = toDateOrNull(req.query.to);
      const query = addAppointmentFilters({}, req, {
        from,
        to,
        employeeID: req.query.employeeID,
        status: req.query.status,
        includeCancelled: req.query.includeCancelled,
      });

      const appointmentDocs = await Appointment.find(query)
        .select(TABLE_FIELDS)
        .sort({ date: 1 });
      const appointments = toPlainObject(appointmentDocs);
      const paymentStatuses = await fetchPaymentStatuses(appointments);
      const appointmentsWithStatus = appointments.map((appointment) => ({
        ...appointment,
        paymentStatus: paymentStatuses.get(String(appointment.appointment_id)) || 'Pending',
      }));

      return res.json({
        success: true,
        appointments: appointmentsWithStatus,
      });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
