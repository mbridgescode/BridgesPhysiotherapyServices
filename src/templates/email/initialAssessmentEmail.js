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
  preparationNotes,
  complianceLines = [],
}) => {
  const lines = [
    `Hello ${patientName || 'there'},`,
    '',
    'Thank you for booking your initial assessment. Here are the details:',
    `${formatDateTime(appointment?.date)} - ${appointment?.treatment_description || 'Initial assessment'} (${[appointment?.location, appointment?.room].filter(Boolean).join(' | ') || 'Clinic'})`,
  ];

  if (preparationNotes) {
    lines.push('', preparationNotes);
  }
  if (complianceLines.length) {
    lines.push('', ...complianceLines);
  }
  if (clinicLines.length) {
    lines.push('', clinicLines.join(' | '));
  }
  return lines.join('\n');
};

const buildInitialAssessmentEmail = ({
  patientName,
  appointment,
  clinicSettings,
  preparationNotes,
}) => {
  const branding = clinicSettings?.branding || {};
  const clinicLines = buildFooterLines(branding);
  const complianceLines = buildComplianceTextLines(branding);
  const timeZone = branding.timezone || 'Europe/London';
  const therapistName = appointment?.therapist_name || appointment?.therapist || 'your therapist';
  const locationBits = [appointment?.location, appointment?.room].filter(Boolean).join(' | ') || 'Clinic';
  const prep = preparationNotes
    || 'Please have any recent letters, discharge notes, and a list of current medications to hand. Wear comfortable clothing that allows movement.';

  const content = `
    <p style="margin:0 0 18px;color:#0f172a;">
      Hi ${patientName || 'there'}, thanks for booking your initial assessment. Here’s what to expect and how to get ready.
    </p>
    <div style="margin:0 0 16px;padding:14px 18px;border:1px solid rgba(148,163,184,0.35);border-radius:12px;">
      <div style="text-transform:uppercase;letter-spacing:0.08em;font-size:12px;color:#475569;">Appointment</div>
      <div style="font-size:16px;font-weight:700;color:#0f172a;">${formatDateTime(appointment?.date, timeZone)}</div>
      <div style="color:#475569;margin-top:4px;">${appointment?.treatment_description || 'Initial assessment'} with ${therapistName}</div>
      <div style="color:#475569;">${locationBits}</div>
    </div>
    <div style="margin:0 0 16px;padding:14px 18px;background:rgba(15,23,42,0.04);border-radius:12px;">
      <strong style="display:block;margin-bottom:6px;color:#0f172a;">How to prepare</strong>
      <div style="color:#475569;line-height:1.6;">${prep}</div>
    </div>
    ${buildComplianceBlockHtml(branding)}
  `;

  const html = renderEmailTemplate({
    heading: 'Initial assessment',
    intro: 'Here are your appointment details and preparation steps.',
    content,
    previewText: `Initial assessment on ${formatDateTime(appointment?.date, timeZone)}`,
    footerLines: clinicLines,
    brand: branding,
  });

  const text = buildPlainText({
    patientName,
    appointment,
    clinicLines,
    preparationNotes: prep,
    complianceLines,
  });

  return {
    subject: `Initial assessment - ${formatDateTime(appointment?.date, timeZone)}`,
    html,
    text,
  };
};

module.exports = {
  buildInitialAssessmentEmail,
};
