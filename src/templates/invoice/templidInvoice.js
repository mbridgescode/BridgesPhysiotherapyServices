const fs = require('fs');
const path = require('path');

const DEFAULT_ACCENT = '#5c6ac4';
const DEFAULT_TEXT = '#404040';
const DEFAULT_MUTED = '#475569';
const DEFAULT_BACKGROUND = '#f1f5f9';

const formatCurrency = (value = 0, currency = 'GBP') =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatLongDate = (value) => {
  if (!value) {
    return '';
  }
  const asDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return '';
  }
  return asDate.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
};

const escapeHtml = (value = '') =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const resolveClinicBranding = (clinicSettings = {}) => {
  const branding = clinicSettings?.branding || {};
  const taxDetails = clinicSettings?.tax || {};
  const accent = branding.primary_colour || DEFAULT_ACCENT;
  const clinicName = branding.clinic_name || 'Bridges Physiotherapy Services';
  const supplierLines = [
    clinicName,
    branding.phone ? `Phone: ${branding.phone}` : null,
    branding.email ? `Email: ${branding.email}` : null,
    branding.website ? `Website: ${branding.website}` : null,
    branding.address || null,
    taxDetails.registration_number ? `VAT: ${taxDetails.registration_number}` : null,
  ].filter(Boolean);
  return {
    clinicName,
    branding,
    accent,
    supplierLines,
  };
};

const resolvePatientAddressLines = (patient = {}, invoice = {}) => {
  if (invoice?.billing_contact_address) {
    return [invoice.billing_contact_address];
  }
  if (patient?.address) {
    const { line1, line2, city, state, postcode, country } = patient.address;
    return [line1, line2, city, state, postcode, country].filter(Boolean);
  }
  if (invoice?.patient_address) {
    return [invoice.patient_address];
  }
  return [];
};

const resolveCustomerLines = ({ invoice, patient, billingContact }) => {
  const resolvedPatientName = [patient?.first_name, patient?.surname].filter(Boolean).join(' ').trim();
  const fallbackName = resolvedPatientName
    || patient?.preferred_name
    || invoice?.billing_contact_name
    || 'Accounts Payable';
  const displayName = billingContact?.name || fallbackName;
  const clientId = invoice?.client_id || patient?.patient_id;
  const lines = [
    displayName,
    patient?.patient_id ? `Patient #${patient.patient_id}` : null,
    billingContact?.email || invoice?.billing_contact_email,
    billingContact?.phone || invoice?.billing_contact_phone,
    clientId ? `Client ref: ${clientId}` : null,
  ].filter(Boolean);
  const customerAddress = resolvePatientAddressLines(patient, invoice);
  return [...lines, ...customerAddress];
};

const resolveTotals = (invoice = {}) => {
  const totals = invoice?.totals || {};
  const net = totals.net ?? invoice.subtotal ?? 0;
  const tax = totals.tax ?? invoice.tax_total ?? 0;
  const gross = totals.gross ?? invoice.total_due ?? net + tax;
  const paid = totals.paid ?? invoice.total_paid ?? 0;
  const balance = totals.balance ?? invoice.balance_due ?? Math.max(gross - paid, 0);
  return {
    net,
    tax,
    gross,
    paid,
    balance,
  };
};

const normalizePaymentInstructionLines = (settings = {}) => {
  const instructions = settings?.payment_instructions;
  if (instructions?.text) {
    return instructions.text.split('\n').map((line) => line.trim()).filter(Boolean);
  }
  if (Array.isArray(instructions?.lines) && instructions.lines.length > 0) {
    return instructions.lines.map((line) => line.trim()).filter(Boolean);
  }
  return [
    'Bank: Banks of Banks',
    'Sort Code: 30-92-16',
    'Account Number: 80856460',
    'Reference: invoice number',
  ];
};

const resolveLogo = (clinicSettings = {}) => {
  const branding = clinicSettings?.branding || {};
  if (branding.logo_url) {
    return branding.logo_url;
  }
  return DEFAULT_LOGO_DATA_URI;
};

