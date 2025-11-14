const Appointment = require('../models/appointments');
const Communication = require('../models/communications');
const Invoice = require('../models/invoices');
const Payment = require('../models/payments');
const Patient = require('../models/patients');
const User = require('../models/user');
const Counter = require('../models/counter');
const { calculateTotals, refreshInvoiceWithPayments } = require('../utils/invoices');
const { generateInvoicePdf } = require('./pdfService');
const { getLatestClinicSettings } = require('./clinicSettingsService');
const { toPlainObject } = require('../utils/mongoose');

const normalizeName = (value) => {
  if (!value) {
    return '';
  }
  return value
    .toString()
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
};

const parseMoney = (value) => {
  if (value === null || value === undefined || value === '') {
    return 0;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : 0;
  }
  const normalized = value
    .toString()
    .replace(/[^0-9.,-]/g, '')
    .replace(/,/g, '');
  const numeric = Number(normalized);
  return Number.isNaN(numeric) ? 0 : numeric;
};

const excelSerialToDate = (value) => {
  if (!value && value !== 0) {
    return null;
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const utcDays = Math.floor(value - 25569);
    const utcValue = utcDays * 24 * 60 * 60 * 1000;
    const dateInfo = new Date(utcValue);
    if (!Number.isNaN(dateInfo.getTime())) {
      return dateInfo;
    }
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return null;
};

const formatDateForSummary = (value) => {
  if (!(value instanceof Date)) {
    return '';
  }
  return value.toISOString().slice(0, 10);
};

const buildPatientKeys = (patient) => {
  const keys = new Set();
  const first = normalizeName(patient.first_name);
  const surname = normalizeName(patient.surname);
  const preferred = normalizeName(patient.preferred_name);

  if (first && surname) {
    keys.add(`${first} ${surname}`);
  }
  if (preferred && surname) {
    keys.add(`${preferred} ${surname}`);
  }
  if (preferred) {
    keys.add(preferred);
  }
  if (first) {
    keys.add(first);
  }
  if (surname) {
    keys.add(surname);
  }
  const full = normalizeName(`${patient.first_name || ''} ${patient.surname || ''}`);
  if (full) {
    keys.add(full);
  }
  return keys;
};

const resolveBillingContact = (patient) => {
  const fallbackName = [patient?.first_name, patient?.surname].filter(Boolean).join(' ').trim()
    || patient?.preferred_name
    || (patient?.patient_id ? `Patient ${patient.patient_id}` : 'Valued Patient');

  const name = (patient?.primary_contact_name || '').trim();
  const email = (patient?.primary_contact_email || '').trim();
  const phone = (patient?.primary_contact_phone || '').trim();

  return {
    name: name || fallbackName,
    email: email || patient?.email,
    phone: phone || patient?.phone,
  };
};

const mapPaymentMethod = (value) => {
  const normalized = value ? value.toString().trim().toLowerCase() : '';
  if (!normalized) {
    return 'other';
  }
  if (normalized.includes('bank')) {
    return 'transfer';
  }
  if (normalized.includes('cheque') || normalized.includes('check')) {
    return 'cheque';
  }
  if (normalized.includes('cash')) {
    return 'cash';
  }
  if (normalized.includes('card')) {
    return 'card';
  }
  if (normalized.includes('insurance')) {
    return 'insurance';
  }
  return 'other';
};

const normalizeRow = (row, index) => {
  const invoiceAmount = parseMoney(row.invoiceAmount ?? row['Invoice Amount']);
  const discount = parseMoney(row.discount ?? row.Discount);
  const payment = parseMoney(row.payment ?? row.Payment);
  const appointmentType = row.appointmentType
    ?? row['Appointment Type']
    ?? 'Physiotherapy Follow-Up';

  return {
    rowNumber: row.rowNumber || row.originalRow || index + 2,
    patientName: (row.patientName ?? row['Patient Name'] ?? '').toString().trim(),
    appointmentType: appointmentType ? appointmentType.toString().trim() : 'Physiotherapy Follow-Up',
    invoiceAmount,
    discount,
    payment,
    paymentType: (row.paymentType ?? row['Payment Type'] ?? '').toString().trim(),
    appointmentDate: excelSerialToDate(row.date ?? row.Date),
  };
};

const ensureLookupMaps = async () => {
  const patientDocs = await Patient.find({})
    .populate('primaryTherapist', 'employeeID role username email');

  const patients = patientDocs.map((doc) => ({
    doc,
    plain: toPlainObject(doc),
  }));

  const lookup = new Map();
  patients.forEach((entry) => {
    buildPatientKeys(entry.plain).forEach((key) => {
      if (key && !lookup.has(key)) {
        lookup.set(key, entry);
      }
    });
  });

  return { patientLookup: lookup };
};

const resolveActorRecords = async (actorId) => {
  const actorDoc = actorId ? await User.findById(actorId) : null;
  if (actorDoc && actorDoc.employeeID !== undefined && actorDoc.employeeID !== null) {
    return { actorDoc, fallbackTherapist: actorDoc };
  }
  const fallbackTherapist = await User.findOne({
    role: { $in: ['therapist', 'admin'] },
    employeeID: { $ne: null },
  }).sort({ role: 1, createdAt: 1 });
  return { actorDoc, fallbackTherapist: fallbackTherapist || actorDoc };
};

const buildMetaKey = ({
  source,
  patientId,
  date,
  appointmentType,
  invoiceAmount,
  discount,
  payment,
}) => {
  const isoDate = date instanceof Date ? date.toISOString().slice(0, 10) : 'unknown-date';
  return [
    'import',
    source,
    patientId,
    isoDate,
    appointmentType,
    Number(invoiceAmount ?? 0),
    Number(discount ?? 0),
    Number(payment ?? 0),
  ].join(':');
};

const importPastDataRows = async ({
  rows = [],
  actorId,
  sourceLabel = 'manual-import',
  generatePdf = false,
}) => {
  const normalizedRows = rows.map((row, index) => normalizeRow(row, index));
  const summary = {
    processed: normalizedRows.length,
    appointmentsCreated: 0,
    invoicesCreated: 0,
    paymentsCreated: 0,
    createdInvoices: [],
    skipped: [],
    errors: [],
  };

  if (normalizedRows.length === 0) {
    return summary;
  }

  const { patientLookup } = await ensureLookupMaps();
  const { actorDoc, fallbackTherapist } = await resolveActorRecords(actorId);
  const clinicSettings = await getLatestClinicSettings();

  for (const row of normalizedRows) {
    if (!row.patientName) {
      summary.skipped.push({
        rowNumber: row.rowNumber,
        reason: 'Missing patient name',
      });
      continue;
    }
    if (!row.appointmentDate) {
      summary.skipped.push({
        rowNumber: row.rowNumber,
        reason: 'Invalid or missing date',
        patientName: row.patientName,
      });
      continue;
    }

    const mappedPatient = patientLookup.get(normalizeName(row.patientName));
    if (!mappedPatient) {
      summary.skipped.push({
        rowNumber: row.rowNumber,
        patientName: row.patientName,
        reason: 'Patient not found',
      });
      continue;
    }

    const patientDoc = mappedPatient.doc;
    const patient = mappedPatient.plain;
    const metaKey = buildMetaKey({
      source: sourceLabel,
      patientId: patient.patient_id,
      date: row.appointmentDate,
      appointmentType: row.appointmentType,
      invoiceAmount: row.invoiceAmount,
      discount: row.discount,
      payment: row.payment,
    });

    const existingInvoice = await Invoice.findOne({
      'line_items.meta': metaKey,
    });
    if (existingInvoice) {
      summary.skipped.push({
        rowNumber: row.rowNumber,
        patientName: row.patientName,
        reason: `Invoice ${existingInvoice.invoice_number} already exists for this entry`,
      });
      continue;
    }

    try {
      const therapistDoc = patientDoc.primaryTherapist || fallbackTherapist || actorDoc;
      const employeeID = patient.primary_therapist_id
        ?? (therapistDoc ? therapistDoc.employeeID : undefined)
        ?? actorDoc?.employeeID
        ?? 0;

      const appointmentId = await Counter.next('appointment_id', 1);
      const treatmentId = Date.now() + appointmentId;

    const patientAddress = (() => {
      const line1 = patient?.address?.line1;
      const line2 = patient?.address?.line2;
      const city = patient?.address?.city;
      const postcode = patient?.address?.postcode;

      const addressParts = [line1, line2, city, postcode]
        .map((value) => (value ? value.toString().trim() : ''))
        .filter(Boolean);

      if (addressParts.length === 0) {
        return null;
      }

      return addressParts.join(', ');
    })();

    const appointmentPayload = {
      appointment_id: appointmentId,
      patient_id: patient.patient_id,
      patient: patientDoc._id,
        employeeID,
        therapist: therapistDoc?._id || actorDoc?._id,
        date: row.appointmentDate,
        duration_minutes: 60,
      location: patientAddress ? `Patient Address: ${patientAddress}` : 'Clinic',
        room: '',
        first_name: patient.first_name,
        surname: patient.surname,
        contact: patient.phone,
        completed: true,
        status: 'completed',
        completion_status: 'completed_manual',
        treatment_id: treatmentId,
        treatment_description: row.appointmentType || 'Treatment session',
        treatment_count: 1,
        price: row.invoiceAmount,
        treatment_notes: `Imported via ${sourceLabel}`,
        billing_mode: patient.billing_mode || 'individual',
        clinical_notes: [],
        createdBy: actorId || actorDoc?._id,
        updatedBy: actorId || actorDoc?._id,
      };

      await Appointment.create(appointmentPayload);
      summary.appointmentsCreated += 1;

      const [invoiceNumberSeq, invoiceIdSeq] = await Promise.all([
        Counter.next('invoice_number', 1),
        Counter.next('invoice_id', 1),
      ]);

      const year = new Date().getFullYear();
      const prefix = clinicSettings?.invoice_prefix || 'INV';
      const invoiceNumber = `${prefix}-${year}-${String(invoiceNumberSeq).padStart(4, '0')}`;

      const lineItemBaseAmount = Math.max(row.invoiceAmount + Math.max(row.discount, 0), 0);
      const discountAmount = Math.max(row.discount, 0);

      const lineItems = [{
        line_id: `import-${appointmentId}`,
        description: row.appointmentType || 'Treatment session',
        quantity: 1,
        unit_price: lineItemBaseAmount,
        discount_amount: Math.min(discountAmount, lineItemBaseAmount),
        total: Math.max(row.invoiceAmount, 0),
        appointment_id: appointmentId,
        service_date: row.appointmentDate,
        meta: metaKey,
        notes: '',
      }];

      const totalsPayload = calculateTotals({
        lineItems,
        discount: { amount: 0 },
      });

      const billingContact = resolveBillingContact(patient);

      const invoice = await Invoice.create({
        invoice_id: invoiceIdSeq,
        invoice_number: invoiceNumber,
        patient_id: patient.patient_id,
        client_id: patient.patient_id,
        patient: patientDoc._id,
        billing_contact_name: billingContact.name,
        billing_contact_email: billingContact.email,
        billing_contact_phone: billingContact.phone,
        appointment_id: appointmentId,
        appointment_ids: [appointmentId],
        line_items: lineItems,
        totals: totalsPayload.totals,
        discount: {
          amount: discountAmount,
          invoice_amount: 0,
          line_item_amount: discountAmount,
        },
        subtotal: totalsPayload.subtotal,
        total_due: totalsPayload.totalDue,
        total_paid: 0,
        balance_due: totalsPayload.balanceDue,
        currency: 'GBP',
        issue_date: row.appointmentDate,
        due_date: row.appointmentDate,
        notes: `Imported via ${sourceLabel} on ${new Date().toISOString()}`,
        status: 'sent',
        createdBy: actorId || actorDoc?._id,
        email_log: { status: 'not_sent' },
      });

      summary.invoicesCreated += 1;

      if (generatePdf) {
        const invoiceForPdf = await (async () => {
          const plainInvoice = invoice.toObject();
          return {
            ...plainInvoice,
            patient_name: `${patient.first_name || ''} ${patient.surname || ''}`.trim()
              || patient.preferred_name
              || `Patient ${patient.patient_id}`,
            patient_email: patient.email,
            patient_phone: patient.phone,
            billing_contact_name: billingContact.name,
            billing_contact_email: billingContact.email,
            billing_contact_phone: billingContact.phone,
            client_id: patient.patient_id,
          };
        })();

        try {
          const pdfResult = await generateInvoicePdf({
            invoice: invoiceForPdf,
            clinicSettings,
          });
          if (pdfResult?.pdfBuffer) {
            invoice.pdf_generated_at = new Date();
            invoice.pdf_path = pdfResult.pdfPath || null;
            invoice.pdf_url = `/api/invoices/${invoice.invoice_number}/pdf`;
            invoice.html_snapshot = pdfResult.html;
          }
        } catch (pdfError) {
          console.warn('[importPastData] Failed to generate PDF', {
            invoice: invoice.invoice_number,
            error: pdfError?.message,
          });
        }
      } else {
        invoice.pdf_generated_at = null;
        invoice.pdf_path = null;
        invoice.pdf_url = `/api/invoices/${invoice.invoice_number}/pdf`;
        invoice.html_snapshot = null;
      }

      if (row.payment > 0) {
        const paymentId = await Counter.next('payment_id', 1);
        await Payment.create({
          payment_id: paymentId,
          invoice_id: invoice.invoice_id,
          invoice_number: invoice.invoice_number,
          patient_id: patient.patient_id,
          appointment_id: appointmentId,
          amount_paid: row.payment,
          currency: 'GBP',
          payment_date: row.appointmentDate,
          method: mapPaymentMethod(row.paymentType),
          reference: metaKey,
          notes: `Imported via ${sourceLabel}`,
          recordedBy: actorId || actorDoc?._id,
        });
        summary.paymentsCreated += 1;
      }

      await refreshInvoiceWithPayments(invoice);
      invoice.updatedBy = actorId || actorDoc?._id;
      await invoice.save();
      await logInvoiceIssuedCommunication({
        patientId: patient.patient_id,
        invoiceNumber: invoice.invoice_number,
        appointmentDate: row.appointmentDate,
        amount: row.invoiceAmount,
      });

      summary.createdInvoices.push({
        invoice_number: invoice.invoice_number,
        patient_name: row.patientName,
        appointment_date: formatDateForSummary(row.appointmentDate),
        amount: row.invoiceAmount,
      });
    } catch (error) {
      console.error('[importPastData] Failed to import row', {
        rowNumber: row.rowNumber,
        patientName: row.patientName,
        error,
      });
      summary.errors.push({
        rowNumber: row.rowNumber,
        patientName: row.patientName,
        reason: error?.message || 'Unknown error',
      });
    }
  }

  return summary;
};

const logInvoiceIssuedCommunication = async ({
  patientId,
  invoiceNumber,
  appointmentDate,
  amount,
}) => {
  if (!patientId) {
    return;
  }
  try {
    await Communication.create({
      communication_id: Date.now(),
      patient_id: patientId,
      type: 'note',
      subject: `Invoice ${invoiceNumber} issued`,
      content: `Invoice ${invoiceNumber} for £${Number(amount || 0).toFixed(2)} was recorded on ${formatDateForSummary(appointmentDate)} during legacy import.`,
      delivery_status: 'sent',
      metadata: {
        invoice_number: invoiceNumber,
        source: 'legacy-import',
      },
    });
  } catch (error) {
    console.error('Failed to log invoice communication', {
      patientId,
      invoiceNumber,
      error,
    });
  }
};

module.exports = {
  importPastDataRows,
  excelSerialToDate,
};
