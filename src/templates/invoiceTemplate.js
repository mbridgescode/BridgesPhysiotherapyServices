const fs = require('fs');
const path = require('path');
const { Buffer } = require('buffer');

const TEMPLATE_CSS = `
*,
::before,
::after {
  box-sizing: border-box;
  border-width: 0;
  border-style: solid;
  border-color: transparent;
  font-family: 'Segoe UI', Arial, sans-serif;
}

body {
  margin: 0;
  background: #f8fafc;
  color: #1f2937;
}

.page {
  max-width: 820px;
  margin: 0 auto;
  padding: 32px 20px 48px;
}

.card {
  background: #ffffff;
  border-radius: 28px;
  box-shadow: 0 25px 45px rgba(15, 23, 42, 0.08);
  overflow: hidden;
}

.section {
  padding: 32px 56px;
}

.brand-left p {
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.45em;
  font-size: 12px;
  color: #1f2937;
  font-weight: 600;
}

.brand-left p.meta {
  letter-spacing: normal;
  font-size: 11px;
  color: #475569;
  font-weight: 400;
}

.meta-block {
  text-align: right;
  letter-spacing: 0.35em;
  font-size: 10px;
  color: #94a3b8;
  margin-bottom: 10px;
}

.meta-value {
  font-size: 16px;
  font-weight: 600;
  letter-spacing: normal;
  color: #1f2937;
}

.bill-to-label {
  letter-spacing: 0.4em;
  font-size: 10px;
  color: #5c6ac4;
  margin-bottom: 8px;
}

.bill-to-details p {
  margin: 2px 0;
  font-size: 13px;
  color: #475569;
}

.services-header,
.services-row {
  display: grid;
  grid-template-columns: 40px 1fr 90px 70px 70px 120px;
  gap: 12px;
  align-items: flex-start;
}

.services-header {
  background: #eff1fb;
  border-radius: 12px;
  padding: 12px 20px;
  font-size: 10px;
  letter-spacing: 0.4em;
  font-weight: 600;
  color: #5c6ac4;
}

.services-row {
  padding: 16px 20px;
  border-bottom: 1px solid #e2e8f0;
  font-size: 13px;
  color: #1f2937;
}

.services-row .meta {
  font-size: 11px;
  color: #94a3b8;
  margin-top: 6px;
}

.amount-row {
  margin: 24px 20px 0;
  background: #eef2ff;
  border-radius: 12px;
  padding: 16px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.amount-label {
  letter-spacing: 0.4em;
  font-size: 10px;
  color: #94a3b8;
}

.amount-label span {
  display: block;
  letter-spacing: normal;
  font-size: 12px;
  color: #475569;
  margin-top: 4px;
}

.amount-value {
  font-size: 20px;
  font-weight: 700;
  color: #1f2937;
}

.payment-details {
  margin-top: 20px;
  background: #f4f6ff;
  border: 1px solid #dbe0fb;
  border-radius: 16px;
  padding: 24px 28px;
  font-size: 13px;
  color: #1f2937;
}

.footer {
  text-align: center;
  padding: 18px 0;
  border-top: 1px solid #e2e8f0;
  font-size: 11px;
  color: #64748b;
  letter-spacing: 0.25em;
}
`;

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
  const asDate = value instanceof Date ? value : new Date(value);
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

const appendMetaLines = (item) => {
  const lines = [];
  const serviceDate = formatDate(item.service_date || item.treatment_date);
  if (serviceDate) {
    lines.push(`Treatment date: ${serviceDate}`);
  }
  if (item.patient_appointment_number) {
    lines.push(`Appointment #${item.patient_appointment_number}`);
  } else if (item.appointment_id) {
    lines.push(`Appointment #${item.appointment_id}`);
  }
  if (item.meta) {
    lines.push(item.meta);
  }
  if (item.notes) {
    lines.push(item.notes);
  }
  return lines;
};

const buildLineItems = (invoice, currency) => {
  const lineItems = Array.isArray(invoice?.line_items) ? invoice.line_items : [];

  if (lineItems.length === 0) {
    const fallbackTotal = invoice?.totals?.gross ?? invoice?.total_due ?? 0;
    return `
      <div class="services-row">
        <div>1.</div>
        <div>Consultation</div>
        <div style="text-align:right;">${formatCurrency(fallbackTotal, currency)}</div>
        <div style="text-align:center;">1</div>
        <div style="text-align:right;">0%</div>
        <div style="text-align:right;">${formatCurrency(fallbackTotal, currency)}</div>
      </div>`;
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
      const netAmount = Math.max(baseAmount - discountAmount, 0);
      const taxAmount = netAmount * (taxRate / 100);
      const grossAmount = netAmount + taxAmount;
      const metaLines = appendMetaLines(item);
      const metaBlock = metaLines.length
        ? `<div class="meta">${metaLines.map((line) => escapeHtml(line)).join('<br />')}</div>`
        : '';

      return `
        <div class="services-row">
          <div>${index + 1}.</div>
          <div>
            ${escapeHtml(item.description || 'Line item')}
            ${metaBlock}
          </div>
          <div style="text-align:right;">${formatCurrency(unitPrice, currency)}</div>
          <div style="text-align:center;">${quantity}</div>
          <div style="text-align:right;">${taxRate}%</div>
          <div style="text-align:right;">${formatCurrency(grossAmount, currency)}</div>
        </div>`;
    })
    .join('');
};

