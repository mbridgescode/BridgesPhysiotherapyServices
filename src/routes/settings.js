const express = require('express');
const ClinicSettings = require('../models/clinicSettings');
const TherapistAvailability = require('../models/therapistAvailability');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/audit');
const { sendTransactionalEmail } = require('../services/emailService');
const { getLatestClinicSettings } = require('../services/clinicSettingsService');
const { buildBookingConfirmationEmail } = require('../templates/email/bookingConfirmationEmail');
const { buildInvoiceDeliveryEmail, buildCancellationFeeInvoiceEmail } = require('../templates/email/invoiceDeliveryEmail');

const router = express.Router();

const DAY_IN_MS = 24 * 60 * 60 * 1000;

const DEFAULT_BRANDING = {
  clinic_name: 'Bridges Physiotherapy Services',
  phone: '07455 285117',
  email: 'hello@bridgesphysiotherapy.co.uk',
  website: 'https://www.bridgesphysiotherapy.co.uk',
  address: 'Community practice, Gloucestershire',
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

const createSamplePatient = () => ({
  patient_id: 4021,
  first_name: 'Alex',
  surname: 'Morrison',
  preferred_name: 'Alex',
  email: 'client@example.com',
  phone: '07455 285117',
});

const createSampleAppointment = (overrides = {}) => ({
  appointment_id: 72000,
  treatment_description: 'Neurological physiotherapy assessment',
  therapist_name: 'Megan Bridges',
  location: 'Home visit',
  room: 'Living room',
  date: new Date(Date.now() + (3 * DAY_IN_MS)),
  ...overrides,
});

const createSampleAppointments = () => ([
  createSampleAppointment({
    appointment_id: 72001,
    date: new Date(Date.now() + (3 * DAY_IN_MS)),
  }),
  createSampleAppointment({
    appointment_id: 72002,
    date: new Date(Date.now() + (10 * DAY_IN_MS)),
    treatment_description: 'Follow-up neurological physiotherapy',
    location: 'Bridges Physiotherapy Clinic',
    room: 'Treatment room 2',
  }),
]);

const createSampleInvoiceContext = ({
  invoiceNumber = 'INV-TEST-1001',
  amount = 120,
  dueInDays = 7,
  lineItems,
} = {}) => {
  const patient = createSamplePatient();
  const billingContact = {
    name: `${patient.first_name} ${patient.surname}`,
    email: patient.email,
    phone: patient.phone,
  };
  const issueDate = new Date();
  const dueDate = new Date(issueDate.getTime() + (dueInDays * DAY_IN_MS));
  const resolvedLineItems = lineItems || [
    {
      description: 'Neurological physiotherapy assessment',
      quantity: 1,
      unit_price: 90,
      total: 90,
      appointment_id: 72001,
      service_date: issueDate,
    },
    {
      description: 'Rehabilitation exercise plan',
      quantity: 1,
      unit_price: 30,
      total: 30,
      appointment_id: 72001,
      service_date: issueDate,
    },
  ];
  const resolvedAmount = typeof amount === 'number'
    ? amount
    : resolvedLineItems.reduce((sum, item) => sum + Number(item.total || 0), 0);
  const totals = {
    subtotal: resolvedAmount,
    net: resolvedAmount,
    gross: resolvedAmount,
    balance: resolvedAmount,
    total: resolvedAmount,
  };

  return {
    invoice: {
      invoice_id: 99001,
      invoice_number: invoiceNumber,
      issue_date: issueDate,
      due_date: dueDate,
      currency: 'GBP',
      line_items: resolvedLineItems,
      totals,
      subtotal: resolvedAmount,
      total_due: resolvedAmount,
      balance_due: resolvedAmount,
      billing_contact_name: billingContact.name,
      billing_contact_email: billingContact.email,
      billing_contact_phone: billingContact.phone,
      patient_name: `${patient.first_name} ${patient.surname}`,
      patient_email: patient.email,
      patient_phone: patient.phone,
      appointment_ids: resolvedLineItems
        .map((item) => item.appointment_id)
        .filter((value) => value !== undefined && value !== null),
    },
    patient,
    billingContact,
  };
};

const buildBookingConfirmationTestEmail = ({ clinicSettings }) => {
  const patient = createSamplePatient();
  const appointments = createSampleAppointments();
  const content = buildBookingConfirmationEmail({
    patientName: `${patient.first_name} ${patient.surname}`,
    appointments,
    clinicSettings,
    additionalNote: 'For your initial assessment, please have any recent letters or medication lists to hand.',
  });
  return {
    subject: content.subject,
    html: content.html,
    text: content.text,
    metadata: {
      appointment_ids: appointments.map((appt) => appt.appointment_id).join(','),
    },
  };
};

const buildInvoiceDeliveryTestEmail = ({ clinicSettings }) => {
  const context = createSampleInvoiceContext({
    invoiceNumber: 'INV-TEST-1001',
    amount: 120,
  });
  const content = buildInvoiceDeliveryEmail({
    invoice: context.invoice,
    billingContact: context.billingContact,
    clinicSettings,
    patient: context.patient,
  });
  return {
    subject: content.subject,
    html: content.html,
    text: content.text,
    metadata: {
      invoice_number: context.invoice.invoice_number,
    },
  };
};

const buildCancellationFeeTestEmail = ({ clinicSettings }) => {
  const cancelledAppointment = createSampleAppointment({
    appointment_id: 72010,
    date: new Date(Date.now() - (12 * 60 * 60 * 1000)),
    treatment_description: 'Community neurological physiotherapy',
  });
  const context = createSampleInvoiceContext({
    invoiceNumber: 'INV-TEST-1002',
    amount: 60,
    lineItems: [
      {
        description: 'Same-day cancellation fee',
        quantity: 1,
        unit_price: 60,
        total: 60,
        appointment_id: cancelledAppointment.appointment_id,
        service_date: cancelledAppointment.date,
      },
    ],
  });
  const content = buildCancellationFeeInvoiceEmail({
    invoice: context.invoice,
    billingContact: context.billingContact,
    clinicSettings,
    appointment: cancelledAppointment,
    patient: context.patient,
  });
  return {
    subject: content.subject,
    html: content.html,
    text: content.text,
    metadata: {
      invoice_number: context.invoice.invoice_number,
      appointment_id: cancelledAppointment.appointment_id,
    },
  };
};

const TEST_EMAIL_DEFINITIONS = [
  {
    id: 'booking_confirmation',
    label: 'Booking confirmation',
    description: 'Sent to patients when an appointment is scheduled.',
    build: buildBookingConfirmationTestEmail,
  },
  {
    id: 'invoice_delivery',
    label: 'Invoice delivery',
    description: 'The standard invoice email (PDF attachment included in production).',
    build: buildInvoiceDeliveryTestEmail,
  },
  {
    id: 'cancellation_fee',
    label: 'Cancellation fee invoice',
    description: 'Sent when a same-day cancellation fee is applied.',
    build: buildCancellationFeeTestEmail,
  },
];

const TEST_EMAIL_BUILDERS = TEST_EMAIL_DEFINITIONS.reduce((acc, definition) => {
  acc[definition.id] = definition.build;
  return acc;
}, {});

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
      types: TEST_EMAIL_DEFINITIONS.map(({ id, label, description }) => ({
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
      const builder = TEST_EMAIL_BUILDERS[normalizedType];
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
