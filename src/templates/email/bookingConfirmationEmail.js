const { renderEmailTemplate } = require('./baseEmailTemplate');

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
  return lines.length ? lines : ['Bridges Physiotherapy Services', '07950 463134 | megan@bridgesphysiotherapy.co.uk'];
};

const buildAppointmentsTable = (appointments = [], timeZone) => {
  const rows = appointments
    .map((appointment) => {
      const locationBits = [appointment.location, appointment.room].filter(Boolean).join(' | ');
      const therapistName =
        appointment.therapist_name || appointment.therapist || `Therapist #${appointment.employeeID || ''}`;
      return `<tr>
        <td style="padding:12px 8px;border-bottom:1px solid rgba(148,163,184,0.3);font-weight:600;">
          ${formatDateTime(appointment.date, timeZone)}
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid rgba(148,163,184,0.3);">
          ${appointment.treatment_description || 'Treatment session'}<br/>
          <span style="color:#64748b;">${therapistName}</span>
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid rgba(148,163,184,0.3);color:#475569;">
          ${locationBits || 'Clinic'}
        </td>
      </tr>`;
    })
    .join('');

  return `<table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-top:12px;">
    <thead>
      <tr style="text-transform:uppercase;letter-spacing:0.08em;font-size:12px;color:#475569;">
        <th align="left" style="padding:6px 8px;border-bottom:2px solid rgba(148,163,184,0.6);">Date & Time</th>
        <th align="left" style="padding:6px 8px;border-bottom:2px solid rgba(148,163,184,0.6);">Treatment</th>
        <th align="left" style="padding:6px 8px;border-bottom:2px solid rgba(148,163,184,0.6);">Location</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>`;
};

const buildPlainText = ({ patientName, appointments = [], clinicLines = [], extraNote }) => {
  const lines = [
    `Hello ${patientName || 'there'},`,
    '',
    'Your appointment has been booked:',
    '',
  ];
  appointments.forEach((appointment, index) => {
    lines.push(
      `${index + 1}. ${formatDateTime(appointment.date)} - ${appointment.treatment_description || 'Treatment'} (${[
        appointment.location,
        appointment.room,
      ]
        .filter(Boolean)
        .join(', ') || 'Clinic'})`,
    );
  });
  if (extraNote) {
    lines.push('', extraNote);
  }
  if (clinicLines.length) {
    lines.push('', clinicLines.join(' | '));
  }
  return lines.join('\n');
};

const buildBookingConfirmationEmail = ({
  patientName,
  appointments,
  clinicSettings,
  additionalNote,
}) => {
  const branding = clinicSettings?.branding || {};
  const timeZone = branding.timezone || 'Europe/London';
  const clinicLines = buildFooterLines(branding);
  const intro = `Hi ${patientName || 'there'}, your appointment${appointments.length > 1 ? 's have' : ' has'} been secured.`;
  const preview = `${appointments.length > 1 ? 'Appointments confirmed' : 'Appointment confirmed'} for ${formatDateShort(
    appointments[0]?.date,
    timeZone,
  )}`;
  const content = `
    <p style="margin:0 0 18px;">We look forward to seeing you in clinic. Please arrive a few minutes early to get settled, and bring any recent medical information that might help your therapist.</p>
    ${buildAppointmentsTable(appointments, timeZone)}
    ${
      additionalNote
        ? `<div style="margin-top:18px;padding:14px 18px;background:rgba(79,70,229,0.08);border-radius:12px;">
            <strong style="display:block;margin-bottom:8px;">Helpful info</strong>
            <span style="color:#475569;">${additionalNote}</span>
          </div>`
        : ''
    }
  `;

  const html = renderEmailTemplate({
    heading: 'Booking Confirmed',
    intro,
    content,
    previewText: preview,
    footerLines: clinicLines,
    brand: branding,
  });

  const text = buildPlainText({
    patientName,
    appointments,
    clinicLines,
    extraNote: additionalNote,
  });

  const subject = `Booking confirmation - ${formatDateShort(appointments[0]?.date, timeZone)}`;

  return {
    subject,
    html,
    text,
  };
};

module.exports = {
  buildBookingConfirmationEmail,
};
