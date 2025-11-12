const { renderEmailTemplate } = require('./baseEmailTemplate');
const {
  normalizePaymentInstructionLines,
  formatCurrency,
  formatLongDate,
} = require('../invoice/templidInvoice');

const DEFAULT_CANCELLATION_POLICY_URL =
  process.env.CANCELLATION_POLICY_URL || 'https://www.bridgesphysiotherapy.co.uk/cancellation-charges';

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

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

  lines.push('A PDF copy of this invoice is attached.');
  lines.push('');

  lines.push('Payment instructions:');
  if (filteredPayments.length) {
    lines.push(...filteredPayments);
  }

  if (clinicLines.length) {
    lines.push('', clinicLines.join(' | '));
  }

  return lines.join('\n');
};

const resolvePatientName = (patient = {}, invoice = {}, billingContact = {}) => {
  const parts = [patient.first_name, patient.surname].filter(Boolean);
  if (parts.length) {
    return parts.join(' ');
  }
  if (patient.preferred_name) {
    return patient.preferred_name;
  }
  if (invoice.patient_name) {
    return invoice.patient_name;
  }
  return billingContact.name || 'Valued Client';
};

const buildInvoiceSummaryHtml = ({
  invoice,
  highlightValue,
  dueDateText,
  patientName,
}) => {
  const issueDate = formatFriendlyDate(invoice.issue_date) || 'Issued today';
  return `
    <div class="card-spacing" style="margin:18px 0;padding:18px 22px;border:1px solid rgba(148,163,184,0.4);border-radius:18px;background:rgba(99,102,241,0.04);">
      <table width="100%" cellpadding="0" cellspacing="0" class="stack-sm" style="border-collapse:collapse;">
        <tr>
          <td style="padding:0 0 12px;">
            <div style="text-transform:uppercase;letter-spacing:0.08em;font-size:12px;color:#475569;">Amount due</div>
            <div style="font-size:28px;font-weight:700;color:#0f172a;">${highlightValue}</div>
          </td>
          <td style="padding:0 0 12px;text-align:right;">
            <div style="font-size:15px;font-weight:600;color:#0f172a;">${escapeHtml(dueDateText)}</div>
            <div style="color:#64748b;font-size:13px;">Due date</div>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border-collapse:collapse;color:#0f172a;font-size:14px;">
        <tr>
          <td style="padding:8px 0;color:#64748b;width:160px;">Invoice number</td>
          <td style="padding:8px 0;font-weight:600;">${escapeHtml(invoice.invoice_number || 'Pending')}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;">Issue date</td>
          <td style="padding:8px 0;font-weight:600;">${escapeHtml(issueDate)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;">Patient</td>
          <td style="padding:8px 0;font-weight:600;">${escapeHtml(patientName)}</td>
        </tr>
      </table>
    </div>`;
};

const buildPaymentInstructionsHtml = (lines = []) => {
  if (!lines.length) {
    return '';
  }
  const items = lines
    .map((line) => `<li style="margin-bottom:6px;">${escapeHtml(line)}</li>`)
    .join('');
  return `
    <div class="card-spacing" style="margin-top:16px;padding:16px 18px;border:1px solid rgba(148,163,184,0.35);border-radius:16px;">
      <strong style="display:block;margin-bottom:8px;color:#0f172a;">Payment instructions</strong>
      <ul style="margin:0;padding-left:20px;color:#475569;line-height:1.6;">${items}</ul>
    </div>`;
};

const buildNotesHtml = (heading, lines = []) => {
  const filtered = lines.filter(Boolean);
  if (!filtered.length) {
    return '';
  }
  return `
    <div class="card-spacing" style="margin-top:16px;padding:16px 18px;background:rgba(15,23,42,0.04);border-radius:16px;">
      <strong style="display:block;margin-bottom:8px;color:#0f172a;">${escapeHtml(heading || 'Notes')}</strong>
      <div style="color:#475569;line-height:1.6;">
        ${filtered.map((line) => `<div>${escapeHtml(line)}</div>`).join('')}
      </div>
    </div>`;
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
  const patientName = resolvePatientName(patient, invoice, billingContact);
  const content = `
    <p style="margin:0 0 18px;color:#0f172a;">Thank you for choosing Bridges Physiotherapy Services. Your invoice is ready and attached as a PDF.</p>
    ${buildInvoiceSummaryHtml({
      invoice,
      highlightValue,
      dueDateText: dueDate,
      patientName,
    })}
    <p style="margin:0 0 12px;color:#475569;">Please review the attached document at your convenience. A PDF copy has been included for your records.</p>
    ${buildPaymentInstructionsHtml(paymentLines)}
    ${buildNotesHtml('Helpful notes', notesLines)}
  `;

  const html = renderEmailTemplate({
    heading: 'Invoice ready',
    intro: `Balance due: ${highlightValue}`,
    content,
    previewText: `Invoice ${invoice.invoice_number} due ${dueDate}`,
    footerLines: clinicLines,
    brand: branding,
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

  const patientName = resolvePatientName(patient, invoice, billingContact);
  const content = `
    <p style="margin:0 0 18px;color:#0f172a;">
      A cancellation fee has been applied for ${escapeHtml(treatmentSummary)} on ${escapeHtml(
        friendlyAppointmentDate,
      )}. A PDF copy of the invoice is attached.
    </p>
    ${buildInvoiceSummaryHtml({
      invoice,
      highlightValue,
      dueDateText: dueDate,
      patientName,
    })}
    ${buildPaymentInstructionsHtml(paymentLines)}
    ${buildNotesHtml('Cancellation notes', notesLines)}
  `;

  const html = renderEmailTemplate({
    heading: 'Cancellation fee invoice',
    intro: `Balance due: ${highlightValue}`,
    content,
    previewText: `Cancellation fee invoice ${invoice.invoice_number}`,
    footerLines: clinicLines,
    brand: branding,
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
