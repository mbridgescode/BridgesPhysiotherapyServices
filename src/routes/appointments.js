const express = require('express');
const crypto = require('crypto');
const Appointment = require('../models/appointments');
const Patient = require('../models/patients');
const User = require('../models/user');
const Counter = require('../models/counter');
const Service = require('../models/service');
const { authenticate, authorize } = require('../middleware/auth');
const { fetchPaymentStatus } = require('../utils/payments');
const { recordAuditEvent } = require('../utils/audit');
const { sendTransactionalEmail } = require('../services/emailService');
const { getLatestClinicSettings } = require('../services/clinicSettingsService');
const { buildBookingConfirmationEmail } = require('../templates/email/bookingConfirmationEmail');

const router = express.Router();

const normalizeAppointmentId = (value) => {
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
};

const toNumberOrUndefined = (value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const numeric = Number(value);
  return Number.isNaN(numeric) ? undefined : numeric;
};

const applyFilters = (query, { employeeID, status, from, to, includeCancelled }) => {
  if (employeeID !== undefined) {
    const normalizedEmployeeId = Number(employeeID);
    query.employeeID = Number.isNaN(normalizedEmployeeId)
      ? employeeID
      : normalizedEmployeeId;
  }

  if (status) {
    query.status = status;
  }

  if (!includeCancelled) {
    query.status = query.status || { $ne: 'cancelled' };
  }

  if (from || to) {
    query.date = {};
    if (from) {
      query.date.$gte = new Date(from);
    }
    if (to) {
      query.date.$lte = new Date(to);
    }
  }
};

const buildPatientDisplayName = (patient) => {
  const parts = [patient?.first_name, patient?.surname].filter(Boolean);
  if (parts.length) {
    return parts.join(' ').trim();
  }
  if (patient?.preferred_name) {
    return patient.preferred_name;
  }
  return patient?.patient_id ? `Patient ${patient.patient_id}` : 'Valued Patient';
};

const buildAppointmentPayload = ({ patient, data, createdBy, seriesId }) => ({
  ...data,
  patient_id: patient.patient_id,
  patient: patient.id,
  first_name: patient.first_name,
  surname: patient.surname,
  contact: patient.phone,
  series_id: seriesId,
  createdBy,
  updatedBy: createdBy,
  status: data.completed === true ? 'completed' : data.status || 'scheduled',
});

