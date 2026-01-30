const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');

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

const receiptHasDiscount = (receipt) => {
  const lineItems = Array.isArray(receipt?.line_items) ? receipt.line_items : [];
  const lineDiscountApplied = lineItems.some(
    (item) => Number(item?.discount_amount || 0) > 0,
  );
  if (lineDiscountApplied) {
    return true;
  }
  const aggregateDiscount = Number(
    receipt?.discount?.amount
    ?? receipt?.discount_amount
    ?? receipt?.totals?.discount
    ?? 0,
  );
  return !Number.isNaN(aggregateDiscount) && aggregateDiscount > 0;
};

const buildLineItems = (receipt, currency, options = {}) => {
  const showDiscountColumn = Boolean(options.showDiscountColumn);
  const lineItems = Array.isArray(receipt?.line_items) ? receipt.line_items : [];

  if (lineItems.length === 0) {
    const fallbackTotal = receipt?.totals?.gross ?? receipt?.total_due ?? receipt?.amount_paid ?? 0;
    const discountCell = showDiscountColumn
      ? `<td class="cell number discount"><span class="muted">&mdash;</span></td>`
      : '';
    return `
      <tr>
        <td class="cell index">1.</td>
        <td class="cell description">Consultation</td>
        <td class="cell number">${formatCurrency(fallbackTotal, currency)}</td>
        <td class="cell number">1</td>
        ${discountCell}
        <td class="cell number">${formatCurrency(fallbackTotal, currency)}</td>
      </tr>`;
  }

  return lineItems
    .map((item, index) => {
      const quantity = Number(item.quantity) || 1;
      const unitPrice = Number(item.unit_price) || 0;
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
      const discountCell = showDiscountColumn
        ? `<td class="cell number discount">${discountDisplay}</td>`
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
          ${discountCell}
          <td class="cell number">${formatCurrency(resolvedTotal, currency)}</td>
        </tr>`;
    })
    .join('');
};

const formatAddressLines = (value) => {
  if (!value) {
    return [];
  }
  if (typeof value === 'string') {
    return value
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }
  if (typeof value === 'object') {
    const {
      line1,
      line2,
      city,
      state,
      postcode,
      postal_code,
      country,
    } = value;
    return [
      line1,
      line2,
      city,
      state,
      postcode || postal_code,
      country,
    ].filter(Boolean);
  }
  return [];
};

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

const buildPaymentDetails = ({
  receipt,
  currency,
}) => {
  const lines = [];
  const paymentDate = formatDate(receipt?.payment_date || receipt?.receipt_date);
  const methodLabel = formatPaymentMethod(receipt?.method);

  if (receipt?.invoice_number) {
    lines.push(`Invoice: ${receipt.invoice_number}`);
  }
  if (receipt?.payment_id) {
    lines.push(`Payment ID: ${receipt.payment_id}`);
  }
  if (paymentDate) {
    lines.push(`Payment date: ${paymentDate}`);
  }
  if (methodLabel) {
    lines.push(`Payment method: ${methodLabel}`);
  }
  if (receipt?.reference) {
    lines.push(`Reference: ${receipt.reference}`);
  }
  if (receipt?.balance_due !== undefined && receipt?.balance_due !== null) {
    lines.push(`Remaining balance: ${formatCurrency(receipt.balance_due, currency)}`);
  }

  if (!lines.length) {
    return '';
  }

  return lines
    .map((line) => escapeHtml(line))
    .join('<br />');
};

const buildNotesSection = (heading, lines = []) => {
  const normalized = lines
    .map((line) => (line === undefined || line === null ? '' : String(line).trim()))
    .filter(Boolean);
  if (!normalized.length) {
    return '';
  }
  const safeHeading = escapeHtml(heading || 'Notes');
  const items = normalized
    .map((line) => `<div>${escapeHtml(line)}</div>`)
    .join('');
  return `
    <section class="notes-section">
      <div class="section-heading">${safeHeading}</div>
      <div class="notes-card">
        ${items}
      </div>
    </section>`;
};

const renderReceiptTemplate = ({
  receipt = {},
  clinicSettings = {},
  billingContact = {},
  patient,
  notesHeading,
  notesLines,
  includeWrapper = true,
} = {}) => {
  const branding = clinicSettings?.branding || {};
  const currency = receipt?.currency || 'GBP';
  const clinicName = branding.clinic_name || 'Bridges Physiotherapy Services';
  const logoSrc = branding.logo_url ? escapeHtml(branding.logo_url) : DEFAULT_LOGO_DATA_URI;
  const billingName = billingContact?.name
    || receipt?.billing_contact_name
    || patient?.preferred_name
    || receipt?.patient_name
    || 'Valued Client';
  const billingEmail = billingContact?.email
    || receipt?.billing_contact_email
    || patient?.email
    || receipt?.patient_email
    || '';
  const billingPhone = billingContact?.phone
    || receipt?.billing_contact_phone
    || patient?.phone
    || receipt?.patient_phone
    || '';
  const receiptDate = formatDate(receipt?.receipt_date || receipt?.issue_date || new Date());
  const paymentDate = formatDate(receipt?.payment_date || receipt?.receipt_date);
  const receiptNumber = escapeHtml(receipt?.receipt_number || '');
  const amountPaid = Number(receipt?.amount_paid ?? receipt?.totals?.paid ?? 0);
  const paidText = paymentDate ? `Paid ${paymentDate}` : 'Paid in full';
  const clientId = receipt?.client_id || patient?.patient_id || receipt?.patient_id || '-';
  const addressLines = [
    ...formatAddressLines(billingContact?.address),
    ...formatAddressLines(receipt?.billing_contact_address),
    ...formatAddressLines(patient?.address),
    ...formatAddressLines(receipt?.patient_address),
  ].filter(Boolean);
  const uniqueAddressLines = [...new Set(addressLines)];
  const receiptForParts = [
    `<strong>${escapeHtml(billingName)}</strong>`,
    billingEmail ? escapeHtml(billingEmail) : null,
    billingPhone ? escapeHtml(billingPhone) : null,
    ...uniqueAddressLines.map((line) => escapeHtml(line)),
    clientId ? `Client ID: ${escapeHtml(String(clientId))}` : null,
  ].filter(Boolean);
  const receiptForHtml = receiptForParts.join('<br />');
  const paymentDetailsHtml = buildPaymentDetails({ receipt, currency });
  const notesSection = buildNotesSection(notesHeading, notesLines || []);
  const footerEmail = branding.email || 'm.bridgespt@gmail.com';
  const footerPhone = branding.phone || '074 5528 5117';
  const paymentSectionHtml = paymentDetailsHtml
    ? `
        <section class='payment-section'>
          <div class='section-heading'>Payment details</div>
          <div class='payment-card'>
            <div class='payment-instructions'>
              ${paymentDetailsHtml}
            </div>
          </div>
        </section>`
    : '';
  const showDiscountColumn = receiptHasDiscount(receipt);
  const lineItemsHtml = buildLineItems(receipt, currency, { showDiscountColumn });
  const discountHeaderCell = showDiscountColumn
    ? "<th style='text-align:right;'>Discount</th>"
    : '';
  const amountPaidLabelColspan = showDiscountColumn ? 5 : 4;

  const styles = `
      @page {
        size: A4;
        margin: 0;
      }

      html,
      body {
        background: #ffffff;
      }

      body {
        font-family: 'Segoe UI', Arial, sans-serif;
        font-size: 12.5px;
        color: #1b2134;
        margin: 0;
        line-height: 1.6;
      }

      .receipt-wrapper {
        padding: 24px 0 32px;
        background: #ffffff;
      }

      .receipt-card {
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
        display: block;
        font-size: 12px;
        color: #94a3b8;
        margin-top: 4px;
      }

      .line-items tr.line-total td.total-value {
        font-size: 18px;
        font-weight: 700;
        color: #101738;
      }

      .cell {
        padding: 12px 14px;
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
        padding: 16px 56px 32px;
      }

      .payment-card {
        border: 1px solid #e2e8f0;
        border-radius: 14px;
        background: #f8fafc;
        padding: 20px 24px;
        line-height: 1.8;
        color: #1b2134;
      }

      .notes-section {
        padding: 0 56px 32px;
      }

      .notes-card {
        border: 1px solid #e2e8f0;
        border-radius: 12px;
        background: #f8fafc;
        padding: 16px 20px;
        color: #1b2134;
        line-height: 1.6;
      }

      .notes-card div + div {
        margin-top: 8px;
      }

      .receipt-footer {
        text-align: center;
        font-size: 11px;
        color: #64748b;
        border-top: 1px solid #e2e8f0;
        padding: 16px 12px;
      }

      .receipt-footer .divider {
        color: #cbd5f5;
        margin: 0 10px;
      }
    `;

  const receiptMarkup = `
    <div class='receipt-wrapper'>
      <main class='receipt-card'>
        <section class='masthead'>
          <div class='brand-block'>
            <div class='brand-logo'>
              <img src='${logoSrc}' alt='${escapeHtml(`${clinicName} logo`)}' />
            </div>
            <div class='brand-info'>
              <div class='brand-name'>${escapeHtml(clinicName)}</div>
              <div class='brand-details'>
                ${branding.address ? `${escapeHtml(branding.address)}<br />` : ''}
                ${branding.phone ? `${escapeHtml(branding.phone)}<br />` : ''}
                ${
                  branding.email
                    ? `<a href='mailto:${escapeHtml(branding.email)}' style='color:#1f3e82;text-decoration:none;'>${escapeHtml(branding.email)}</a>`
                    : ''
                }
                ${
                  branding.website
                    ? `<br /><a href='${escapeHtml(branding.website)}' style='color:#1f3e82;text-decoration:none;'>${escapeHtml(branding.website)}</a>`
                    : ''
                }
              </div>
            </div>
          </div>
          <div class='meta-block'>
            <div class='meta-item'>
              <div class='meta-label'>Receipt Date</div>
              <div class='meta-value'>${receiptDate || '-'}</div>
            </div>
            <div class='meta-item'>
              <div class='meta-label'>Receipt Number</div>
              <div class='meta-value'>${receiptNumber || '-'}</div>
            </div>
            <div class='meta-item'>
              <div class='meta-label'>Payment Date</div>
              <div class='meta-value'>${paymentDate || '-'}</div>
            </div>
          </div>
        </section>

        <section class='info-band'>
          <div class='info-block'>
            <div class='info-title'>Receipt For</div>
            <div class='info-text'>
              ${receiptForHtml}
            </div>
          </div>
        </section>

        <section class='items-section'>
          <div class='section-heading'>Services</div>
          <table class='line-items'>
            <thead>
              <tr>
                <th style='width:40px;'>#</th>
                <th>Product details</th>
                <th style='text-align:right;'>Price</th>
                <th style='text-align:center;'>Qty.</th>
                ${discountHeaderCell}
                <th style='text-align:right;'>Amount</th>
              </tr>
            </thead>
            <tbody>
              ${lineItemsHtml}
              <tr class='line-total'>
                <td colspan='${amountPaidLabelColspan}' class='cell total-label'>
                  Amount Paid <span>${paidText}</span>
                </td>
                <td class='cell number total-value'>${formatCurrency(amountPaid, currency)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        ${paymentSectionHtml}
        ${notesSection}

        <footer class='receipt-footer'>
          ${escapeHtml(clinicName)}
          <span class='divider'>|</span>
          ${escapeHtml(footerEmail)}
          <span class='divider'>|</span>
          ${escapeHtml(footerPhone)}
        </footer>
      </main>
    </div>`;

  if (!includeWrapper) {
    return `<style>${styles}</style>${receiptMarkup}`;
  }

  return `<!doctype html>
<html lang='en'>
  <head>
    <meta charset='utf-8' />
    <title>Receipt ${receiptNumber}</title>
    <style>
${styles}
    </style>
  </head>
  <body>
    ${receiptMarkup}
  </body>
</html>`;
};

module.exports = {
  renderReceiptTemplate,
  formatCurrency,
  formatLongDate,
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
