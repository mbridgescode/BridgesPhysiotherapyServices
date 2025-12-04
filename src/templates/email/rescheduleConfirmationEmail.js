const { renderEmailTemplate } = require('./baseEmailTemplate');
const { buildComplianceBlockHtml, buildComplianceTextLines } = require('./complianceBlocks');

const formatDateTime = (value, timeZone = 'Europe/London') => {
  if (!value) {
    return '-';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZone,
  }).format(date);
};

const formatDateShort = (value, timeZone = 'Europe/London') => {
  if (!value) {
    return '-';
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return '-';
  }
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone,
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
  if (branding.address) {
    lines.push(branding.address);
  }
  return lines.length ? lines : ['Bridges Physiotherapy Services', '07455 285117 | megan@bridgesphysiotherapy.co.uk'];
};

const buildPlainText = ({
  patientName,
  appointment,
  clinicLines = [],
  previousDate,
  therapistName,
  complianceLines = [],
}) => {
  const lines = [
    `Hello ${patientName || 'there'},`,
    '',
    'Your appointment has been rescheduled. Here are your updated details:',
    '',
  ];

  if (appointment?.date) {
    lines.push(`New time: ${formatDateTime(appointment.date, appointment.timeZone)}`);
  }

  if (appointment?.treatment_description) {
    lines.push(`Treatment: ${appointment.treatment_description}`);
  }

  const locationBits = [appointment?.location, appointment?.room].filter(Boolean).join(' | ');
  if (locationBits) {
    lines.push(`Location: ${locationBits}`);
  }

  if (therapistName) {
    lines.push(`Therapist: ${therapistName}`);
  }

  if (previousDate) {
    lines.push('', `Previous time: ${formatDateTime(previousDate, appointment.timeZone)}`);
  }

  if (complianceLines.length) {
    lines.push('', ...complianceLines);
  }
  if (clinicLines.length) {
    lines.push('', clinicLines.join(' | '));
  }

  return lines.join('\n');
};

const buildRescheduleConfirmationEmail = ({
  patientName,
  appointment,
  clinicSettings,
  previousDate,
  therapistName,
}) => {
  const branding = clinicSettings?.branding || {};
  const timeZone = branding.timezone || 'Europe/London';
  const clinicLines = buildFooterLines(branding);
  const locationBits = [appointment?.location, appointment?.room].filter(Boolean).join(' | ') || 'Clinic';
  const treatment = appointment?.treatment_description || 'Treatment session';
  const therapistLabel = therapistName || appointment?.therapist_name || appointment?.therapist || '';

  const content = `
    <p style="margin:0 0 16px;">We've updated your booking. Your new appointment details are below.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px;">
      <thead>
        <tr style="text-transform:uppercase;letter-spacing:0.08em;font-size:12px;color:#475569;">
          <th align="left" style="padding:6px 8px;border-bottom:2px solid rgba(148,163,184,0.6);">New time</th>
          <th align="left" style="padding:6px 8px;border-bottom:2px solid rgba(148,163,184,0.6);">Treatment</th>
          <th align="left" style="padding:6px 8px;border-bottom:2px solid rgba(148,163,184,0.6);">Location</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding:12px 8px;border-bottom:1px solid rgba(148,163,184,0.3);font-weight:600;">
            ${formatDateTime(appointment?.date, timeZone)}
          </td>
          <td style="padding:12px 8px;border-bottom:1px solid rgba(148,163,184,0.3);">
            ${treatment}
            ${therapistLabel ? `<br/><span style="color:#64748b;">${therapistLabel}</span>` : ''}
          </td>
          <td style="padding:12px 8px;border-bottom:1px solid rgba(148,163,184,0.3);color:#475569;">
            ${locationBits}
          </td>
        </tr>
      </tbody>
    </table>
    ${
      previousDate
        ? `<div style="margin-top:14px;padding:12px 14px;background:rgba(59,130,246,0.08);border-radius:10px;color:#1e3a8a;">
            Previously scheduled: <strong>${formatDateTime(previousDate, timeZone)}</strong>
          </div>`
        : ''
    }
    ${buildComplianceBlockHtml(branding)}
  `;

  const intro = `Hi ${patientName || 'there'}, your appointment has been rescheduled.`;
  const preview = `Rescheduled for ${formatDateShort(appointment?.date, timeZone)}`;

  const html = renderEmailTemplate({
    heading: 'Appointment rescheduled',
    intro,
    content,
    previewText: preview,
    footerLines: clinicLines,
    brand: branding,
  });

  const text = buildPlainText({
    patientName,
    appointment: { ...appointment, timeZone },
    clinicLines,
    previousDate,
    therapistName: therapistLabel,
    complianceLines: buildComplianceTextLines(branding),
  });

  const subject = `Appointment rescheduled - ${formatDateShort(appointment?.date, timeZone)}`;

  return {
    subject,
    html,
    text,
  };
};

module.exports = {
  buildRescheduleConfirmationEmail,
};
