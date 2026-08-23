const Patient = require('../models/patients');
const Appointment = require('../models/appointments');
const Invoice = require('../models/invoices');
const Payment = require('../models/payments');
const { toPlainObject } = require('../utils/mongoose');

const PAYMENT_APPLIED_STATUS = 'applied';
const EPSILON = 0.005;

const normalizeNumber = (value) => {
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
};

const normalizeDate = (value) => {
  if (!value) {
    return null;
  }
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const buildPatientDisplayName = (patient) => {
  const parts = [patient?.first_name, patient?.surname].filter(Boolean);
  if (parts.length) {
    return parts.join(' ').trim();
  }
  if (patient?.preferred_name) {
    return patient.preferred_name;
  }
  return patient?.patient_id ? `Patient ${patient.patient_id}` : 'Patient';
};

const resolveBillingContact = (patient) => ({
  name: patient?.primary_contact_name || buildPatientDisplayName(patient),
  email: patient?.primary_contact_email || patient?.email || '',
  phone: patient?.primary_contact_phone || patient?.phone || '',
});

const collectAppointmentIds = (invoice) => {
  const ids = [
    invoice?.appointment_id,
    ...(Array.isArray(invoice?.appointment_ids) ? invoice.appointment_ids : []),
    ...(Array.isArray(invoice?.line_items)
      ? invoice.line_items.map((item) => item?.appointment_id)
      : []),
  ]
    .map(normalizeNumber)
    .filter((value) => value !== null);

  return [...new Set(ids)];
};

const invoiceMatchesPayment = (invoice, payment) => (
  (invoice?.invoice_id !== undefined
    && invoice?.invoice_id !== null
    && Number(invoice.invoice_id) === Number(payment?.invoice_id))
  || (invoice?.invoice_number
    && invoice.invoice_number === payment?.invoice_number)
);

const buildEntryId = ({ invoice, appointmentId, lineId }) => {
  const invoiceKey = invoice?.invoice_id ?? invoice?.invoice_number;
  if (appointmentId !== null && appointmentId !== undefined) {
    return `appointment:${appointmentId}:invoice:${invoiceKey}`;
  }
  return `line:${invoiceKey}:${lineId || 'unidentified'}`;
};

const getLineItemsForAppointment = (invoice, appointmentId) => (
  (Array.isArray(invoice?.line_items) ? invoice.line_items : [])
    .filter((item) => normalizeNumber(item?.appointment_id) === Number(appointmentId))
);

const getPractitionerName = (appointment) => (
  appointment?.therapist?.name
  || appointment?.therapist?.username
  || (appointment?.employeeID ? `Therapist #${appointment.employeeID}` : '')
);

const buildSessionDescriptors = ({ invoice, appointmentMap }) => {
  const lineItems = Array.isArray(invoice?.line_items) ? invoice.line_items : [];
  const appointmentIds = collectAppointmentIds(invoice);
  const descriptors = [];

  appointmentIds.forEach((appointmentId) => {
    const appointment = appointmentMap.get(appointmentId);
    const matchedLines = getLineItemsForAppointment(invoice, appointmentId);
    const amountDueFromLines = matchedLines.reduce(
      (sum, item) => sum + (Number(item?.total) || 0),
      0,
    );
    const serviceDate = normalizeDate(
      matchedLines.find((item) => item?.service_date || item?.treatment_date)?.service_date
        || matchedLines.find((item) => item?.treatment_date)?.treatment_date
        || appointment?.date,
    );
    const treatmentDescription = matchedLines
      .map((item) => item?.description)
      .filter(Boolean)
      .join(' / ')
      || appointment?.treatment_description
      || 'Treatment session';

    descriptors.push({
      entry_id: buildEntryId({ invoice, appointmentId }),
      invoice_key: invoice?.invoice_id ?? invoice?.invoice_number,
      invoice_id: invoice?.invoice_id,
      appointment_id: appointmentId,
      session_date: serviceDate,
      treatment_description: treatmentDescription,
      amount_due: amountDueFromLines > 0
        ? amountDueFromLines
        : (Number(appointment?.price) || (appointmentIds.length === 1 ? Number(invoice?.total_due) || 0 : 0)),
      practitioner_name: getPractitionerName(appointment),
      line_item_ids: matchedLines.map((item) => item?.line_id).filter(Boolean),
      can_allocate_unassigned_payment: appointmentIds.length === 1,
    });
  });

  const unlinkedLines = lineItems.filter(
    (item) => normalizeNumber(item?.appointment_id) === null,
  );

  if (appointmentIds.length === 0) {
    unlinkedLines.forEach((lineItem, index) => {
      descriptors.push({
        entry_id: buildEntryId({
          invoice,
          lineId: lineItem?.line_id || `line-${index + 1}`,
        }),
        invoice_key: invoice?.invoice_id ?? invoice?.invoice_number,
        invoice_id: invoice?.invoice_id,
        appointment_id: null,
        session_date: normalizeDate(lineItem?.service_date || lineItem?.treatment_date),
        treatment_description: lineItem?.description || 'Treatment session',
        amount_due: Number(lineItem?.total) || 0,
        practitioner_name: '',
        line_item_ids: lineItem?.line_id ? [lineItem.line_id] : [],
        can_allocate_unassigned_payment: unlinkedLines.length === 1,
      });
    });
  } else if (appointmentIds.length === 1 && unlinkedLines.length > 0) {
    const descriptor = descriptors[0];
    const unlinkedAmount = unlinkedLines.reduce(
      (sum, item) => sum + (Number(item?.total) || 0),
      0,
    );
    if (descriptor && descriptor.line_item_ids.length === 0) {
      descriptor.amount_due = unlinkedAmount || descriptor.amount_due;
      descriptor.treatment_description = unlinkedLines
        .map((item) => item?.description)
        .filter(Boolean)
        .join(' / ') || descriptor.treatment_description;
      descriptor.session_date = normalizeDate(
        unlinkedLines[0]?.service_date || unlinkedLines[0]?.treatment_date,
      ) || descriptor.session_date;
      descriptor.line_item_ids = unlinkedLines.map((item) => item?.line_id).filter(Boolean);
    }
  }

  return descriptors;
};

const resolvePaymentsForDescriptor = ({ descriptor, invoicePayments, descriptorCount }) => {
  const directPayments = invoicePayments.filter((payment) => (
    descriptor.appointment_id !== null
    && descriptor.appointment_id !== undefined
    && normalizeNumber(payment?.appointment_id) === Number(descriptor.appointment_id)
  ));

  if (directPayments.length > 0) {
    return directPayments;
  }

  if (descriptor.can_allocate_unassigned_payment && descriptorCount === 1) {
    return invoicePayments.filter((payment) => (
      payment?.appointment_id === undefined
      || payment?.appointment_id === null
      || payment?.appointment_id === ''
    ));
  }

  return [];
};

const getPaymentStatus = ({ invoice, amountPaid, amountDue, hasPaymentAllocation }) => {
  if (invoice?.status === 'void') {
    return 'Voided';
  }
  if (!hasPaymentAllocation || amountPaid <= 0) {
    return invoice?.status === 'partially_paid' ? 'Part-Paid' : 'Outstanding';
  }
  if (amountDue > 0 && amountPaid + EPSILON < amountDue) {
    return 'Part-Paid';
  }
  return 'Paid';
};

const buildEntry = ({ descriptor, invoice, invoicePayments, descriptorCount }) => {
  const allocatedPayments = resolvePaymentsForDescriptor({
    descriptor,
    invoicePayments,
    descriptorCount,
  });
  const appliedPayments = allocatedPayments.filter(
    (payment) => (payment?.status || PAYMENT_APPLIED_STATUS) === PAYMENT_APPLIED_STATUS,
  );
  const amountPaid = appliedPayments.reduce(
    (sum, payment) => sum + (Number(payment?.amount_paid) || 0),
    0,
  );
  const paymentDates = appliedPayments
    .map((payment) => normalizeDate(payment?.payment_date))
    .filter(Boolean)
    .sort((a, b) => a.getTime() - b.getTime());
  const hasPaymentAllocation = allocatedPayments.length > 0;
  const status = getPaymentStatus({
    invoice,
    amountPaid,
    amountDue: descriptor.amount_due,
    hasPaymentAllocation,
  });
  const eligible = invoice?.status !== 'void'
    && appliedPayments.length > 0
    && amountPaid > 0
    && (descriptor.amount_due <= 0 || amountPaid + EPSILON >= descriptor.amount_due);

  return {
    entry_id: descriptor.entry_id,
    appointment_id: descriptor.appointment_id,
    session_date: descriptor.session_date,
    treatment_description: descriptor.treatment_description,
    invoice_number: invoice?.invoice_number || '',
    amount_paid: Math.round(amountPaid * 100) / 100,
    payment_date: paymentDates.length === 1 ? paymentDates[0] : null,
    payment_dates: paymentDates,
    payment_status: status,
    currency: invoice?.currency || appliedPayments[0]?.currency || 'GBP',
    eligible,
    practitioner_name: descriptor.practitioner_name,
  };
};

const buildPatientSummary = (patient) => {
  const patientName = buildPatientDisplayName(patient);
  const billingContact = resolveBillingContact(patient);
  return {
    patient: {
      name: patientName,
      patient_id: patient?.patient_id,
      address: patient?.address || null,
    },
    billingContact: billingContact.name && billingContact.name !== patientName
      ? billingContact
      : null,
  };
};

const loadPaymentSummaryData = async (patientId) => {
  const [patientDoc, appointmentDocs, invoiceDocs, paymentDocs] = await Promise.all([
    Patient.findOne({ patient_id: patientId }),
    Appointment.find({ patient_id: patientId })
      .populate('therapist', 'name username employeeID')
      .sort({ date: 1, appointment_id: 1 }),
    Invoice.find({ patient_id: patientId }).sort({ issue_date: 1, invoice_number: 1 }),
    Payment.find({ patient_id: patientId }).sort({ payment_date: 1, payment_id: 1 }),
  ]);

  const patient = toPlainObject(patientDoc);
  const appointments = toPlainObject(appointmentDocs);
  const invoices = toPlainObject(invoiceDocs);
  const payments = toPlainObject(paymentDocs);
  const appointmentMap = new Map(
    appointments.map((appointment) => [normalizeNumber(appointment.appointment_id), appointment]),
  );
  const entries = [];

  invoices.forEach((invoice) => {
    const invoicePayments = payments.filter((payment) => invoiceMatchesPayment(invoice, payment));
    const descriptors = buildSessionDescriptors({ invoice, appointmentMap });
    descriptors.forEach((descriptor) => {
      entries.push(buildEntry({
        descriptor,
        invoice,
        invoicePayments,
        descriptorCount: descriptors.length,
      }));
    });
  });

  entries.sort((a, b) => {
    const aTime = normalizeDate(a.session_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const bTime = normalizeDate(b.session_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
    if (aTime !== bTime) {
      return aTime - bTime;
    }
    return String(a.invoice_number).localeCompare(String(b.invoice_number));
  });

  return {
    patient,
    ...buildPatientSummary(patient),
    entries,
  };
};

const buildPaymentSummaryOptions = async ({ patientId }) => loadPaymentSummaryData(patientId);

const buildSelectedPaymentSummary = async ({ patientId, entryIds = [] }) => {
  const options = await loadPaymentSummaryData(patientId);
  const requestedIds = new Set(Array.isArray(entryIds) ? entryIds.map(String) : []);
  const selectedEntries = options.entries
    .filter((entry) => requestedIds.has(String(entry.entry_id)) && entry.eligible)
    .sort((a, b) => {
      const aTime = normalizeDate(a.session_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      const bTime = normalizeDate(b.session_date)?.getTime() ?? Number.MAX_SAFE_INTEGER;
      return aTime - bTime;
    });

  if (selectedEntries.length === 0) {
    return { options, selectedEntries, error: 'Select at least one paid treatment session.' };
  }

  const totalAmountPaid = Math.round(
    selectedEntries.reduce((sum, entry) => sum + Number(entry.amount_paid || 0), 0) * 100,
  ) / 100;
  const practitionerNames = [...new Set(
    selectedEntries.map((entry) => entry.practitioner_name).filter(Boolean),
  )];

  return {
    ...options,
    entries: selectedEntries,
    selectedEntries,
    practitionerNames,
    sessionCount: selectedEntries.length,
    totalAmountPaid,
    currency: selectedEntries[0]?.currency || 'GBP',
  };
};

module.exports = {
  buildPaymentSummaryOptions,
  buildSelectedPaymentSummary,
  buildPatientDisplayName,
};