const formatLineItemRows = (invoice, currency) => {
  const lineItems = Array.isArray(invoice?.line_items) ? invoice.line_items : [];
  if (lineItems.length === 0) {
    const fallback = invoice?.totals?.gross ?? invoice?.total_due ?? 0;
    return `
      <tr>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;">1.</td>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;">
          Consultation
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(fallback, currency)}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:center;">1</td>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:center;">0%</td>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(fallback, currency)}</td>
        <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:right;">${formatCurrency(fallback, currency)}</td>
      </tr>`;
  }

  return lineItems
    .map((item, index) => {
      const quantity = Number(item.quantity) || 1;
      const unitPrice = Number(item.unit_price) || 0;
      const taxRate = Number(item.tax_rate) || 0;
      const discountAmount = Math.max(Number(item.discount_amount) || 0, 0);
      const baseAmount = Math.max(quantity * unitPrice - discountAmount, 0);
      const vatAmount = baseAmount * (taxRate / 100);
      const grossAmount = baseAmount + vatAmount;
      const desc = escapeHtml(item.description || 'Line item');
      const serviceDate = item.service_date || item.treatment_date;
      const friendlyDate = serviceDate ? formatLongDate(serviceDate) : '';
      const appointmentNumber = Number(item.patient_appointment_number);
      const metaBits = [];
      if (friendlyDate) {
        metaBits.push(`Treatment date: ${friendlyDate}`);
      }
      if (!Number.isNaN(appointmentNumber) && appointmentNumber > 0) {
        metaBits.push(`Appointment #${appointmentNumber}`);
      } else if (item.appointment_id) {
        metaBits.push(`Appointment #${item.appointment_id}`);
      }
      if (discountAmount > 0) {
        metaBits.push(`Discount applied: ${formatCurrency(discountAmount, currency)}`);
      }
      if (item.meta) {
        metaBits.push(item.meta);
      }
      if (item.notes) {
        metaBits.push(item.notes);
      }

      return `
        <tr>
          <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;color:${DEFAULT_TEXT};">${index + 1}.</td>
          <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;color:${DEFAULT_TEXT};">
            <div style="font-weight:600;">${desc}</div>
            ${
              metaBits.length
                ? `<div style="margin-top:4px;font-size:12px;color:${DEFAULT_MUTED};">${metaBits
                    .map((bit) => escapeHtml(bit))
                    .join('<br />')}</div>`
                : ''
            }
          </td>
          <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:right;color:${DEFAULT_TEXT};">${formatCurrency(unitPrice, currency)}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:${DEFAULT_TEXT};">${quantity}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:center;color:${DEFAULT_TEXT};">${taxRate}%</td>
          <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:right;color:${DEFAULT_TEXT};">${formatCurrency(baseAmount, currency)}</td>
          <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:right;color:${DEFAULT_TEXT};">${formatCurrency(grossAmount, currency)}</td>
        </tr>`;
    })
    .join('');
};

const buildNotesHtml = (heading, notesLines = []) => {
  const safeLines = Array.isArray(notesLines) ? notesLines.filter(Boolean) : [];
  if (!safeLines.length) {
    return '';
  }
  return `
    <div style="padding:40px 56px 32px 56px;">
      <p style="margin:0 0 8px;font-weight:700;color:${DEFAULT_TEXT};text-transform:uppercase;letter-spacing:0.04em;">${escapeHtml(
        heading || 'Notes',
      )}</p>
      <div style="font-size:14px;color:${DEFAULT_TEXT};line-height:1.6;">
        ${safeLines.map((line) => `<p style="margin:0 0 8px;">${escapeHtml(line)}</p>`).join('')}
      </div>
    </div>`;
};

const buildPaymentDetailsHtml = ({
  paymentLines,
  accent,
  invoiceNumber,
  balanceDue,
  dueDate,
  currency,
}) => `
  <div style="padding:0 56px 24px 56px;">
    <p style="margin:0 0 4px;font-weight:700;color:${accent};letter-spacing:0.04em;">PAYMENT DETAILS</p>
    <div style="font-size:14px;color:${DEFAULT_TEXT};line-height:1.6;">
      <p style="margin:0 0 6px;"><strong>Balance due:</strong> ${formatCurrency(balanceDue, currency)}</p>
      <p style="margin:0 0 6px;"><strong>Due date:</strong> ${dueDate || 'Due on receipt'}</p>
      <p style="margin:0 0 12px;"><strong>Reference:</strong> ${escapeHtml(invoiceNumber || 'Invoice')}</p>
      ${paymentLines.map((line) => `<p style="margin:0 0 4px;">${escapeHtml(line)}</p>`).join('')}
    </div>
  </div>`;

