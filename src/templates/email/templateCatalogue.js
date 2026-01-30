const { buildBookingConfirmationEmail } = require('./bookingConfirmationEmail');
const { buildInvoiceDeliveryEmail, buildCancellationFeeInvoiceEmail } = require('./invoiceDeliveryEmail');
const { buildReceiptDeliveryEmail } = require('./receiptDeliveryEmail');

const DAY_IN_MS = 24 * 60 * 60 * 1000;

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

const createSampleReceiptContext = ({
  receiptNumber = 'RCT-TEST-2001',
  amountPaid = 120,
} = {}) => {
  const context = createSampleInvoiceContext({
    invoiceNumber: 'INV-TEST-1003',
    amount: amountPaid,
  });
  const paymentDate = new Date();
  return {
    receipt: {
      receipt_id: 88001,
      receipt_number: receiptNumber,
      payment_id: 77001,
      invoice_number: context.invoice.invoice_number,
      patient_id: context.patient.patient_id,
      amount_paid: amountPaid,
      currency: context.invoice.currency,
      payment_date: paymentDate,
      receipt_date: paymentDate,
      method: 'card',
      reference: 'POS-12345',
      line_items: context.invoice.line_items,
      subtotal: context.invoice.subtotal,
      total_due: context.invoice.total_due,
      balance_due: 0,
      patient_name: context.invoice.patient_name,
      patient_email: context.invoice.patient_email,
      patient_phone: context.invoice.patient_phone,
      billing_contact_name: context.billingContact.name,
      billing_contact_email: context.billingContact.email,
      billing_contact_phone: context.billingContact.phone,
    },
    patient: context.patient,
    billingContact: context.billingContact,
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

const buildInitialAssessmentTestEmail = ({ clinicSettings }) => {
  const patient = createSamplePatient();
  const appointment = createSampleAppointment({
    treatment_description: 'Initial neurological physiotherapy assessment',
    date: new Date(Date.now() + (5 * DAY_IN_MS)),
  });
  const content = buildBookingConfirmationEmail({
    patientName: `${patient.first_name} ${patient.surname}`,
    appointments: [appointment],
    clinicSettings,
  });
  return {
    subject: content.subject,
    html: content.html,
    text: content.text,
    metadata: {
      appointment_id: appointment.appointment_id,
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

const buildReceiptDeliveryTestEmail = ({ clinicSettings }) => {
  const context = createSampleReceiptContext({
    receiptNumber: 'RCT-TEST-2001',
    amountPaid: 120,
  });
  const content = buildReceiptDeliveryEmail({
    receipt: context.receipt,
    billingContact: context.billingContact,
    clinicSettings,
    patient: context.patient,
  });
  return {
    subject: content.subject,
    html: content.html,
    text: content.text,
    metadata: {
      receipt_number: context.receipt.receipt_number,
    },
  };
};

const EMAIL_TEMPLATE_DEFINITIONS = [
  {
    id: 'booking_confirmation',
    label: 'Booking confirmation',
    description: 'Sent to patients when an appointment is scheduled.',
    build: buildBookingConfirmationTestEmail,
  },
  {
    id: 'initial_assessment',
    label: 'Initial assessment',
    description: 'Prepares patients for their first session with tips and policy links.',
    build: buildInitialAssessmentTestEmail,
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
  {
    id: 'receipt_delivery',
    label: 'Payment receipt',
    description: 'Sent after recording a payment (PDF receipt attached in production).',
    build: buildReceiptDeliveryTestEmail,
  },
];

const EMAIL_TEMPLATE_BUILDERS = EMAIL_TEMPLATE_DEFINITIONS.reduce((acc, definition) => {
  acc[definition.id] = definition.build;
  return acc;
}, {});

module.exports = {
  EMAIL_TEMPLATE_DEFINITIONS,
  EMAIL_TEMPLATE_BUILDERS,
};
