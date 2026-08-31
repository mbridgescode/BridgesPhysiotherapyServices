/*
 * Seed a preview/UAT database with synthetic clinic data.
 *
 * Required environment variables:
 *   MONGODB_URI                 URI whose database name contains "uat"
 *   DATA_ENCRYPTION_KEY         Key used by the encrypted model fields
 *   UAT_SEED_PASSWORD           Password assigned to all seeded test users
 *
 * The script is deliberately idempotent. It updates only the deterministic
 * records below and never drops a database or removes user-created UAT data.
 */

const mongoose = require('mongoose');

const requireEnv = (name) => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
};

const mongoUri = requireEnv('MONGODB_URI');
const dataEncryptionKey = requireEnv('DATA_ENCRYPTION_KEY');
const seedPassword = requireEnv('UAT_SEED_PASSWORD');

if (seedPassword.length < 8) {
  throw new Error('UAT_SEED_PASSWORD must be at least eight characters long');
}

const parsedMongoUri = new URL(mongoUri);
const databaseName = decodeURIComponent(parsedMongoUri.pathname.replace(/^\/+|\/+$/g, ''));

if (!databaseName || !/uat/i.test(databaseName) || /prod|live|production/i.test(databaseName)) {
  throw new Error(
    `Refusing to seed database "${databaseName || '(missing)'}". `
      + 'Use a database name containing "uat" and not "prod", "live", or "production".',
  );
}

// These values must be in the process before loading any model that imports
// src/config/env.js or src/utils/encryption.js.
process.env.MONGODB_URI = mongoUri;
process.env.DATA_ENCRYPTION_KEY = dataEncryptionKey;
process.env.ACCESS_TOKEN_SECRET = process.env.ACCESS_TOKEN_SECRET || 'uat-seed-access-secret';
process.env.REFRESH_TOKEN_SECRET = process.env.REFRESH_TOKEN_SECRET || 'uat-seed-refresh-secret';

const User = require('../../src/models/user');
const Patient = require('../../src/models/patients');
const Appointment = require('../../src/models/appointments');
const Note = require('../../src/models/notes');
const Invoice = require('../../src/models/invoices');
const Payment = require('../../src/models/payments');
const Receipt = require('../../src/models/receipts');
const Communication = require('../../src/models/communications');
const ClinicSettings = require('../../src/models/clinicSettings');
const TherapistAvailability = require('../../src/models/therapistAvailability');
const TreatmentNoteTemplate = require('../../src/models/treatmentNoteTemplate');
const GpLetterTemplate = require('../../src/models/gpLetterTemplate');
const DataSubjectRequest = require('../../src/models/dataSubjectRequest');
const ProfitLossEntry = require('../../src/models/profitLossEntry');
const Counter = require('../../src/models/counter');

const objectId = (hex) => new mongoose.Types.ObjectId(hex);

const IDS = {
  admin: objectId('000000000000000000000001'),
  therapist: objectId('000000000000000000000002'),
  receptionist: objectId('000000000000000000000003'),
  patients: [
    objectId('000000000000000000000101'),
    objectId('000000000000000000000102'),
    objectId('000000000000000000000103'),
    objectId('000000000000000000000104'),
  ],
  appointments: [
    objectId('000000000000000000001001'),
    objectId('000000000000000000001002'),
    objectId('000000000000000000001003'),
    objectId('000000000000000000001004'),
    objectId('000000000000000000001005'),
  ],
  notes: [
    objectId('000000000000000000002001'),
    objectId('000000000000000000002002'),
  ],
  invoices: [
    objectId('000000000000000000003001'),
    objectId('000000000000000000003002'),
  ],
  payment: objectId('000000000000000000004001'),
  receipt: objectId('000000000000000000005001'),
  communication: objectId('000000000000000000006001'),
  availability: objectId('000000000000000000007001'),
  treatmentTemplate: objectId('000000000000000000008001'),
  gpTemplate: objectId('000000000000000000009001'),
  dataRequest: objectId('00000000000000000000a001'),
  profitLoss: objectId('00000000000000000000b001'),
};

const upsertAndSave = async (Model, filter, payload, _id) => {
  let document = await Model.findOne(filter);

  if (!document) {
    document = new Model({
      ...payload,
      ...(_id ? { _id } : {}),
    });
  } else {
    Object.assign(document, payload);
  }

  await document.save();
  return document;
};

