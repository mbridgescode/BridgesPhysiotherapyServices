const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');

const loadFontDataUri = (...candidates) => {
  for (const candidate of candidates) {
    try {
      const resolvedPath = path.isAbsolute(candidate)
        ? candidate
        : require.resolve(candidate);
      const fontBuffer = fs.readFileSync(resolvedPath);
      return `data:font/woff2;base64,${fontBuffer.toString('base64')}`;
    } catch (error) {
      // eslint-disable-next-line no-continue
      continue;
    }
  }
  return null;
};

const INTER_REGULAR_FONT = loadFontDataUri(
  path.resolve(__dirname, 'fonts/inter-400.woff2'),
  '@fontsource/inter/files/inter-latin-400-normal.woff2',
);
const INTER_SEMIBOLD_FONT = loadFontDataUri(
  path.resolve(__dirname, 'fonts/inter-600.woff2'),
  '@fontsource/inter/files/inter-latin-600-normal.woff2',
);

const buildFontFaceCss = () => {
  const blocks = [];
  if (INTER_REGULAR_FONT) {
    blocks.push(`@font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 400;
        font-display: swap;
        src: url('${INTER_REGULAR_FONT}') format('woff2');
      }`);
  }
  if (INTER_SEMIBOLD_FONT) {
    blocks.push(`@font-face {
        font-family: 'Inter';
        font-style: normal;
        font-weight: 600;
        font-display: swap;
        src: url('${INTER_SEMIBOLD_FONT}') format('woff2');
      }`);
  }
  return blocks.join('\n');
};

const FONT_FACE_CSS = buildFontFaceCss();

const formatCurrency = (value = 0, currency = 'GBP') =>
  new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value) || 0);

const formatDate = (value) => {
  if (!value) {
    return '';
  }
  const asDate = new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return '';
  }
  return asDate.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: 'short',
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

const buildTotals = (invoice) => {
  const baseTotals = {
    net: invoice?.subtotal ?? 0,
    tax: invoice?.tax_total ?? 0,
    discount: invoice?.discount?.amount ?? 0,
    gross: invoice?.total_due ?? 0,
    paid: invoice?.total_paid ?? 0,
    balance: invoice?.balance_due ?? 0,
  };

  return {
    ...baseTotals,
    ...(invoice?.totals || {}),
  };
};

const buildLineItems = (invoice, currency) => {
  const lineItems = Array.isArray(invoice?.line_items) ? invoice.line_items : [];

  if (lineItems.length === 0) {
    const fallbackTotal = invoice?.totals?.gross ?? invoice?.total_due ?? 0;
    return `
      <tr>
        <td class="cell index">1.</td>
        <td class="cell description">Consultation</td>
        <td class="cell number">${formatCurrency(fallbackTotal, currency)}</td>
        <td class="cell number">1</td>
        <td class="cell number">0%</td>
        <td class="cell number discount"><span class="muted">&mdash;</span></td>
        <td class="cell number">${formatCurrency(fallbackTotal, currency)}</td>
      </tr>`;
  }

  return lineItems
    .map((item, index) => {
      const quantity = Number(item.quantity) || 1;
      const unitPrice = Number(item.unit_price) || 0;
      const taxRate = Number(item.tax_rate) || 0;
      const baseAmount = quantity * unitPrice;
      const discountAmountRaw = Number(item.discount_amount || 0);
      const discountAmount = Number.isNaN(discountAmountRaw)
        ? 0
        : Math.min(Math.max(discountAmountRaw, 0), baseAmount);
      const discountDisplay = discountAmount > 0
        ? `-${formatCurrency(discountAmount, currency)}`
        : '<span class="muted">&mdash;</span>';
      const total = Number(item.total ?? (baseAmount - discountAmount));
      const resolvedTotal = Number.isNaN(total) ? baseAmount - discountAmount : total;
      const serviceDate = formatDate(item.service_date || item.treatment_date);
      const metaLines = [];
      if (serviceDate) {
        metaLines.push(`Treatment date: ${serviceDate}`);
      }
      const patientAppointmentNumber = Number(item.patient_appointment_number);
      if (!Number.isNaN(patientAppointmentNumber) && patientAppointmentNumber > 0) {
        metaLines.push(`Appointment #${patientAppointmentNumber}`);
      } else if (item.appointment_id) {
        metaLines.push(`Appointment #${item.appointment_id}`);
      }
      if (item.meta) {
        metaLines.push(item.meta);
      }
      if (item.notes) {
        metaLines.push(item.notes);
      }
      const metaBlock = metaLines.length
        ? `<div class="meta">${metaLines.map((line) => escapeHtml(line)).join('<br />')}</div>`
        : '';

      return `
        <tr>
          <td class="cell index">${index + 1}.</td>
          <td class="cell description">
            <div>${escapeHtml(item.description || 'Line item')}</div>
            ${metaBlock}
          </td>
          <td class="cell number">${formatCurrency(unitPrice, currency)}</td>
          <td class="cell number">${quantity}</td>
          <td class="cell number">${taxRate}%</td>
          <td class="cell number discount">${discountDisplay}</td>
          <td class="cell number">${formatCurrency(resolvedTotal, currency)}</td>
        </tr>`;
    })
    .join('');
};