router.get(
  '/treatments',
  authenticate,
  authorize('admin', 'therapist', 'receptionist'),
  async (req, res, next) => {
    try {
      const services = await Service.find({ active: true }).sort({ treatment_description: 1 });
      if (services.length > 0) {
        return res.json({
          success: true,
          treatments: services.map((service) => ({
            treatment_id: service.treatment_id,
            description: service.treatment_description,
            price: service.price,
            duration_minutes: service.duration_minutes,
          })),
        });
      }

      const fallbackTreatments = await Appointment.aggregate([
        {
          $group: {
            _id: {
              treatment_id: '$treatment_id',
              treatment_description: '$treatment_description',
            },
            price: { $last: '$price' },
          },
        },
        {
          $project: {
            _id: 0,
            treatment_id: '$_id.treatment_id',
            description: '$_id.treatment_description',
            price: '$price',
          },
        },
        { $sort: { description: 1 } },
      ]);

      return res.json({
        success: true,
        treatments: fallbackTreatments.filter((item) => item.description),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/',
  authenticate,
  authorize('admin', 'therapist', 'receptionist'),
  async (req, res, next) => {
    try {
      const { employeeID, status, from, to, includeCancelled } = req.query;
      const query = {};
      applyFilters(query, { employeeID, status, from, to, includeCancelled });

      const appointments = await Appointment.find(query)
        .sort({ date: 1 })
        .lean({ getters: true, virtuals: true });

      const appointmentsWithStatus = await Promise.all(
        appointments.map(async (appointment) => ({
          ...appointment,
          paymentStatus: await fetchPaymentStatus(appointment.appointment_id, appointment.price),
        })),
      );

      res.json({
        success: true,
        appointments: appointmentsWithStatus,
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
        patient_id: patientId,
        recurrence,
        therapistId,
        ...body
      } = req.body;

      if (patientId === undefined || patientId === null || patientId === '') {
        return res.status(400).json({ success: false, message: 'patient_id is required' });
      }

      const normalizedPatientId = Number(patientId);
      const patientFilter = Number.isNaN(normalizedPatientId)
        ? { patient_id: patientId }
        : { patient_id: normalizedPatientId };

      const patient = await Patient.findOne(patientFilter);
      if (!patient) {
        return res.status(404).json({ success: false, message: 'Patient not found' });
      }

      let therapistRecord = null;
      if (therapistId) {
        therapistRecord = await User.findById(therapistId).select('employeeID username email');
        if (!therapistRecord) {
          return res.status(400).json({ success: false, message: 'Selected therapist not found' });
        }
      }

      const employeeIdValue = toNumberOrUndefined(body.employeeID);
      if (body.employeeID !== undefined && employeeIdValue === undefined) {
        return res.status(400).json({ success: false, message: 'employeeID must be numeric' });
      }

      const resolvedEmployeeId = employeeIdValue ?? therapistRecord?.employeeID;
      if (resolvedEmployeeId === undefined) {
        return res.status(400).json({ success: false, message: 'Therapist employee ID is required' });
      }

      if (!body.date) {
        return res.status(400).json({ success: false, message: 'date is required' });
      }
      const baseDate = new Date(body.date);
      if (Number.isNaN(baseDate.getTime())) {
        return res.status(400).json({ success: false, message: 'Invalid appointment date' });
      }

      if (!body.location) {
        return res.status(400).json({ success: false, message: 'location is required' });
      }

      if (!body.treatment_description) {
        return res.status(400).json({ success: false, message: 'treatment_description is required' });
      }

      const priceValue = toNumberOrUndefined(body.price);
      if (priceValue === undefined) {
        return res.status(400).json({ success: false, message: 'price must be provided as a number' });
      }

      const treatmentCountValue = toNumberOrUndefined(body.treatment_count ?? 1) ?? 1;
      if (treatmentCountValue <= 0) {
        return res.status(400).json({ success: false, message: 'treatment_count must be at least 1' });
      }

      const treatmentIdValue = toNumberOrUndefined(body.treatment_id);

      const sanitizedBody = {
        ...body,
        employeeID: resolvedEmployeeId,
        therapist: therapistRecord?._id || body.therapist,
        price: priceValue,
        treatment_count: treatmentCountValue,
        treatment_id: treatmentIdValue ?? Date.now(),
      };

      const seriesId = recurrence ? crypto.randomUUID() : undefined;

      const occurrences = [];

      occurrences.push(new Date(baseDate));

      if (recurrence?.frequency && recurrence?.count) {
        const { frequency, interval = 1, count, daysOfWeek = [] } = recurrence;
        let currentDate = new Date(baseDate);

        while (occurrences.length < count) {
          if (frequency === 'daily') {
            currentDate = new Date(currentDate.getTime() + (interval * 24 * 60 * 60 * 1000));
            occurrences.push(new Date(currentDate));
          } else if (frequency === 'weekly') {
            if (daysOfWeek.length === 0) {
              currentDate = new Date(currentDate.getTime() + (interval * 7 * 24 * 60 * 60 * 1000));
              occurrences.push(new Date(currentDate));
            } else {
              const nextDates = daysOfWeek
                .map((day) => {
                  const diff = (day + 7 - currentDate.getDay()) % 7 || 7;
                  return new Date(currentDate.getTime() + (diff * 24 * 60 * 60 * 1000));
                })
                .sort((a, b) => a - b);

              for (let i = 0; i < nextDates.length && occurrences.length < count; i += 1) {
                currentDate = nextDates[i];
                occurrences.push(new Date(currentDate));
              }

              currentDate = new Date(currentDate.getTime() + ((interval - 1) * 7 * 24 * 60 * 60 * 1000));
            }
          } else if (frequency === 'monthly') {
            currentDate = new Date(currentDate.setMonth(currentDate.getMonth() + interval));
            occurrences.push(new Date(currentDate));
          } else {
            break;
          }
        }
      }

      const documents = [];

      for (let i = 0; i < occurrences.length; i += 1) {
        const appointmentId = await Counter.next('appointment_id', 1);
        const appointmentPayload = buildAppointmentPayload({
          patient,
          data: {
            ...sanitizedBody,
            appointment_id: appointmentId,
            date: occurrences[i],
            recurrence,
          },
          createdBy: req.user.id,
          seriesId,
        });
        documents.push(appointmentPayload);
      }

      const createdAppointments = await Appointment.insertMany(documents);

      await recordAuditEvent({
        event: 'appointment.create',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: {
          patient_id: patient.patient_id.toString(),
          count: createdAppointments.length.toString(),
        },
      });

      let bookingEmailResult = null;
      if (patient.email) {
        try {
          const clinicSettings = await getLatestClinicSettings();
          const appointmentsForEmail = createdAppointments.map((doc) => {
            const plain = typeof doc.toObject === 'function' ? doc.toObject() : doc;
            return {
              ...plain,
              therapist_name: therapistRecord?.username || therapistRecord?.email || `Therapist #${resolvedEmployeeId}`,
            };
          });
          const emailContent = buildBookingConfirmationEmail({
            patientName: buildPatientDisplayName(patient),
            appointments: appointmentsForEmail,
            clinicSettings,
            additionalNote: body.additional_note,
          });
          bookingEmailResult = await sendTransactionalEmail({
            to: patient.email,
            subject: emailContent.subject,
            html: emailContent.html,
            text: emailContent.text,
            patientId: patient.patient_id,
            metadata: {
              appointment_ids: appointmentsForEmail.map((appt) => appt.appointment_id).join(','),
            },
          });
        } catch (emailError) {
          console.error('Failed to send booking confirmation email', emailError);
        }
      }

      res.status(201).json({
        success: true,
        appointments: createdAppointments,
        notification: bookingEmailResult
          ? {
              status: bookingEmailResult.status,
              provider: bookingEmailResult.provider,
            }
          : null,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/:appointmentId',
  authenticate,
  authorize('admin', 'therapist', 'receptionist'),
  async (req, res, next) => {
    try {
      const appointmentId = normalizeAppointmentId(req.params.appointmentId);
      if (!appointmentId) {
        return res.status(400).json({ success: false, message: 'Invalid appointment id' });
      }

      const update = {
        ...req.body,
        updatedBy: req.user.id,
      };

      if (update.status === 'cancelled') {
        update.cancelled_at = new Date();
      }

      const appointment = await Appointment.findOneAndUpdate(
        { appointment_id: appointmentId },
        { $set: update },
        { new: true },
      );

      if (!appointment) {
        return res.status(404).json({ success: false, message: 'Appointment not found' });
      }

      await recordAuditEvent({
        event: 'appointment.update',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { appointment_id: appointmentId.toString() },
      });

      return res.json({ success: true, appointment });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/complete',
  authenticate,
  authorize('admin', 'therapist', 'receptionist'),
  async (req, res, next) => {
    const { appointment_id: appointmentId, completed } = req.body;

    if (!appointmentId) {
      return res.status(400).json({ success: false, message: 'appointment_id is required' });
    }

    try {
      const appointment = await Appointment.findOneAndUpdate(
        { appointment_id: appointmentId },
        {
          $set: {
            completed: completed === true,
            status: completed === true ? 'completed' : 'scheduled',
            updatedBy: req.user.id,
          },
        },
        { new: true },
      );

      if (!appointment) {
        return res.status(404).json({ success: false, message: 'Appointment not found' });
      }

      await recordAuditEvent({
        event: 'appointment.complete',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { appointment_id: appointmentId.toString(), completed: completed === true ? 'true' : 'false' },
      });

      return res.json({ success: true, appointment });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  '/:appointmentId/cancel',
  authenticate,
  authorize('admin', 'therapist', 'receptionist'),
  async (req, res, next) => {
    try {
      const appointmentId = normalizeAppointmentId(req.params.appointmentId);
      if (!appointmentId) {
        return res.status(400).json({ success: false, message: 'Invalid appointment id' });
      }

      const { reason } = req.body;

      const appointment = await Appointment.findOneAndUpdate(
        { appointment_id: appointmentId },
        {
          $set: {
            status: 'cancelled',
            cancellation_reason: reason,
            cancelled_at: new Date(),
            updatedBy: req.user.id,
          },
        },
        { new: true },
      );

      if (!appointment) {
        return res.status(404).json({ success: false, message: 'Appointment not found' });
      }

      await recordAuditEvent({
        event: 'appointment.cancel',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { appointment_id: appointmentId.toString() },
      });

      return res.json({ success: true, appointment });
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  '/:appointmentId/notes',
  authenticate,
  authorize('admin', 'therapist'),
  async (req, res, next) => {
    const { appointmentId } = req.params;
    const { treatment_notes: treatmentNotes } = req.body;

    if (typeof treatmentNotes !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'treatment_notes must be provided as a string',
      });
    }

    const normalizedAppointmentId = Number(appointmentId);

    try {
      const filter = Number.isNaN(normalizedAppointmentId)
        ? { appointment_id: appointmentId }
        : { appointment_id: normalizedAppointmentId };

      const appointment = await Appointment.findOneAndUpdate(
        filter,
        {
          $set: {
            treatment_notes: treatmentNotes,
            updatedBy: req.user.id,
          },
        },
        { new: true },
      );

      if (!appointment) {
        return res.status(404).json({ success: false, message: 'Appointment not found' });
      }

      await recordAuditEvent({
        event: 'appointment.note.update',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { appointment_id: appointment.appointment_id.toString() },
      });

      return res.json({ success: true, appointment });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/:appointmentId/clinical-notes',
  authenticate,
  authorize('admin', 'therapist'),
  async (req, res, next) => {
    try {
      const appointmentId = normalizeAppointmentId(req.params.appointmentId);
      if (!appointmentId) {
        return res.status(400).json({ success: false, message: 'Invalid appointment id' });
      }

      const { note } = req.body;

      if (!note) {
        return res.status(400).json({ success: false, message: 'note is required' });
      }

      const appointment = await Appointment.findOneAndUpdate(
        { appointment_id: appointmentId },
        {
          $push: {
            clinical_notes: {
              author: req.user.id,
              note,
            },
          },
          $set: { updatedBy: req.user.id },
        },
        { new: true },
      );

      if (!appointment) {
        return res.status(404).json({ success: false, message: 'Appointment not found' });
      }

      await recordAuditEvent({
        event: 'appointment.clinical_note.create',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { appointment_id: appointmentId.toString() },
      });

      return res.json({ success: true, appointment });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