const daysFromNow = (days, hour = 10) => {
  const value = new Date();
  value.setUTCDate(value.getUTCDate() + days);
  value.setUTCHours(hour, 0, 0, 0);
  return value;
};

const seedUsers = async () => {
  const common = {
    emailDomain: 'example.invalid',
    active: true,
    twoFactorEnabled: false,
    failedLoginAttempts: 0,
  };

  const admin = await upsertAndSave(User, { username: 'uat-admin' }, {
    name: 'UAT Administrator',
    username: 'uat-admin',
    email: `uat-admin@${common.emailDomain}`,
    password: seedPassword,
    role: 'admin',
    employeeID: 901,
    ...common,
  }, IDS.admin);

  const therapist = await upsertAndSave(User, { username: 'uat-therapist' }, {
    name: 'UAT Therapist',
    username: 'uat-therapist',
    email: `uat-therapist@${common.emailDomain}`,
    password: seedPassword,
    role: 'therapist',
    employeeID: 902,
    ...common,
  }, IDS.therapist);

  const receptionist = await upsertAndSave(User, { username: 'uat-reception' }, {
    name: 'UAT Reception',
    username: 'uat-reception',
    email: `uat-reception@${common.emailDomain}`,
    password: seedPassword,
    role: 'receptionist',
    employeeID: 903,
    ...common,
  }, IDS.receptionist);

  return { admin, therapist, receptionist };
};

const seedPatients = async ({ admin, therapist }) => {
  const patients = [
    {
      patient_id: 9001,
      first_name: 'Ava',
      surname: 'Morgan',
      preferred_name: 'Ava',
      date_of_birth: '1990-03-14',
      gender: 'female',
      email: 'ava.morgan@example.invalid',
      phone: '+44 7700 900101',
      primary_contact_name: 'Ava Morgan',
      primary_contact_email: 'ava.morgan@example.invalid',
      primary_contact_phone: '+44 7700 900101',
      address: {
        line1: '14 Example Close',
        city: 'Bristol',
        postcode: 'BS1 1AA',
        country: 'United Kingdom',
      },
      emergency_contact: {
        name: 'Jamie Morgan',
        relationship: 'Sibling',
        phone: '+44 7700 900111',
        email: 'jamie.morgan@example.invalid',
      },
      medical_alerts: ['Synthetic UAT record - no clinical history'],
      primary_therapist_id: therapist.employeeID,
      primaryTherapist: therapist._id,
      tags: ['UAT', 'new-patient'],
      notes_summary: 'Synthetic record for testing the patient journey.',
      createdBy: admin._id,
      updatedBy: admin._id,
    },
    {
      patient_id: 9002,
      first_name: 'Noah',
      surname: 'Patel',
      preferred_name: 'Noah',
      date_of_birth: '1985-09-22',
      gender: 'male',
      email: 'noah.patel@example.invalid',
      phone: '+44 7700 900102',
      primary_contact_name: 'Noah Patel',
      primary_contact_email: 'noah.patel@example.invalid',
      primary_contact_phone: '+44 7700 900102',
      address: {
        line1: '27 Sample Road',
        city: 'Bath',
        postcode: 'BA1 1AA',
        country: 'United Kingdom',
      },
      medical_alerts: [],
      primary_therapist_id: therapist.employeeID,
      primaryTherapist: therapist._id,
      status: 'active',
      tags: ['UAT', 'follow-up'],
      notes_summary: 'Synthetic record with an outstanding balance.',
      createdBy: admin._id,
      updatedBy: admin._id,
    },
    {
      patient_id: 9003,
      first_name: 'Ruby',
      surname: 'Chen',
      preferred_name: 'Ruby',
      date_of_birth: '2001-11-05',
      gender: 'non-binary',
      email: 'ruby.chen@example.invalid',
      phone: '+44 7700 900103',
      primary_contact_name: 'Ruby Chen',
      primary_contact_email: 'ruby.chen@example.invalid',
      primary_contact_phone: '+44 7700 900103',
      address: {
        line1: '8 Placeholder Lane',
        city: 'Cheltenham',
        postcode: 'GL50 1AA',
        country: 'United Kingdom',
      },
      medical_alerts: [],
      primary_therapist_id: therapist.employeeID,
      primaryTherapist: therapist._id,
      status: 'active',
      tags: ['UAT', 'sports'],
      notes_summary: 'Synthetic record for testing communication and note history.',
      createdBy: admin._id,
      updatedBy: admin._id,
    },
    {
      patient_id: 9004,
      first_name: 'Theo',
      surname: 'Williams',
      preferred_name: 'Theo',
      date_of_birth: '1978-06-19',
      gender: 'male',
      email: 'theo.williams@example.invalid',
      phone: '+44 7700 900104',
      primary_contact_name: 'Theo Williams',
      primary_contact_email: 'theo.williams@example.invalid',
      primary_contact_phone: '+44 7700 900104',
      address: {
        line1: '3 Demo Street',
        city: 'Gloucester',
        postcode: 'GL1 1AA',
        country: 'United Kingdom',
      },
      medical_alerts: [],
      primary_therapist_id: therapist.employeeID,
      primaryTherapist: therapist._id,
      status: 'inactive',
      tags: ['UAT', 'inactive'],
      notes_summary: 'Synthetic inactive patient for filtering tests.',
      createdBy: admin._id,
      updatedBy: admin._id,
    },
  ];

  return Promise.all(patients.map((patient, index) => upsertAndSave(
    Patient,
    { patient_id: patient.patient_id },
    patient,
    IDS.patients[index],
  )));
};