const buildPaymentInstructions = (clinicSettings, invoice) => {
  const { branding = {}, payment_instructions: paymentInstructions } = clinicSettings || {};
  if (paymentInstructions?.text) {
    return escapeHtml(paymentInstructions.text);
  }

  if (paymentInstructions?.lines?.length) {
    return paymentInstructions.lines.map((line) => escapeHtml(line)).join('<br />');
  }

  const namedRecipient = branding.payment_contact || 'Megan Bridges';
  const phone = branding.phone || '074 5528 5117';
  const email = branding.email || 'm.bridgespt@gmail.com';

  return [
    'Please make all payments to:',
    namedRecipient,
    'Account Number: 80856460',
    'Sort Code: 30-92-16',
  ].join('<br />');
};

const renderInvoiceTemplate = ({ invoice, clinicSettings }) => {
  const branding = clinicSettings?.branding || {};
  const currency = invoice?.currency || 'GBP';
  const totals = buildTotals(invoice);
  const clinicName = branding.clinic_name || 'Bridges Physiotherapy Services';
  const logoSrc = branding.logo_url ? escapeHtml(branding.logo_url) : DEFAULT_LOGO_DATA_URI;
  const billingName = invoice?.billing_contact_name || invoice?.patient_name || 'Valued Client';
  const billingEmail = invoice?.billing_contact_email || invoice?.patient_email || '';
  const billingPhone = invoice?.billing_contact_phone || invoice?.patient_phone || '';
  const invoiceDate = formatDate(invoice?.issue_date || new Date());
  const dueDate = formatDate(invoice?.due_date);
  const invoiceNumber = escapeHtml(invoice?.invoice_number || '');
  const amountDue = totals.balance || totals.gross || totals.net || 0;
  const dueText = dueDate ? `Due ${dueDate}` : 'Due on receipt';

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Invoice ${invoiceNumber}</title>
    <style>
      ${FONT_FACE_CSS}

      @page {
        size: A4;
        margin: 0;
      }

      html,
      body {
        background: #ffffff;
      }

      body {
        font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
        font-size: 12.5px;
        color: #1b2134;
        margin: 0;
        line-height: 1.6;
      }

      .invoice-wrapper {
        padding: 24px 0 32px;
        background: #ffffff;
      }

      .invoice-card {
        max-width: 860px;
        margin: 0 auto;
        background: #ffffff;
        border: 1px solid #e2e8f0;
        border-radius: 18px;
        box-shadow: 0 25px 45px rgba(15, 23, 42, 0.08);
        overflow: hidden;
      }

      .masthead {
        display: flex;
        flex-wrap: wrap;
        justify-content: space-between;
        gap: 32px;
        padding: 32px 56px 24px;
        align-items: flex-start;
      }

      .brand-block {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 12px;
        font-size: 13px;
        color: #475569;
        flex: 1;
        min-width: 280px;
      }

      .brand-logo img {
        display: block;
        max-height: 70px;
        width: auto;
      }

      .brand-info {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 6px;
        max-width: 320px;
      }

      .brand-name {
        font-size: 21px;
        font-weight: 600;
        text-transform: uppercase;
        letter-spacing: 0.35em;
        color: #1f3e82;
        margin-bottom: 4px;
      }

      .brand-details {
        line-height: 1.8;
      }

      .meta-block {
        min-width: 220px;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }

      .meta-item {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        border-bottom: 1px solid #e3e8f2;
        padding-bottom: 8px;
      }

      .meta-item:last-of-type {
        border-bottom: none;
        padding-bottom: 0;
      }

      .meta-label {
        font-size: 10px;
        letter-spacing: 0.2em;
        text-transform: uppercase;
        color: #94a3b8;
      }

      .meta-value {
        font-size: 15px;
        font-weight: 600;
        color: #1c284f;
        white-space: nowrap;
      }

      .info-band {
        padding: 20px 56px;
        border-top: 1px solid #e2e8f0;
        border-bottom: 1px solid #e2e8f0;
        background: #ffffff;
      }

      .info-block {
        max-width: 420px;
      }

      .info-title {
        font-size: 11px;
        letter-spacing: 0.3em;
        color: #5c6ac4;
        text-transform: uppercase;
        margin-bottom: 10px;
      }

      .info-text {
        color: #334155;
        line-height: 1.5;
      }

      .section-heading {
        font-size: 11px;
        letter-spacing: 0.3em;
        text-transform: uppercase;
        color: #5c6ac4;
        margin-bottom: 14px;
      }

      .line-items {
        width: 100%;
        border-collapse: collapse;
      }

      .line-items thead th {
        text-transform: uppercase;
        font-size: 10.5px;
        letter-spacing: 0.3em;
        color: #5c6ac4;
        border-bottom: 2px solid #5c6ac4;
        padding: 12px 14px;
        text-align: left;
      }

      .line-items tbody td {
        border-bottom: 1px solid #e6ecf5;
        padding: 14px;
        vertical-align: top;
      }

      .line-items tr.line-total td {
        border-bottom: none;
        border-top: 2px solid #5c6ac4;
        padding-top: 18px;
        padding-bottom: 6px;
        background: #f8fbff;
      }

      .line-items tr.line-total td.total-label {
        text-transform: uppercase;
        letter-spacing: 0.25em;
        font-size: 10px;
        color: #5c6ac4;
      }

      .line-items tr.line-total td.total-label span {
        text-transform: none;
        letter-spacing: normal;
        font-size: 11px;
        color: #94a3b8;
        margin-left: 10px;
        font-weight: 400;
      }

      .line-items tr.line-total td.total-value {
        font-size: 18px;
        font-weight: 600;
        color: #1f3e82;
      }

      .cell.index {
        width: 40px;
        color: #94a3b8;
      }

      .cell.description {
        color: #1b2134;
      }

      .cell .meta {
        margin-top: 4px;
        color: #94a3b8;
        font-size: 11px;
      }

      .cell.number {
        text-align: right;
        white-space: nowrap;
        font-variant-numeric: tabular-nums;
      }

      .cell.number.discount {
        color: #dc2626;
      }

      .cell.number.discount .muted {
        color: #cbd5f5;
      }

      .muted {
        color: #cbd5f5;
      }

      .items-section {
        padding: 32px 56px 24px;
      }

      .payment-section {
        padding: 16px 56px 40px;
      }

      .payment-card {
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        background: #f8fafc;
        padding: 20px 24px;
        line-height: 1.8;
        color: #1b2134;
      }

      .invoice-footer {
        text-align: center;
        font-size: 11px;
        color: #64748b;
        border-top: 1px solid #e2e8f0;
        padding: 16px 12px;
      }

      .invoice-footer .divider {
        color: #cbd5f5;
        margin: 0 10px;
      }
    </style>
  </head>
  <body>
    <div class="invoice-wrapper">
      <main class="invoice-card">
        <section class="masthead">
          <div class="brand-block">
            <div class="brand-logo">
              <img src="${logoSrc}" alt="${escapeHtml(`${clinicName} logo`)}" />
            </div>
            <div class="brand-info">
              <div class="brand-name">${escapeHtml(clinicName)}</div>
              <div class="brand-details">
                ${branding.address ? `${escapeHtml(branding.address)}<br />` : ''}
                ${branding.phone ? `${escapeHtml(branding.phone)}<br />` : ''}
                ${
                  branding.email
                    ? `<a href="mailto:${escapeHtml(branding.email)}" style="color:#1f3e82;text-decoration:none;">${escapeHtml(branding.email)}</a>`
                    : ''
                }
                ${
                  branding.website
                    ? `<br /><a href="${escapeHtml(branding.website)}" style="color:#1f3e82;text-decoration:none;">${escapeHtml(branding.website)}</a>`
                    : ''
                }
              </div>
            </div>
          </div>
          <div class="meta-block">
            <div class="meta-item">
              <div class="meta-label">Issue Date</div>
              <div class="meta-value">${invoiceDate || '-'}</div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Invoice Number</div>
              <div class="meta-value">${invoiceNumber || '-'}</div>
            </div>
            <div class="meta-item">
              <div class="meta-label">Due Date</div>
              <div class="meta-value">${dueDate || 'Due on receipt'}</div>
            </div>
          </div>
        </section>

        <section class="info-band">
          <div class="info-block">
            <div class="info-title">Bill To</div>
            <div class="info-text">
              <strong>${escapeHtml(billingName)}</strong><br />
              ${billingEmail ? `${escapeHtml(billingEmail)}<br />` : ''}
              ${billingPhone ? `${escapeHtml(billingPhone)}<br />` : ''}
              ${invoice?.billing_contact_address ? `${escapeHtml(invoice.billing_contact_address)}<br />` : ''}
              ${invoice?.patient_address ? `${escapeHtml(invoice.patient_address)}<br />` : ''}
              Client ID: ${escapeHtml(String(invoice?.client_id || invoice?.patient_id || '-'))}
            </div>
          </div>
        </section>

        <section class="items-section">
          <div class="section-heading">Services</div>
          <table class="line-items">
            <thead>
              <tr>
                <th style="width:40px;">#</th>
                <th>Product details</th>
                <th style="text-align:right;">Price</th>
                <th style="text-align:center;">Qty.</th>
                <th style="text-align:center;">Tax</th>
                <th style="text-align:right;">Discount</th>
                <th style="text-align:right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              ${buildLineItems(invoice, currency)}
              <tr class="line-total">
                <td colspan="6" class="cell total-label">
                  Amount Due <span>${dueText}</span>
                </td>
                <td class="cell number total-value">${formatCurrency(amountDue, currency)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <section class="payment-section">
          <div class="section-heading">Payment details</div>
          <div class="payment-card">
            <div class="payment-instructions">
              ${buildPaymentInstructions(clinicSettings, invoice)}
            </div>
          </div>
        </section>

        <footer class="invoice-footer">
          ${escapeHtml(clinicName)}
          <span class="divider">|</span>
          ${branding.email ? escapeHtml(branding.email) : 'm.bridgespt@gmail.com'}
          <span class="divider">|</span>
          ${branding.phone ? escapeHtml(branding.phone) : '074 5528 5117'}
        </footer>
      </main>
    </div>
  </body>
</html>`;
};

module.exports = {
  renderInvoiceTemplate,
};
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

const LOCAL_LOGO_PATH = path.resolve(__dirname, '../logo/BPS Logo.png');

const DEFAULT_LOGO_DATA_URI = (() => {
  try {
    const file = fs.readFileSync(LOCAL_LOGO_PATH);
    return `data:image/png;base64,${file.toString('base64')}`;
  } catch (error) {
    return INLINE_LOGO_DATA_URI;
  }
})();
