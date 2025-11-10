const express = require('express');
const Patient = require('../models/patients');
const Appointment = require('../models/appointments');
const Communication = require('../models/communications');
const Invoice = require('../models/invoices');
const Payment = require('../models/payments');
const Note = require('../models/notes');
const Counter = require('../models/counter');
const User = require('../models/user');
const { authenticate, authorize } = require('../middleware/auth');
const { fetchPaymentStatus } = require('../utils/payments');
const { recordAuditEvent } = require('../utils/audit');
const { buildTokensFromSearchQuery } = require('../utils/patientSecurity');
const { toPlainObject } = require('../utils/mongoose');

const router = express.Router();

const serializePatient = (doc) => (doc ? toPlainObject(doc) : null);

const normalizePatientId = (value) => {
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

const calculateAge = (value, referenceDate = new Date()) => {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  let age = referenceDate.getFullYear() - date.getFullYear();
  const monthDiff = referenceDate.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && referenceDate.getDate() < date.getDate())) {
    age -= 1;
  }
  return age;
};

router.get(
  '/retention/report',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const now = new Date();
      const adultThreshold = new Date(now);
      adultThreshold.setFullYear(now.getFullYear() - 8);

      const archivedPatientDocs = await Patient.find({
        status: 'archived',
        updatedAt: { $lte: adultThreshold },
      })
        .select('patient_id first_name surname updatedAt date_of_birth status');

      const archivedPatients = archivedPatientDocs.map(toPlainObject);

      const eligible = archivedPatients.filter((patient) => {
        const age = calculateAge(patient.date_of_birth, now);
        if (age === null) {
          return true;
        }
        return age >= 25;
      });

      res.json({
        success: true,
        generatedAt: now.toISOString(),
        eligible,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/',
  authenticate,
  authorize('admin', 'therapist', 'receptionist'),
  async (req, res, next) => {
    try {
      const {
        search,
        status,
        assignedTo,
        limit = 100,
      } = req.query;

      const query = {};

      if (status) {
        query.status = status;
      }

      if (assignedTo) {
        query.$or = [
          { primary_therapist_id: Number(assignedTo) },
          { 'primaryTherapist.employeeID': Number(assignedTo) },
        ];
      }

      if (search) {
        const searchTokens = buildTokensFromSearchQuery(search);
        if (searchTokens.length === 0) {
          return res.json({ success: true, patients: [] });
        }
        query.searchTokens = { $all: searchTokens };
      }

      const patientDocs = await Patient.find(query)
        .limit(Number(limit))
        .sort({ updatedAt: -1 })
        .populate('primaryTherapist', 'username email role employeeID');

      const patients = patientDocs.map(toPlainObject);

      const patientIds = patients.map((patient) => patient.patient_id);

      const [appointmentDocs, invoiceDocs, noteDocs] = await Promise.all([
        Appointment.find({ patient_id: { $in: patientIds } }),
        Invoice.find({ patient_id: { $in: patientIds } }),
        Note.find({ patient_id: { $in: patientIds } }),
      ]);

      const appointments = appointmentDocs.map(toPlainObject);
      const invoices = invoiceDocs.map(toPlainObject);
      const notes = noteDocs.map(toPlainObject);

      const appointmentsByPatient = appointments.reduce((acc, appointment) => {
        acc[appointment.patient_id] = acc[appointment.patient_id] || [];
        acc[appointment.patient_id].push(appointment);
        return acc;
      }, {});

      const invoicesByPatient = invoices.reduce((acc, invoice) => {
        acc[invoice.patient_id] = acc[invoice.patient_id] || [];
        acc[invoice.patient_id].push(invoice);
        return acc;
      }, {});

      const notesByPatient = notes.reduce((acc, note) => {
        acc[note.patient_id] = acc[note.patient_id] || [];
        acc[note.patient_id].push(note);
        return acc;
      }, {});

      const result = await Promise.all(patients.map(async (patient) => {
        const patientAppointments = appointmentsByPatient[patient.patient_id] || [];
        const appointmentsWithPayment = await Promise.all(
          patientAppointments.map(async (appointment) => ({
            ...appointment,
            paymentStatus: await fetchPaymentStatus(appointment.appointment_id, appointment.price),
          })),
        );

        return {
          ...patient,
          appointments: appointmentsWithPayment,
          invoices: invoicesByPatient[patient.patient_id] || [],
          notes: notesByPatient[patient.patient_id] || [],
          upcomingAppointment: appointmentsWithPayment
            .filter((appointment) => appointment.status === 'scheduled')
            .sort((a, b) => new Date(a.date) - new Date(b.date))[0] || null,
        };
      }));

      res.json({
        success: true,
        patients: result,
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
      const nextPatientId = await Counter.next('patient_id', 1);
      const {
        primaryTherapistId,
        primary_therapist_id: primaryTherapistEmployeeId,
        ...body
      } = req.body;

      const normalizedPrimaryTherapistEmployeeId = toNumberOrUndefined(primaryTherapistEmployeeId);
      if (primaryTherapistEmployeeId !== undefined && normalizedPrimaryTherapistEmployeeId === undefined) {
        return res.status(400).json({ success: false, message: 'primary_therapist_id must be numeric' });
      }

      let therapistRecord = null;
      if (primaryTherapistId) {
        therapistRecord = await User.findById(primaryTherapistId).select('employeeID');
        if (!therapistRecord) {
          return res.status(400).json({ success: false, message: 'Selected therapist not found' });
        }
      }

      const payload = {
        ...body,
        patient_id: body.patient_id || nextPatientId,
        createdBy: req.user.id,
        updatedBy: req.user.id,
      };

      if (therapistRecord) {
        payload.primaryTherapist = therapistRecord._id;
      }

      if (normalizedPrimaryTherapistEmployeeId !== undefined) {
        payload.primary_therapist_id = normalizedPrimaryTherapistEmployeeId;
      } else if (therapistRecord?.employeeID !== undefined) {
        payload.primary_therapist_id = therapistRecord.employeeID;
      }

      const patient = await Patient.create(payload);
      const responsePatient = serializePatient(patient);

      await recordAuditEvent({
        event: 'patient.create',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        userId: patient.id,
        metadata: { patient_id: patient.patient_id.toString() },
      });

      res.status(201).json({
        success: true,
        patient: responsePatient,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  '/:id',
  authenticate,
  authorize('admin', 'receptionist', 'therapist'),
  async (req, res, next) => {
    try {
      const patientId = normalizePatientId(req.params.id);
      if (!patientId) {
        return res.status(400).json({ success: false, message: 'Invalid patient id' });
      }

      const {
        primaryTherapistId,
        primary_therapist_id: primaryTherapistEmployeeId,
        ...body
      } = req.body;

      const update = {
        ...body,
        updatedBy: req.user.id,
      };

      const normalizedPrimaryTherapistEmployeeId = toNumberOrUndefined(primaryTherapistEmployeeId);
      if (primaryTherapistEmployeeId !== undefined && normalizedPrimaryTherapistEmployeeId === undefined) {
        return res.status(400).json({ success: false, message: 'primary_therapist_id must be numeric' });
      }

      if (normalizedPrimaryTherapistEmployeeId !== undefined) {
        update.primary_therapist_id = normalizedPrimaryTherapistEmployeeId;
      }

      if (primaryTherapistId !== undefined) {
        if (primaryTherapistId === '' || primaryTherapistId === null) {
          update.primaryTherapist = undefined;
          if (primaryTherapistEmployeeId === undefined) {
            update.primary_therapist_id = undefined;
          }
        } else {
          const therapistRecord = await User.findById(primaryTherapistId).select('employeeID');
          if (!therapistRecord) {
            return res.status(400).json({ success: false, message: 'Selected therapist not found' });
          }
          update.primaryTherapist = therapistRecord._id;
          if (primaryTherapistEmployeeId === undefined) {
            update.primary_therapist_id = therapistRecord.employeeID ?? undefined;
          }
        }
      }

      const patient = await Patient.findOne({ patient_id: patientId });

      if (!patient) {
        return res.status(404).json({ success: false, message: 'Patient not found' });
      }

      Object.entries(update).forEach(([key, value]) => {
        if (value === undefined) {
          return;
        }
        patient.set(key, value);
      });

      patient.updatedBy = req.user.id;
      await patient.save();

      const sanitizedPatient = serializePatient(patient);

      await recordAuditEvent({
        event: 'patient.update',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { patient_id: patientId.toString() },
      });

      return res.json({ success: true, patient: sanitizedPatient });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  '/:id',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const patientId = normalizePatientId(req.params.id);

      if (!patientId) {
        return res.status(400).json({ success: false, message: 'Invalid patient id' });
      }

      const patient = await Patient.findOneAndUpdate(
        { patient_id: patientId },
        { $set: { status: 'archived', updatedBy: req.user.id } },
        { new: true },
      );

      if (!patient) {
        return res.status(404).json({ success: false, message: 'Patient not found' });
      }

      await recordAuditEvent({
        event: 'patient.archive',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { patient_id: patientId.toString() },
      });

      return res.json({ success: true, patient: serializePatient(patient) });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/:id/anonymize',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const patientId = normalizePatientId(req.params.id);
      if (!patientId) {
        return res.status(400).json({ success: false, message: 'Invalid patient id' });
      }

      const patient = await Patient.findOne({ patient_id: patientId });

      if (!patient) {
        return res.status(404).json({ success: false, message: 'Patient not found' });
      }

      const anonymizedLabel = `Patient-${patientId}`;
      patient.first_name = 'Anonymized';
      patient.surname = anonymizedLabel;
      patient.preferred_name = undefined;
      patient.email = `${patientId}@redacted.bridges`;
      patient.phone = '';
      patient.secondary_phone = '';
      patient.primary_contact_name = '';
      patient.primary_contact_email = '';
      patient.primary_contact_phone = '';
      patient.address = undefined;
      patient.emergency_contact = undefined;
      patient.insurance = undefined;
      patient.medical_alerts = [];
      patient.notes_summary = '';
      patient.status = 'archived';
      patient.tags = Array.from(new Set([...(patient.tags || []), 'anonymized']));
      patient.updatedBy = req.user.id;
      await patient.save();

      await Promise.all([
        Appointment.updateMany(
          { patient_id: patientId },
          {
            $set: {
              first_name: 'Anonymized',
              surname: anonymizedLabel,
              contact: '',
            },
          },
        ),
        Invoice.updateMany(
          { patient_id: patientId },
          {
            $set: {
              billing_contact_name: 'Anonymized',
              billing_contact_email: '',
              billing_contact_phone: '',
            },
          },
        ),
        Note.updateMany(
          { patient_id: patientId },
          { $set: { note: '[REDACTED]' } },
        ),
        Communication.updateMany(
          { patient_id: patientId },
          { $set: { subject: '[REDACTED]', content: '[REDACTED]' } },
        ),
      ]);

      await recordAuditEvent({
        event: 'patient.anonymize',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { patient_id: patientId.toString() },
      });

      res.json({
        success: true,
        patient: serializePatient(patient),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/:id/export',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const patientId = normalizePatientId(req.params.id);
      if (!patientId) {
        return res.status(400).json({ success: false, message: 'Invalid patient id' });
      }

      const patientDoc = await Patient.findOne({ patient_id: patientId })
        .populate('primaryTherapist', 'username email role employeeID');

      if (!patientDoc) {
        return res.status(404).json({ success: false, message: 'Patient not found' });
      }

      const patient = toPlainObject(patientDoc);

      const [appointmentDocs, noteDocs, invoiceDocs, paymentDocs, communicationDocs] = await Promise.all([
        Appointment.find({ patient_id: patientId }).sort({ date: -1 }),
        Note.find({ patient_id: patientId }).sort({ date: -1 }),
        Invoice.find({ patient_id: patientId }).sort({ issue_date: -1 }),
        Payment.find({ patient_id: patientId }).sort({ payment_date: -1 }),
        Communication.find({ patient_id: patientId }).sort({ date: -1 }),
      ]);

      const appointments = toPlainObject(appointmentDocs);
      const notes = toPlainObject(noteDocs);
      const invoices = toPlainObject(invoiceDocs);
      const payments = toPlainObject(paymentDocs);
      const communications = toPlainObject(communicationDocs);

      const exportPayload = {
        generatedAt: new Date().toISOString(),
        patient,
        appointments,
        notes,
        invoices,
        payments,
        communications,
      };

      res.setHeader('Content-Disposition', `attachment; filename="patient-${patientId}-export.json"`);

      await recordAuditEvent({
        event: 'patient.export',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { patient_id: patientId.toString() },
      });

      return res.json({
        success: true,
        export: exportPayload,
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.get(
  '/:id',
  authenticate,
  authorize('admin', 'therapist', 'receptionist'),
  async (req, res, next) => {
    try {
      const patientId = normalizePatientId(req.params.id);
      if (!patientId) {
        return res.status(400).json({ success: false, message: 'Invalid patient id' });
      }

      const patientDoc = await Patient.findOne({ patient_id: patientId })
        .populate('primaryTherapist', 'username email role employeeID');
      if (!patientDoc) {
        return res.status(404).json({ success: false, message: 'Patient not found' });
      }

      const patient = toPlainObject(patientDoc);

      const [appointmentDocs, communicationDocs, invoiceDocs, noteDocs] = await Promise.all([
        Appointment.find({ patient_id: patient.patient_id }).sort({ date: -1 }),
        Communication.find({ patient_id: patient.patient_id }).sort({ date: -1 }),
        Invoice.find({ patient_id: patient.patient_id }).sort({ issue_date: -1 }),
        Note.find({ patient_id: patient.patient_id }).sort({ date: -1 }),
      ]);

      const appointments = toPlainObject(appointmentDocs);
      const communications = toPlainObject(communicationDocs);
      const invoices = toPlainObject(invoiceDocs);
      const notes = toPlainObject(noteDocs);

      const appointmentsWithStatus = await Promise.all(
        appointments.map(async (appointment) => ({
          ...appointment,
          paymentStatus: await fetchPaymentStatus(appointment.appointment_id, appointment.price),
        })),
      );

      res.json({
        success: true,
        patient,
        treatments: appointmentsWithStatus,
        communications,
        invoices,
        notes,
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