const DEFAULT_LOGO_SVG = `<svg width="320" height="90" viewBox="0 0 320 90" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 70 Q50 15 90 70" stroke="#1F3E82" stroke-width="12" stroke-linecap="round" fill="none"/>
  <path d="M70 70 Q110 25 150 70" stroke="#1F3E82" stroke-width="12" stroke-linecap="round" fill="none"/>
  <path d="M130 70 Q170 20 210 70" stroke="#1F3E82" stroke-width="12" stroke-linecap="round" fill="none"/>
  <path d="M190 70 Q230 30 270 70" stroke="#1F3E82" stroke-width="12" stroke-linecap="round" fill="none"/>
  <path d="M230 70 Q270 35 310 70" stroke="#1F82C6" stroke-width="12" stroke-linecap="round" fill="none"/>
  <path d="M150 70 Q190 25 230 70" stroke="#23A8F3" stroke-width="12" stroke-linecap="round" fill="none"/>
  <rect x="38" y="52" width="10" height="26" rx="4" fill="#1F3E82"/>
  <rect x="86" y="48" width="10" height="30" rx="4" fill="#1F3E82"/>
  <rect x="134" y="46" width="10" height="32" rx="4" fill="#1F3E82"/>
  <rect x="182" y="48" width="10" height="30" rx="4" fill="#1F3E82"/>
  <rect x="230" y="52" width="10" height="26" rx="4" fill="#1F3E82"/>
  <rect x="260" y="50" width="10" height="28" rx="4" fill="#1F82C6"/>
  <rect x="288" y="54" width="10" height="24" rx="4" fill="#23A8F3"/>
</svg>`;

