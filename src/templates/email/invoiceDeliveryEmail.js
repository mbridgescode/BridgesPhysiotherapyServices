const {
  renderTemplidInvoice,
  normalizePaymentInstructionLines,
  formatCurrency,
  formatLongDate,
} = require('../invoice/templidInvoice');

const DEFAULT_CANCELLATION_POLICY_URL =
  process.env.CANCELLATION_POLICY_URL || 'https://www.bridgesphysiotherapy.co.uk/cancellation-charges';

const buildFooterLines = (branding = {}) => {
  const lines = [];
  if (branding.clinic_name) {
    lines.push(branding.clinic_name);
  } else {
    lines.push('Bridges Physiotherapy Services');
  }
  const contactBits = [
    branding.phone || '07950 463134',
    branding.email || 'megan@bridgesphysiotherapy.co.uk',
  ].filter(Boolean);
  if (contactBits.length) {
    lines.push(contactBits.join(' | '));
  }
  if (branding.website) {
    lines.push(branding.website);
  }
  if (branding.address) {
    lines.push(branding.address);
  }
  return lines;
};

const formatFriendlyDate = (value, fallback = '-') => formatLongDate(value) || fallback;

const buildPlainTextEmail = ({
  invoice,
  dueDateText,
  balanceText,
  paymentLines,
  clinicLines,
  notesLines = [],
}) => {
  const filteredNotes = notesLines.filter(Boolean);
  const filteredPayments = paymentLines.filter(Boolean);
  const lines = [
    `Invoice ${invoice.invoice_number}`,
    `Issue date: ${formatFriendlyDate(invoice.issue_date)}`,
    `Due date: ${dueDateText}`,
    `Balance due: ${balanceText}`,
    '',
  ];

  if (filteredNotes.length) {
    lines.push(...filteredNotes, '');
  }

  lines.push('Payment instructions:');
  if (filteredPayments.length) {
    lines.push(...filteredPayments);
  }

  if (clinicLines.length) {
    lines.push('', clinicLines.join(' | '));
  }

  return lines.join('\n');
};

const buildInvoiceDeliveryEmail = ({
  invoice,
  billingContact,
  clinicSettings,
  patient,
}) => {
  const branding = clinicSettings?.branding || {};
  const clinicLines = buildFooterLines(branding);
  const paymentLines = normalizePaymentInstructionLines(clinicSettings);
  const totals = invoice?.totals || {};
  const balance = totals.balance ?? invoice.balance_due ?? totals.gross ?? invoice.total_due ?? 0;
  const highlightValue = formatCurrency(balance, invoice.currency || 'GBP');
  const dueDate = invoice.due_date ? formatFriendlyDate(invoice.due_date) : 'Due on receipt';
  const greeting = `Hi ${billingContact?.name || 'there'}, please find invoice ${invoice.invoice_number} attached for your records.`;
  const notesLines = [
    greeting,
    'If you have already settled this invoice, please ignore this message.',
    'Otherwise, kindly arrange payment at your earliest convenience.',
  ];

  const html = renderTemplidInvoice({
    invoice,
    clinicSettings,
    billingContact,
    patient,
    notesHeading: 'Notes',
    notesLines,
    includeWrapper: true,
  });

  const text = buildPlainTextEmail({
    invoice,
    dueDateText: dueDate,
    balanceText: highlightValue,
    paymentLines,
    clinicLines,
    notesLines,
  });

  return {
    subject: `Invoice ${invoice.invoice_number} (${highlightValue})`,
    html,
    text,
  };
};

const buildCancellationFeeInvoiceEmail = ({
  invoice,
  billingContact,
  clinicSettings,
  appointment,
  patient,
}) => {
  const branding = clinicSettings?.branding || {};
  const clinicLines = buildFooterLines(branding);
  const paymentLines = normalizePaymentInstructionLines(clinicSettings);
  const totals = invoice?.totals || {};
  const balance = totals.balance ?? invoice.balance_due ?? totals.gross ?? invoice.total_due ?? 0;
  const highlightValue = formatCurrency(balance, invoice.currency || 'GBP');
  const dueDate = invoice.due_date ? formatFriendlyDate(invoice.due_date) : 'Due on receipt';
  const appointmentDate = appointment?.date || invoice.line_items?.[0]?.service_date;
  const friendlyAppointmentDate = appointmentDate ? formatFriendlyDate(appointmentDate) : 'the booked slot';
  const treatmentSummary = appointment?.treatment_description
    || invoice.line_items?.[0]?.description
    || 'your appointment';

  const notesLines = [
    `A same-day cancellation fee has been applied for ${treatmentSummary} on ${friendlyAppointmentDate}.`,
    'Because the session was cancelled on the day, the full appointment fee is payable in line with our policy.',
    `Policy: ${DEFAULT_CANCELLATION_POLICY_URL}`,
  ];

  const html = renderTemplidInvoice({
    invoice,
    clinicSettings,
    billingContact,
    patient,
    notesHeading: 'Cancellation notes',
    notesLines,
    includeWrapper: true,
  });

  const text = buildPlainTextEmail({
    invoice,
    dueDateText: dueDate,
    balanceText: highlightValue,
    paymentLines,
    clinicLines,
    notesLines,
  });

  return {
    subject: `Cancellation fee invoice ${invoice.invoice_number}`,
    html,
    text,
  };
};

module.exports = {
  buildInvoiceDeliveryEmail,
  buildCancellationFeeInvoiceEmail,
};