const seedServices = async () => {
  const services = [
    { treatment_id: 701, treatment_description: 'Initial physiotherapy assessment', price: 65, duration_minutes: 60, notes: 'Synthetic UAT service' },
    { treatment_id: 702, treatment_description: 'Follow-up treatment session', price: 55, duration_minutes: 45, notes: 'Synthetic UAT service' },
    { treatment_id: 703, treatment_description: 'Sports injury review', price: 75, duration_minutes: 60, notes: 'Synthetic UAT service' },
    { treatment_id: 704, treatment_description: 'Home exercise review', price: 40, duration_minutes: 30, notes: 'Synthetic UAT service' },
  ];

  return Promise.all(services.map((service) => upsertAndSave(
    require('../../src/models/service'),
    { treatment_id: service.treatment_id },
    service,
  )));
};

const seedAppointments = async ({ admin, therapist, patients }) => {
  const appointments = [
    {
      appointment_id: 97001,
      patient_id: patients[0].patient_id,
      patient: patients[0]._id,
      employeeID: therapist.employeeID,
      therapist: therapist._id,
      date: daysFromNow(-21, 9),
      duration_minutes: 60,
      location: 'Clinic',
      room: 'Room 1',
      first_name: 'Ava',
      surname: 'Morgan',
      contact: 'ava.morgan@example.invalid',
      completed: true,
      status: 'completed',
      completion_status: 'completed',
      completion_note: 'Synthetic completed appointment.',
      treatment_id: 701,
      treatment_description: 'Initial physiotherapy assessment',
      treatment_count: 1,
      price: 65,
      treatment_notes: 'Synthetic UAT treatment note.',
      clinical_notes: [{ author: therapist._id, note: 'Synthetic clinical note for UAT.' }],
      createdBy: admin._id,
      updatedBy: therapist._id,
    },
    {
      appointment_id: 97002,
      patient_id: patients[0].patient_id,
      patient: patients[0]._id,
      employeeID: therapist.employeeID,
      therapist: therapist._id,
      date: daysFromNow(3, 10),
      duration_minutes: 45,
      location: 'Clinic',
      room: 'Room 1',
      first_name: 'Ava',
      surname: 'Morgan',
      contact: 'ava.morgan@example.invalid',
      treatment_id: 702,
      treatment_description: 'Follow-up treatment session',
      treatment_count: 2,
      price: 55,
      createdBy: admin._id,
      updatedBy: admin._id,
    },
    {
      appointment_id: 97003,
      patient_id: patients[1].patient_id,
      patient: patients[1]._id,
      employeeID: therapist.employeeID,
      therapist: therapist._id,
      date: daysFromNow(1, 14),
      duration_minutes: 60,
      location: 'Clinic',
      room: 'Room 2',
      first_name: 'Noah',
      surname: 'Patel',
      contact: 'noah.patel@example.invalid',
      treatment_id: 703,
      treatment_description: 'Sports injury review',
      treatment_count: 1,
      price: 75,
      createdBy: admin._id,
      updatedBy: admin._id,
    },
    {
      appointment_id: 97004,
      patient_id: patients[2].patient_id,
      patient: patients[2]._id,
      employeeID: therapist.employeeID,
      therapist: therapist._id,
      date: daysFromNow(8, 11),
      duration_minutes: 30,
      location: 'Video',
      room: 'Virtual',
      first_name: 'Ruby',
      surname: 'Chen',
      contact: 'ruby.chen@example.invalid',
      treatment_id: 704,
      treatment_description: 'Home exercise review',
      treatment_count: 1,
      price: 40,
      createdBy: admin._id,
      updatedBy: admin._id,
    },
    {
      appointment_id: 97005,
      patient_id: patients[1].patient_id,
      patient: patients[1]._id,
      employeeID: therapist.employeeID,
      therapist: therapist._id,
      date: daysFromNow(-3, 15),
      duration_minutes: 45,
      location: 'Clinic',
      room: 'Room 2',
      first_name: 'Noah',
      surname: 'Patel',
      contact: 'noah.patel@example.invalid',
      completed: false,
      status: 'cancelled_by_patient',
      completion_status: 'cancelled_by_patient',
      cancellation_reason: 'Synthetic cancellation for UAT.',
      cancelled_at: daysFromNow(-4, 12),
      treatment_id: 702,
      treatment_description: 'Follow-up treatment session',
      treatment_count: 1,
      price: 55,
      createdBy: admin._id,
      updatedBy: admin._id,
    },
  ];

  return Promise.all(appointments.map((appointment, index) => upsertAndSave(
    Appointment,
    { appointment_id: appointment.appointment_id },
    appointment,
    IDS.appointments[index],
  )));
};

