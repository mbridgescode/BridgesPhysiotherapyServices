const {
  escapeHtml,
  formatCurrency,
  formatLongDate,
  getDefaultLogoDataUri,
} = require('./invoiceTemplate');

const formatAddressLines = (address) => {
  if (!address) {
    return [];
  }
  if (typeof address === 'string') {
    return address.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  }
  return [
    address.line1,
    address.line2,
    address.city,
    address.state,
    address.postcode,
    address.country,
  ].filter(Boolean).map(String);
};

const formatPaymentDates = (entry) => {
  const dates = Array.isArray(entry?.payment_dates) && entry.payment_dates.length > 0
    ? entry.payment_dates
    : (entry?.payment_date ? [entry.payment_date] : []);
  return dates.map(formatLongDate).filter(Boolean).join(', ');
};

const renderPaymentSummaryTemplate = ({
  summary = {},
  clinicSettings = {},
  includeWrapper = true,
} = {}) => {
  const branding = clinicSettings?.branding || {};
  const clinicName = branding.clinic_name || 'Bridges Physiotherapy Services';
  const logoSrc = branding.logo_url || getDefaultLogoDataUri();
  const patient = summary.patient || {};
  const patientName = patient.name || 'Patient';
  const patientAddress = formatAddressLines(patient.address);
  const billingContact = summary.billingContact;
  const practitionerNames = Array.isArray(summary.practitionerNames)
    ? summary.practitionerNames
    : [];
  const entries = Array.isArray(summary.entries) ? summary.entries : [];
  const currency = summary.currency || entries[0]?.currency || 'GBP';
  const totalAmountPaid = Number(summary.totalAmountPaid || 0);
  const sessionCount = Number(summary.sessionCount || entries.length);
  const businessDetails = [branding.address, branding.phone, branding.email, branding.website]
    .filter(Boolean)
    .map((value) => escapeHtml(value));

  const rowMarkup = entries.map((entry) => `
    <tr>
      <td>${escapeHtml(formatLongDate(entry.session_date) || '-')}</td>
      <td>${escapeHtml(entry.treatment_description || '-')}</td>
      <td>${escapeHtml(entry.invoice_number || '-')}</td>
      <td class="amount">${escapeHtml(formatCurrency(entry.amount_paid, entry.currency || currency))}</td>
      <td>${escapeHtml(formatPaymentDates(entry) || '-')}</td>
    </tr>`);
  const tableHeaderHtml = `
    <thead>
      <tr>
        <th>Date</th>
        <th>Treatment / Service</th>
        <th>Invoice Number</th>
        <th>Amount Paid</th>
        <th>Payment Date</th>
      </tr>
    </thead>`;
  const rowChunks = [];
  const chunkSize = 12;
  for (let index = 0; index < entries.length; index += chunkSize) {
    rowChunks.push(rowMarkup.slice(index, index + chunkSize).join(''));
  }
  const paymentTablesHtml = (rowChunks.length > 0 ? rowChunks : [''])
    .map((chunk, index) => `
      <div class="payment-table-block${index > 0 ? ' continuation' : ''}">
        <table class="payment-table">
          ${tableHeaderHtml}
          <tbody>${chunk}</tbody>
        </table>
      </div>`)
    .join('');

  const patientAddressHtml = patientAddress.length
    ? `<div class="detail-muted">${patientAddress.map((line) => escapeHtml(line)).join('<br />')}</div>`
    : '';
  const billingContactHtml = billingContact?.name
    ? `
      <div class="detail-block">
        <div class="detail-label">Billing Contact</div>
        <div class="detail-value">${escapeHtml(billingContact.name)}</div>
      </div>`
    : '';
  const practitionerHtml = practitionerNames.length
    ? `
      <div class="detail-block">
        <div class="detail-label">Practitioner</div>
        <div class="detail-value">${escapeHtml(practitionerNames.join(', '))}</div>
      </div>`
    : '';

  const styles = `
    @page { size: A4; margin: 0; }
    html, body { background: #ffffff; }
    body {
      margin: 0;
      color: #1b2134;
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 12px;
      line-height: 1.5;
    }
    .summary-wrapper { padding: 24px 0 32px; background: #ffffff; }
    .summary-card {
      width: 100%;
      max-width: 820px;
      margin: 0 auto;
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 18px;
      overflow: hidden;
    }
    .masthead {
      display: flex;
      justify-content: space-between;
      gap: 28px;
      padding: 30px 42px 26px;
      background: linear-gradient(135deg, #f7fbff 0%, #ffffff 72%);
      border-bottom: 1px solid #e2e8f0;
    }
    .brand-block { display: flex; align-items: center; gap: 18px; min-width: 0; }
    .brand-logo img { display: block; width: auto; max-width: 126px; max-height: 62px; object-fit: contain; }
    .brand-name { color: #1f3e82; font-size: 18px; font-weight: 700; letter-spacing: .12em; text-transform: uppercase; }
    .brand-details { color: #64748b; margin-top: 7px; line-height: 1.65; }
    .document-heading { min-width: 240px; text-align: right; align-self: center; }
    .document-kicker { color: #5c6ac4; font-size: 10px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; }
    .document-title { color: #101738; font-size: 22px; font-weight: 700; line-height: 1.2; margin-top: 7px; }
    .patient-band { padding: 24px 42px; background: #ffffff; border-bottom: 1px solid #e2e8f0; }
    .patient-grid { display: grid; grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr); gap: 18px; }
    .detail-block { min-width: 0; }
    .detail-label { color: #5c6ac4; font-size: 10px; font-weight: 700; letter-spacing: .18em; text-transform: uppercase; margin-bottom: 5px; }
    .detail-value { color: #1c284f; font-size: 14px; font-weight: 600; overflow-wrap: anywhere; }
    .detail-muted { color: #64748b; margin-top: 5px; overflow-wrap: anywhere; }
    .table-section { padding: 28px 42px 20px; }
    .section-heading { color: #5c6ac4; font-size: 10px; font-weight: 700; letter-spacing: .2em; text-transform: uppercase; margin-bottom: 12px; }
    .payment-table { width: 100%; border-collapse: collapse; table-layout: fixed; }
    .payment-table th { padding: 11px 10px; background: #f1f5fb; border-bottom: 2px solid #5c6ac4; color: #40517e; font-size: 9.5px; letter-spacing: .08em; text-align: left; text-transform: uppercase; }
    .payment-table td { padding: 12px 10px; border-bottom: 1px solid #e6ecf5; vertical-align: top; overflow-wrap: anywhere; }
    .payment-table th:nth-child(1), .payment-table td:nth-child(1) { width: 16%; }
    .payment-table th:nth-child(2), .payment-table td:nth-child(2) { width: 31%; }
    .payment-table th:nth-child(3), .payment-table td:nth-child(3) { width: 17%; }
    .payment-table th:nth-child(4), .payment-table td:nth-child(4) { width: 17%; }
    .payment-table th:nth-child(5), .payment-table td:nth-child(5) { width: 19%; }
    .payment-table .amount { text-align: right; white-space: nowrap; font-variant-numeric: tabular-nums; }
    .payment-table-block { page-break-inside: avoid; break-inside: avoid; }
    .payment-table-block.continuation { page-break-before: always; }
    .payment-table thead { display: table-header-group; }
    .payment-table tr { page-break-inside: avoid; break-inside: avoid; }
    .summary-box { margin: 10px 42px 25px; padding: 18px 22px; border: 1px solid #dbe5f2; border-radius: 12px; background: #f8fbff; page-break-inside: avoid; break-inside: avoid; }
    .summary-row { display: flex; justify-content: space-between; gap: 20px; padding: 5px 0; }
    .summary-row strong { color: #101738; font-size: 15px; }
    .statement { margin: 0 42px 28px; padding-top: 18px; border-top: 1px solid #e2e8f0; color: #475569; }
    .footer { padding: 14px 42px; border-top: 1px solid #e2e8f0; text-align: center; color: #64748b; font-size: 10px; }
    .footer span + span::before { content: ' | '; color: #cbd5e1; margin: 0 8px; }
    @media print {
      .summary-card { border: 0; border-radius: 0; }
      .summary-wrapper { padding: 0; }
    }
  `;

  const markup = `
    <div class="summary-wrapper">
      <main class="summary-card">
        <section class="masthead">
          <div class="brand-block">
            <div class="brand-logo"><img src="${escapeHtml(logoSrc)}" alt="${escapeHtml(`${clinicName} logo`)}" /></div>
            <div>
              <div class="brand-name">${escapeHtml(clinicName)}</div>
              <div class="brand-details">${businessDetails.join('<br />')}</div>
            </div>
          </div>
          <div class="document-heading">
            <div class="document-kicker">BRIDGES PHYSIOTHERAPY</div>
            <div class="document-title">PAYMENT SUMMARY /<br />PROOF OF PAYMENT</div>
          </div>
        </section>

        <section class="patient-band">
          <div class="patient-grid">
            <div class="detail-block">
              <div class="detail-label">Patient</div>
              <div class="detail-value">${escapeHtml(patientName)}</div>
              ${patientAddressHtml}
            </div>
            <div class="detail-block">
              <div class="detail-label">Patient Reference</div>
              <div class="detail-value">${escapeHtml(patient.patient_id ? `#${patient.patient_id}` : '-')}</div>
            </div>
            ${billingContactHtml || '<div></div>'}
          </div>
          ${practitionerHtml ? `<div class="patient-grid" style="margin-top:18px;grid-template-columns:1fr 2fr 1fr;">${practitionerHtml}<div></div><div></div></div>` : ''}
        </section>

        <section class="table-section">
          <div class="section-heading">Paid treatment sessions</div>
          ${paymentTablesHtml}
        </section>

        <section class="summary-box">
          <div class="summary-row"><span>Number of sessions</span><strong>${escapeHtml(String(sessionCount))}</strong></div>
          <div class="summary-row"><span>Total amount paid</span><strong>${escapeHtml(formatCurrency(totalAmountPaid, currency))}</strong></div>
        </section>

        <p class="statement">This document provides a summary of payments recorded for the treatment sessions listed above.</p>

        <footer class="footer">
          <span>${escapeHtml(clinicName)}</span>
          ${branding.email ? `<span>${escapeHtml(branding.email)}</span>` : ''}
          ${branding.phone ? `<span>${escapeHtml(branding.phone)}</span>` : ''}
        </footer>
      </main>
    </div>`;

  if (!includeWrapper) {
    return `<style>${styles}</style>${markup}`;
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Payment Summary - ${escapeHtml(patientName)}</title>
    <style>${styles}</style>
  </head>
  <body>${markup}</body>
</html>`;
};

module.exports = { renderPaymentSummaryTemplate };
