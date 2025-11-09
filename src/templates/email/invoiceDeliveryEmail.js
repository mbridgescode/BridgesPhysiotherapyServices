const { renderEmailTemplate } = require('./baseEmailTemplate');

const formatCurrency = (value = 0, currency = 'GBP') =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) {
    return '-';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(date);
};

const buildFooterLines = (branding = {}) => {
  const lines = [];
  if (branding.clinic_name) {
    lines.push(branding.clinic_name);
  }
  const contactBits = [branding.phone, branding.email].filter(Boolean);
  if (contactBits.length) {
    lines.push(contactBits.join(' | '));
  }
  if (branding.website) {
    lines.push(branding.website);
  }
  return lines.length ? lines : ['Bridges Physiotherapy Services', '07950 463134 | megan@bridgesphysiotherapy.co.uk'];
};

const normalizePaymentInstructions = (settings = {}) => {
  const { payment_instructions: paymentInstructions } = settings;
  if (paymentInstructions?.text) {
    return paymentInstructions.text.split('\n').filter(Boolean);
  }
  if (paymentInstructions?.lines?.length) {
    return paymentInstructions.lines.filter(Boolean);
  }
  return [
    'Account Number: 80856460',
    'Sort Code: 30-92-16',
    'Reference: invoice number',
  ];
};

const buildInvoiceDeliveryEmail = ({ invoice, billingContact, clinicSettings }) => {
  const branding = clinicSettings?.branding || {};
  const clinicLines = buildFooterLines(branding);
  const totals = invoice?.totals || {};
  const balance = totals.balance ?? invoice.balance_due ?? totals.gross ?? 0;
  const highlightValue = formatCurrency(balance, invoice.currency || 'GBP');
  const dueDate = invoice.due_date ? formatDate(invoice.due_date) : 'Due on receipt';
  const intro = `Hi ${billingContact?.name || 'there'}, please find invoice ${invoice.invoice_number} attached for your records.`;
  const paymentLines = normalizePaymentInstructions(clinicSettings);

  const infoTable = `
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:16px;">
      <tbody>
        <tr>
          <td style="padding:6px 0;color:#475569;">Invoice number</td>
          <td style="padding:6px 0;font-weight:600;text-align:right;">${invoice.invoice_number}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#475569;">Issue date</td>
          <td style="padding:6px 0;font-weight:600;text-align:right;">${formatDate(invoice.issue_date)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#475569;">Due date</td>
          <td style="padding:6px 0;font-weight:600;text-align:right;">${dueDate}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;color:#475569;">Balance due</td>
          <td style="padding:6px 0;font-weight:600;text-align:right;">${highlightValue}</td>
        </tr>
      </tbody>
    </table>
  `;

  const paymentCard = `
    <div style="margin-top:18px;padding:16px 18px;background:rgba(99,102,241,0.08);border-radius:12px;">
      <strong style="display:block;margin-bottom:8px;">Payment instructions</strong>
      <p style="margin:0;color:#475569;">
        ${paymentLines.map((line) => line.replace(/\n/g, '<br/>')).join('<br/>')}
      </p>
    </div>
  `;

  const content = `
    <p style="margin:0 0 18px;">Total due: <strong>${highlightValue}</strong></p>
    ${infoTable}
    ${paymentCard}
    <p style="margin:18px 0 0;">If you have already settled this invoice, please ignore this message. Otherwise, kindly arrange payment at your earliest convenience.</p>
  `;

  const html = renderEmailTemplate({
    heading: 'Invoice Ready',
    intro,
    content,
    previewText: `Invoice ${invoice.invoice_number} - ${highlightValue}`,
    footerLines: clinicLines,
    brand: branding,
  });

  const textLines = [
    `Invoice ${invoice.invoice_number}`,
    `Issue date: ${formatDate(invoice.issue_date)}`,
    `Due date: ${dueDate}`,
    `Balance due: ${highlightValue}`,
    '',
    'Payment instructions:',
    ...paymentLines,
    '',
    clinicLines.join(' | '),
  ];

  return {
    subject: `Invoice ${invoice.invoice_number} (${highlightValue})`,
    html,
    text: textLines.join('\n'),
  };
};

module.exports = {
  buildInvoiceDeliveryEmail,
};