const seedFinancialRecords = async ({ admin, patients, appointments }) => {
  const invoiceOne = await upsertAndSave(Invoice, { invoice_number: 'UAT-2026-0001' }, {
    invoice_id: 98001,
    invoice_number: 'UAT-2026-0001',
    patient_id: patients[0].patient_id,
    client_id: patients[0].patient_id,
    appointment_id: appointments[0].appointment_id,
    appointment_ids: [appointments[0].appointment_id],
    patient: patients[0]._id,
    billing_contact_name: 'Ava Morgan',
    billing_contact_email: 'ava.morgan@example.invalid',
    billing_contact_phone: '+44 7700 900101',
    status: 'paid',
    line_items: [{
      line_id: 'uat-line-1',
      description: 'Initial physiotherapy assessment',
      quantity: 1,
      unit_price: 65,
      total: 65,
      appointment_id: appointments[0].appointment_id,
      service_date: appointments[0].date,
    }],
    totals: { net: 65, discount: 0, gross: 65, paid: 65, balance: 0 },
    subtotal: 65,
    total_due: 65,
    total_paid: 65,
    balance_due: 0,
    issue_date: daysFromNow(-20, 9),
    due_date: daysFromNow(-6, 9),
    paid_at: daysFromNow(-5, 9),
    currency: 'GBP',
    notes: 'Synthetic UAT invoice.',
    email_log: { status: 'not_sent' },
    createdBy: admin._id,
    updatedBy: admin._id,
  }, IDS.invoices[0]);

  const invoiceTwo = await upsertAndSave(Invoice, { invoice_number: 'UAT-2026-0002' }, {
    invoice_id: 98002,
    invoice_number: 'UAT-2026-0002',
    patient_id: patients[1].patient_id,
    client_id: patients[1].patient_id,
    appointment_id: appointments[4].appointment_id,
    appointment_ids: [appointments[4].appointment_id],
    patient: patients[1]._id,
    billing_contact_name: 'Noah Patel',
    billing_contact_email: 'noah.patel@example.invalid',
    billing_contact_phone: '+44 7700 900102',
    status: 'partially_paid',
    line_items: [{
      line_id: 'uat-line-2',
      description: 'Follow-up treatment session',
      quantity: 1,
      unit_price: 55,
      total: 55,
      appointment_id: appointments[4].appointment_id,
      service_date: appointments[4].date,
    }],
    totals: { net: 55, discount: 0, gross: 55, paid: 25, balance: 30 },
    subtotal: 55,
    total_due: 55,
    total_paid: 25,
    balance_due: 30,
    issue_date: daysFromNow(-2, 9),
    due_date: daysFromNow(12, 9),
    currency: 'GBP',
    notes: 'Synthetic UAT invoice with an outstanding balance.',
    email_log: { status: 'not_sent' },
    createdBy: admin._id,
    updatedBy: admin._id,
  }, IDS.invoices[1]);

  const payment = await upsertAndSave(Payment, { payment_id: 99001 }, {
    payment_id: 99001,
    invoice_id: invoiceTwo.invoice_id,
    invoice_number: invoiceTwo.invoice_number,
    patient_id: patients[1].patient_id,
    appointment_id: appointments[4].appointment_id,
    treatment_id: appointments[4].treatment_id,
    treatment_description: appointments[4].treatment_description,
    amount_paid: 25,
    currency: 'GBP',
    payment_date: daysFromNow(-1, 10),
    method: 'card',
    reference: 'UAT-PAYMENT-0001',
    status: 'applied',
    notes: 'Synthetic UAT payment.',
    recordedBy: admin._id,
  }, IDS.payment);

  await upsertAndSave(Receipt, { receipt_number: 'RCT-2026-0001' }, {
    receipt_id: 99101,
    receipt_number: 'RCT-2026-0001',
    payment_id: payment.payment_id,
    invoice_id: invoiceTwo.invoice_id,
    invoice_number: invoiceTwo.invoice_number,
    patient_id: patients[1].patient_id,
    appointment_id: appointments[4].appointment_id,
    amount_paid: 25,
    currency: 'GBP',
    payment_date: payment.payment_date,
    method: 'card',
    reference: 'UAT-PAYMENT-0001',
    notes: 'Synthetic UAT receipt.',
    receipt_date: payment.payment_date,
    status: 'draft',
    email_log: { status: 'not_sent' },
    createdBy: admin._id,
    updatedBy: admin._id,
  }, IDS.receipt);

  await upsertAndSave(ProfitLossEntry, { entry_id: 99201 }, {
    entry_id: 99201,
    date: daysFromNow(-1, 12),
    type: 'income',
    category: 'Treatment income',
    description: 'Synthetic UAT payment',
    amount: 25,
    source: 'invoice',
    invoice_number: invoiceTwo.invoice_number,
    invoice_id: invoiceTwo._id,
    createdBy: admin._id,
    updatedBy: admin._id,
  }, IDS.profitLoss);
};

