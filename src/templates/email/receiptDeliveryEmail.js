const { renderEmailTemplate } = require('./baseEmailTemplate');
const { formatCurrency, formatLongDate } = require('../receipt/templidReceipt');
const { buildComplianceBlockHtml, buildComplianceTextLines } = require('./complianceBlocks');

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
    branding.phone || '07455 285117',
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

const formatPaymentMethod = (value) => {
  const normalized = (value || '').toString().toLowerCase();
  if (!normalized) {
    return '';
  }
  const labels = {
    card: 'Card',
    cash: 'Cash',
    transfer: 'Bank transfer',
    cheque: 'Cheque',
    insurance: 'Insurance',
    other: 'Other',
  };
  return labels[normalized] || value;
};

const resolvePatientName = (patient = {}, receipt = {}, billingContact = {}) => {
  const parts = [patient.first_name, patient.surname].filter(Boolean);
  if (parts.length) {
    return parts.join(' ');
  }
  if (patient.preferred_name) {
    return patient.preferred_name;
  }
  if (receipt.patient_name) {
    return receipt.patient_name;
  }
  return billingContact.name || 'Valued Client';
};

const buildReceiptSummaryHtml = ({
  receipt,
  highlightValue,
  paymentDateText,
  patientName,
}) => {
  const receiptDate = formatFriendlyDate(receipt.receipt_date || receipt.issue_date) || 'Issued today';
  return `
    <div class="card-spacing" style="margin:18px 0;padding:18px 22px;border:1px solid rgba(148,163,184,0.4);border-radius:18px;background:rgba(16,185,129,0.06);">
      <table width="100%" cellpadding="0" cellspacing="0" class="stack-sm" style="border-collapse:collapse;">
        <tr>
          <td style="padding:0 0 12px;">
            <div style="text-transform:uppercase;letter-spacing:0.08em;font-size:12px;color:#475569;">Amount paid</div>
            <div style="font-size:28px;font-weight:700;color:#0f172a;">${highlightValue}</div>
          </td>
          <td style="padding:0 0 12px;text-align:right;">
            <div style="font-size:15px;font-weight:600;color:#0f172a;">${escapeHtml(paymentDateText)}</div>
            <div style="color:#64748b;font-size:13px;">Payment date</div>
          </td>
        </tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border-collapse:collapse;color:#0f172a;font-size:14px;">
        <tr>
          <td style="padding:8px 0;color:#64748b;width:160px;">Receipt number</td>
          <td style="padding:8px 0;font-weight:600;">${escapeHtml(receipt.receipt_number || 'Pending')}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;">Receipt date</td>
          <td style="padding:8px 0;font-weight:600;">${escapeHtml(receiptDate)}</td>
        </tr>
        <tr>
          <td style="padding:8px 0;color:#64748b;">Patient</td>
          <td style="padding:8px 0;font-weight:600;">${escapeHtml(patientName)}</td>
        </tr>
      </table>
    </div>`;
};

const buildPlainTextEmail = ({
  receipt,
  paymentDateText,
  amountText,
  paymentLines,
  clinicLines,
  notesLines = [],
  complianceLines = [],
}) => {
  const filteredNotes = notesLines.filter(Boolean);
  const lines = [
    `Receipt ${receipt.receipt_number}`,
    `Receipt date: ${formatFriendlyDate(receipt.receipt_date)}`,
    `Payment date: ${paymentDateText}`,
    `Amount paid: ${amountText}`,
    '',
  ];

  if (filteredNotes.length) {
    lines.push(...filteredNotes, '');
  }

  lines.push('A PDF copy of this receipt is attached.');
  lines.push('');

  if (paymentLines.length) {
    lines.push('Payment details:');
    lines.push(...paymentLines);
  }

  if (complianceLines.length) {
    lines.push('', ...complianceLines);
  }

  if (clinicLines.length) {
    lines.push('', clinicLines.join(' | '));
  }

  return lines.join('\n');
};

const buildReceiptDeliveryEmail = ({
  receipt,
  billingContact,
  clinicSettings,
  patient,
}) => {
  const branding = clinicSettings?.branding || {};
  const clinicLines = buildFooterLines(branding);
  const complianceLines = buildComplianceTextLines(branding);
  const amountPaid = Number(receipt?.amount_paid ?? 0);
  const highlightValue = formatCurrency(amountPaid, receipt.currency || 'GBP');
  const paymentDate = receipt.payment_date ? formatFriendlyDate(receipt.payment_date) : 'Payment received';
  const patientName = resolvePatientName(patient, receipt, billingContact);
  const notesLines = [
    `Hi ${billingContact?.name || 'there'}, your payment has been received and a receipt is attached for your records.`,
    receipt.invoice_number ? `Reference invoice: ${receipt.invoice_number}.` : 'Thank you for your payment.',
  ];
  const paymentLines = [
    receipt.invoice_number ? `Invoice: ${receipt.invoice_number}` : null,
    receipt.payment_id ? `Payment ID: ${receipt.payment_id}` : null,
    receipt.method ? `Payment method: ${formatPaymentMethod(receipt.method)}` : null,
    receipt.reference ? `Reference: ${receipt.reference}` : null,
    receipt.payment_date ? `Payment date: ${formatFriendlyDate(receipt.payment_date)}` : null,
  ].filter(Boolean);

  const content = `
    <p style="margin:0 0 18px;color:#0f172a;">Thank you for your payment. A PDF receipt is attached for your records.</p>
    ${buildReceiptSummaryHtml({
      receipt,
      highlightValue,
      paymentDateText: paymentDate,
      patientName,
    })}
    <p style="margin:0 0 12px;color:#475569;">Please keep this receipt for your reference. If you need anything else, just reply to this email.</p>
    ${buildComplianceBlockHtml(branding)}
  `;

  const html = renderEmailTemplate({
    heading: 'Payment receipt',
    intro: `Amount paid: ${highlightValue}`,
    content,
    previewText: `Receipt ${receipt.receipt_number} for ${highlightValue}`,
    footerLines: clinicLines,
    brand: branding,
  });

  const text = buildPlainTextEmail({
    receipt,
    paymentDateText: paymentDate,
    amountText: highlightValue,
    paymentLines,
    clinicLines,
    notesLines,
    complianceLines,
  });

  return {
    subject: `Receipt ${receipt.receipt_number} (${highlightValue})`,
    html,
    text,
  };
};

module.exports = {
  buildReceiptDeliveryEmail,
};