const INLINE_LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(DEFAULT_LOGO_SVG).toString('base64')}`;

const LOCAL_LOGO_PATH = path.resolve(__dirname, '../../logo/BPS Logo.png');

const DEFAULT_LOGO_DATA_URI = (() => {
  try {
    const file = fs.readFileSync(LOCAL_LOGO_PATH);
    return `data:image/png;base64,${file.toString('base64')}`;
  } catch (error) {
    return INLINE_LOGO_DATA_URI;
  }
})();

const renderTemplidInvoice = ({
  invoice,
  patient,
  billingContact,
  clinicSettings,
  notesHeading,
  notesLines,
  paymentInstructionLines,
  includeWrapper = false,
} = {}) => {
  const { clinicName, branding, accent, supplierLines } = resolveClinicBranding(clinicSettings);
  const customerLines = resolveCustomerLines({ invoice, patient, billingContact });
  const totals = resolveTotals(invoice);
  const currency = invoice?.currency || 'GBP';
  const paymentLines = paymentInstructionLines?.length
    ? paymentInstructionLines
    : normalizePaymentInstructionLines(clinicSettings);
  const issueDate = formatLongDate(invoice?.issue_date) || '—';
  const dueDate = formatLongDate(invoice?.due_date) || 'Due on receipt';
  const invoiceNumber = invoice?.invoice_number || 'Invoice';
  const logoSrc = resolveLogo(clinicSettings);
  const lineRows = formatLineItemRows(invoice, currency);
  const notesHtml = buildNotesHtml(notesHeading, notesLines);
  const paymentDetailsHtml = buildPaymentDetailsHtml({
    paymentLines,
    accent,
    invoiceNumber,
    balanceDue: totals.balance,
    dueDate,
    currency,
  });

  const totalsHtml = `
    <tr>
      <td colspan="5"></td>
      <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;color:#94a3b8;">Net total:</td>
      <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:${DEFAULT_TEXT};">${formatCurrency(
        totals.net,
        currency,
      )}</td>
    </tr>
    <tr>
      <td colspan="5"></td>
      <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;color:#94a3b8;">VAT total:</td>
      <td style="padding:12px 8px;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700;color:${DEFAULT_TEXT};">${formatCurrency(
        totals.tax,
        currency,
      )}</td>
    </tr>
    <tr>
      <td colspan="5"></td>
      <td style="padding:16px 8px;background:${accent};color:#fff;font-weight:700;">Total:</td>
      <td style="padding:16px 8px;background:${accent};color:#fff;text-align:right;font-weight:700;">${formatCurrency(
        totals.gross,
        currency,
      )}</td>
    </tr>`;

  const footerEmail = branding.email || 'm.bridgespt@gmail.com';
  const footerPhone = branding.phone || '074 5528 5117';
  const footerHtml = `
    <footer style="background:#e2e8f0;text-align:center;color:#475569;font-size:12px;padding:14px;">
      ${escapeHtml(clinicName)}
      <span style="color:#cbd5f5;padding:0 8px;">|</span>${escapeHtml(footerEmail)}
      <span style="color:#cbd5f5;padding:0 8px;">|</span>${escapeHtml(footerPhone)}
    </footer>`;

  const invoiceHtml = `
    <div style="padding:32px;background:${DEFAULT_BACKGROUND};font-family:'Inter','Segoe UI',Arial,sans-serif;">
      <div style="max-width:860px;margin:0 auto;background:#fff;border-radius:28px;overflow:hidden;box-shadow:0 25px 50px rgba(15,23,42,0.12);">
        <div style="padding:32px 56px;border-bottom:1px solid #e2e8f0;">
          <table style="width:100%;border-collapse:collapse;">
            <tr>
              <td style="vertical-align:top;">
                <img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(
                  clinicName,
                )}" style="height:52px;object-fit:contain;" />
              </td>
              <td style="width:40%;vertical-align:top;">
                <table style="width:100%;border-collapse:collapse;font-size:14px;color:${DEFAULT_MUTED};">
                  <tr>
                    <td style="border-right:1px solid ${accent};padding-right:16px;">
                      <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:${DEFAULT_MUTED};text-align:right;">Date</p>
                      <p style="margin:4px 0 0;font-weight:700;color:${DEFAULT_TEXT};text-align:right;">${issueDate}</p>
                    </td>
                    <td style="padding-left:16px;">
                      <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:${DEFAULT_MUTED};text-align:right;">Invoice #</p>
                      <p style="margin:4px 0 0;font-weight:700;color:${DEFAULT_TEXT};text-align:right;">${escapeHtml(
                        invoiceNumber,
                      )}</p>
                    </td>
                  </tr>
                  <tr>
                    <td colspan="2" style="padding-top:14px;">
                      <p style="margin:0;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:${DEFAULT_MUTED};text-align:right;">Due date</p>
                      <p style="margin:4px 0 0;font-weight:700;color:${accent};text-align:right;">${dueDate}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </div>

        <div style="display:flex;flex-wrap:wrap;background:#f8fafc;padding:32px 56px;gap:32px;border-bottom:1px solid #e2e8f0;">
          <div style="flex:1;min-width:260px;">
            <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:${DEFAULT_MUTED};">Supplier</p>
            <div style="font-size:14px;color:${DEFAULT_TEXT};line-height:1.6;">
              ${supplierLines.map((line) => `<p style="margin:0;">${escapeHtml(line)}</p>`).join('')}
            </div>
          </div>
          <div style="flex:1;min-width:260px;text-align:right;">
            <p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:0.08em;color:${DEFAULT_MUTED};">Customer</p>
            <div style="font-size:14px;color:${DEFAULT_TEXT};line-height:1.6;">
              ${customerLines.map((line) => `<p style="margin:0;">${escapeHtml(line)}</p>`).join('')}
            </div>
          </div>
        </div>

        <div style="padding:40px 56px 32px 56px;">
          <table style="width:100%;border-collapse:collapse;font-size:14px;color:${DEFAULT_TEXT};">
            <thead>
              <tr style="color:${accent};text-transform:uppercase;letter-spacing:0.08em;font-size:12px;">
                <th style="padding-bottom:12px;text-align:left;border-bottom:2px solid ${accent};">#</th>
                <th style="padding-bottom:12px;text-align:left;border-bottom:2px solid ${accent};">Product details</th>
                <th style="padding-bottom:12px;text-align:right;border-bottom:2px solid ${accent};">Price</th>
                <th style="padding-bottom:12px;text-align:center;border-bottom:2px solid ${accent};">Qty.</th>
                <th style="padding-bottom:12px;text-align:center;border-bottom:2px solid ${accent};">VAT</th>
                <th style="padding-bottom:12px;text-align:right;border-bottom:2px solid ${accent};">Subtotal</th>
                <th style="padding-bottom:12px;text-align:right;border-bottom:2px solid ${accent};">Subtotal + VAT</th>
              </tr>
            </thead>
            <tbody>
              ${lineRows}
              ${totalsHtml}
            </tbody>
          </table>
        </div>

        ${paymentDetailsHtml}
        ${notesHtml}
        ${footerHtml}
      </div>
    </div>`;

  if (!includeWrapper) {
    return invoiceHtml;
  }

  return `<!DOCTYPE html>
  <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>${escapeHtml(`Invoice ${invoiceNumber}`)}</title>
    </head>
    <body style="margin:0;padding:0;background:${DEFAULT_BACKGROUND};font-family:'Inter','Segoe UI',Arial,sans-serif;">
      ${invoiceHtml}
    </body>
  </html>`;
};

module.exports = {
  renderTemplidInvoice,
  normalizePaymentInstructionLines,
  formatCurrency,
  formatLongDate,
};