const buildPaymentInstructions = (invoice) => `
  <p>Please make all payments to:</p>
  <p>Megan Bridges</p>
  <p>Account Number: 80856460</p>
  <p>Sort Code: 30-92-16</p>
  <p>Payment Reference: ${escapeHtml(invoice?.invoice_number || '-')}</p>
`;

const DEFAULT_LOGO_SVG = `<svg width="220" height="60" viewBox="0 0 320 90" xmlns="http://www.w3.org/2000/svg">
  <path d="M10 70 Q50 15 90 70" stroke="#1F3E82" stroke-width="12" stroke-linecap="round" fill="none"/>
  <path d="M70 70 Q110 25 150 70" stroke="#1F3E82" stroke-width="12" stroke-linecap="round" fill="none"/>
  <path d="M130 70 Q170 20 210 70" stroke="#1F3E82" stroke-width="12" stroke-linecap="round" fill="none"/>
  <path d="M190 70 Q230 30 270 70" stroke="#1F3E82" stroke-width="12" stroke-linecap="round" fill="none"/>
  <path d="M230 70 Q270 35 310 70" stroke="#1F82C6" stroke-width="12" stroke-linecap="round" fill="none"/>
  <path d="M150 70 Q190 25 230 70" stroke="#23A8F3" stroke-width="12" stroke-linecap="round" fill="none"/>
</svg>`;

const INLINE_LOGO_DATA_URI = `data:image/svg+xml;base64,${Buffer.from(DEFAULT_LOGO_SVG).toString('base64')}`;
const LOCAL_LOGO_PATH = path.resolve(__dirname, '../logo/BPS Logo.png');

const resolveLogoSrc = (branding = {}) => {
  if (branding.logo_url) {
    return escapeHtml(branding.logo_url);
  }
  try {
    const file = fs.readFileSync(LOCAL_LOGO_PATH);
    return `data:image/png;base64,${file.toString('base64')}`;
  } catch (error) {
    return INLINE_LOGO_DATA_URI;
  }
};

const renderInvoiceTemplate = ({ invoice, clinicSettings }) => {
  const currency = invoice?.currency || 'GBP';
  const totals = buildTotals(invoice);
  const invoiceNumber = escapeHtml(invoice?.invoice_number || '—');
  const invoiceDate = formatDate(invoice?.issue_date || new Date()) || '—';
  const lineItemsHtml = buildLineItems(invoice, currency);
  const paymentHtml = buildPaymentInstructions(invoice);
  const logoSrc = resolveLogoSrc(clinicSettings?.branding);
  const billToLines = [
    invoice?.billing_contact_name || invoice?.patient_name || 'Valued Client',
    invoice?.billing_contact_email || invoice?.patient_email,
    invoice?.billing_contact_phone || invoice?.patient_phone,
    invoice?.client_id ? `Client ID: ${invoice.client_id}` : null,
  ].filter(Boolean).map((line) => `<p>${escapeHtml(line)}</p>`).join('');

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Invoice ${invoiceNumber}</title>
    <style>${TEMPLATE_CSS}</style>
  </head>
  <body>
    <div class="page">
      <div class="card">
        <div class="section" style="display:flex; justify-content:space-between; gap:32px;">
          <div class="brand-left">
            <div style="margin-bottom:12px;">
              <img src="${logoSrc}" alt="Clinic logo" style="height:48px;" />
            </div>
            <p>B R I D G E S</p>
            <p>P H Y S I O T H E R A P Y</p>
            <p>S E R V I C E S</p>
            <p class="meta">Megan@BridgesPhysiotherapy.co.uk</p>
            <p class="meta">www.bridgesphysiotherapy.co.uk</p>
          </div>
          <div style="text-align:right; min-width:220px;">
            <div class="meta-block">I S S U E   D A T E</div>
            <div class="meta-value">${invoiceDate}</div>
            <div class="meta-block" style="margin-top:20px;">I N V O I C E   N U M B E R</div>
            <div class="meta-value">${invoiceNumber}</div>
            <div class="meta-block" style="margin-top:20px;">D U E   D A T E</div>
            <div class="meta-value">${formatDate(invoice?.due_date) || 'Due on receipt'}</div>
          </div>
        </div>

        <div class="section" style="background:#f1f5f9;">
          <div class="bill-to-label">B I L L   T O</div>
          <div class="bill-to-details">
            ${billToLines}
          </div>
        </div>

        <div class="section">
          <div class="services-header">
            <div>#</div>
            <div>P R O D U C T   D E T A I L S</div>
            <div style="text-align:right;">P R I C E</div>
            <div style="text-align:center;">Q T Y .</div>
            <div style="text-align:right;">T A X</div>
            <div style="text-align:right;">A M O U N T</div>
          </div>
          <div>
            ${lineItemsHtml}
          </div>
          <div class="amount-row">
            <div class="amount-label">
              A M O U N T   D U E
              <span>Due ${formatDate(invoice?.due_date) || 'on receipt'}</span>
            </div>
            <div class="amount-value">${formatCurrency(totals.balance || totals.gross || 0, currency)}</div>
          </div>
        </div>

        <div class="section">
          <div class="bill-to-label">P A Y M E N T   D E T A I L S</div>
          <div class="payment-details">
            ${paymentHtml}
          </div>
        </div>

        <div class="footer">
          Bridges Physiotherapy Services | Megan@BridgesPhysiotherapy.co.uk | 074 5528 5117
        </div>
      </div>
    </div>
  </body>
</html>`;
};

module.exports = {
  renderInvoiceTemplate,
};