const seedClinicalRecords = async ({ admin, therapist, patients, appointments }) => {
  await upsertAndSave(Note, {
    patient_id: patients[0].patient_id,
    appointment_id: appointments[0].appointment_id,
  }, {
    patient_id: patients[0].patient_id,
    appointment_id: appointments[0].appointment_id,
    employeeID: therapist.employeeID,
    author: therapist._id,
    type: 'treatment',
    note: 'Synthetic UAT note: patient reported improved mobility after the home exercise programme.',
    visibility: 'team',
    date: appointments[0].date,
    createdBy: therapist._id,
    updatedBy: therapist._id,
  }, IDS.notes[0]);

  await upsertAndSave(Note, {
    patient_id: patients[1].patient_id,
    appointment_id: appointments[4].appointment_id,
  }, {
    patient_id: patients[1].patient_id,
    appointment_id: appointments[4].appointment_id,
    employeeID: therapist.employeeID,
    author: therapist._id,
    type: 'administrative',
    note: 'Synthetic UAT note: patient requested a follow-up reminder.',
    visibility: 'team',
    date: daysFromNow(-2, 11),
    createdBy: admin._id,
    updatedBy: admin._id,
  }, IDS.notes[1]);

  await upsertAndSave(Communication, { communication_id: 99301 }, {
    communication_id: 99301,
    patient_id: patients[2].patient_id,
    patient: patients[2]._id,
    employeeID: therapist.employeeID,
    user: therapist._id,
    date: daysFromNow(-1, 13),
    type: 'phone',
    subject: 'UAT follow-up call',
    content: 'Synthetic UAT communication record for testing the patient timeline.',
    delivery_status: 'delivered',
    metadata: { source: 'uat-seed', reference: 'UAT-COMMS-0001' },
  }, IDS.communication);

  await upsertAndSave(DataSubjectRequest, { request_id: 99401 }, {
    request_id: 99401,
    patient_id: patients[0].patient_id,
    type: 'access',
    status: 'open',
    requesterName: 'Ava Morgan',
    requesterEmail: 'ava.morgan@example.invalid',
    receivedAt: daysFromNow(-2, 9),
    dueAt: daysFromNow(26, 9),
    handledBy: admin._id,
    notes: 'Synthetic UAT data-subject request.',
    history: [{
      action: 'created',
      note: 'Synthetic UAT request created for testing.',
      actor: admin._id,
    }],
  }, IDS.dataRequest);
};

const seedSettings = async ({ admin, therapist }) => {
  await upsertAndSave(ClinicSettings, {}, {
    branding: {
      clinic_name: 'Bridges Physiotherapy Services - UAT',
      phone: '00000 000000',
      email: 'uat@example.invalid',
      website: 'https://example.invalid/bridges-uat',
      address: 'Synthetic UAT clinic, United Kingdom',
    },
    invoice_prefix: 'UAT',
    email_provider: 'none',
    email_templates: [],
    payment_instructions: {
      text: 'Synthetic UAT payment instructions. Do not make a real payment.',
      lines: ['Synthetic UAT account', 'Reference: UAT invoice number'],
    },
    notification_preferences: {
      send_invoice_emails: false,
      send_payment_reminders: false,
      reminder_days_before_due: 3,
      reminder_days_after_due: 5,
    },
    updatedBy: admin._id,
  });

  await upsertAndSave(TherapistAvailability, {
    therapist: therapist._id,
    effective_from: new Date('2026-01-01T00:00:00.000Z'),
  }, {
    therapist: therapist._id,
    therapist_employee_id: therapist.employeeID,
    slots: [
      { day_of_week: 1, start_time: '09:00', end_time: '17:00', location: 'Clinic' },
      { day_of_week: 3, start_time: '09:00', end_time: '17:00', location: 'Clinic' },
      { day_of_week: 5, start_time: '09:00', end_time: '13:00', location: 'Video' },
    ],
    effective_from: new Date('2026-01-01T00:00:00.000Z'),
    is_default: true,
    notes: 'Synthetic UAT availability.',
  }, IDS.availability);

  await upsertAndSave(TreatmentNoteTemplate, { name: 'UAT standard treatment note' }, {
    name: 'UAT standard treatment note',
    body: 'Subjective:\nObjective:\nAssessment:\nPlan:\n\nThis is a synthetic UAT template.',
    tags: ['UAT', 'standard'],
    createdBy: admin._id,
    updatedBy: admin._id,
    archived: false,
  }, IDS.treatmentTemplate);

  await upsertAndSave(GpLetterTemplate, { name: 'UAT progress update' }, {
    name: 'UAT progress update',
    body: 'Dear colleague,\n\nThis synthetic letter template is provided for UAT testing only.\n\nKind regards,\nUAT Therapist',
    category: 'UAT',
    tags: ['UAT'],
    archived: false,
    createdBy: admin._id,
    updatedBy: admin._id,
  }, IDS.gpTemplate);
};

const seedCounters = async () => {
  const counters = {
    employee_id: 903,
    patient_id: 9004,
    appointment_id: 97005,
    service_id: 704,
    invoice_id: 98002,
    invoice_number: 2,
    payment_id: 99001,
    receipt_id: 99101,
    receipt_number: 1,
    data_request_id: 99401,
    profit_loss_entry_id: 99201,
  };

  await Promise.all(Object.entries(counters).map(([key, value]) => upsertAndSave(
    Counter,
    { key },
    { key, value },
  )));
};

const main = async () => {
  await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 10000 });

  const users = await seedUsers();
  const patients = await seedPatients(users);
  await seedServices();
  const appointments = await seedAppointments({ ...users, patients });
  await seedFinancialRecords({ ...users, patients, appointments });
  await seedClinicalRecords({ ...users, patients, appointments });
  await seedSettings(users);
  await seedCounters();

  const [userCount, patientCount, appointmentCount] = await Promise.all([
    User.countDocuments(),
    Patient.countDocuments(),
    Appointment.countDocuments(),
  ]);

  console.log(`Seeded synthetic UAT data in ${databaseName} on ${parsedMongoUri.hostname}`);
  console.log(`Counts: ${userCount} users, ${patientCount} patients, ${appointmentCount} appointments`);
  console.log('Test usernames: uat-admin, uat-therapist, uat-reception');
};

main()
  .catch((error) => {
    console.error(`UAT seed failed: ${error.message}`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
