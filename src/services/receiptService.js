const path = require('path');
const Receipt = require('../models/receipts');
const Payment = require('../models/payments');
const Invoice = require('../models/invoices');
const Patient = require('../models/patients');
const Counter = require('../models/counter');
const { generateReceiptPdf } = require('./pdfService');
const { getLatestClinicSettings } = require('./clinicSettingsService');
const { toPlainObject } = require('../utils/mongoose');

const RECEIPT_PREFIX = 'RCT';

const buildPatientDisplayName = (patient) => {
  const parts = [patient?.first_name, patient?.surname].filter(Boolean);
  if (parts.length) {
    return parts.join(' ').trim();
  }
  if (patient?.preferred_name) {
    return patient.preferred_name;
  }
  return patient?.patient_id ? `Patient ${patient.patient_id}` : 'Valued Patient';
};

const resolveBillingContact = (patient) => {
  const fallbackName = buildPatientDisplayName(patient);
  const name = (patient?.primary_contact_name || '').trim();
  const email = (patient?.primary_contact_email || '').trim();
  const phone = (patient?.primary_contact_phone || '').trim();

  return {
    name: name || fallbackName,
    email: email || patient?.email,
    phone: phone || patient?.phone,
  };
};

const resolveReceiptContact = (receipt, patient) => {
  const fallback = resolveBillingContact(patient);
  return {
    name: receipt?.billing_contact_name || fallback.name,
    email: receipt?.billing_contact_email || fallback.email,
    phone: receipt?.billing_contact_phone || fallback.phone,
  };
};

const buildReceiptPdfUrl = (receiptNumber) => `/api/receipts/${receiptNumber}/pdf`;

const nextReceiptIdentifiers = async () => {
  const [receiptNumberSeq, receiptIdSeq] = await Promise.all([
    Counter.next('receipt_number', 1),
    Counter.next('receipt_id', 1),
  ]);
  const year = new Date().getFullYear();
  return {
    receiptNumber: `${RECEIPT_PREFIX}-${year}-${String(receiptNumberSeq).padStart(4, '0')}`,
    receiptId: receiptIdSeq,
  };
};

const buildReceiptExportPayload = ({
  receipt,
  payment,
  invoice,
  patient,
  billingContact,
}) => {
  const plainReceipt = toPlainObject(receipt) || {};
  const plainPayment = toPlainObject(payment) || {};
  const plainInvoice = toPlainObject(invoice) || {};
  const patientPlain = toPlainObject(patient) || null;
  const contact = billingContact || resolveReceiptContact(plainReceipt, patientPlain || {});
  const patientName = buildPatientDisplayName(patientPlain || {});
  const currency = plainReceipt.currency
    || plainInvoice.currency
    || plainPayment.currency
    || 'GBP';
  const subtotal = plainInvoice.subtotal ?? plainInvoice?.totals?.net ?? 0;
  const totalDue = plainInvoice.total_due ?? plainInvoice?.totals?.gross ?? 0;
  const balanceDue = plainInvoice.balance_due ?? plainInvoice?.totals?.balance ?? 0;
  const discountAmount = plainInvoice.discount?.amount ?? plainInvoice?.totals?.discount ?? 0;
  const paidAmount = plainReceipt.amount_paid ?? plainPayment.amount_paid ?? 0;

  return {
    ...plainReceipt,
    payment_id: plainReceipt.payment_id ?? plainPayment.payment_id,
    invoice_id: plainReceipt.invoice_id ?? plainInvoice.invoice_id ?? plainPayment.invoice_id,
    invoice_number: plainReceipt.invoice_number ?? plainInvoice.invoice_number ?? plainPayment.invoice_number,
    patient_id: plainReceipt.patient_id ?? plainInvoice.patient_id ?? plainPayment.patient_id,
    appointment_id: plainReceipt.appointment_id ?? plainInvoice.appointment_id ?? plainPayment.appointment_id,
    amount_paid: paidAmount,
    currency,
    payment_date: plainReceipt.payment_date ?? plainPayment.payment_date,
    method: plainReceipt.method ?? plainPayment.method,
    reference: plainReceipt.reference ?? plainPayment.reference,
    notes: plainReceipt.notes ?? plainPayment.notes,
    receipt_date: plainReceipt.receipt_date
      || plainPayment.payment_date
      || plainReceipt.createdAt
      || new Date(),
    line_items: plainInvoice.line_items || [],
    subtotal,
    total_due: totalDue,
    balance_due: balanceDue,
    discount: plainInvoice.discount,
    totals: {
      net: subtotal,
      discount: discountAmount,
      gross: totalDue,
      paid: paidAmount,
      balance: balanceDue,
    },
    client_id: plainInvoice.client_id || patientPlain?.patient_id || plainReceipt.patient_id,
    patient_name: patientName,
    patient_email: patientPlain?.email || plainReceipt.patient_email,
    patient_phone: patientPlain?.phone || plainReceipt.patient_phone,
    billing_contact_name: contact?.name || plainReceipt.billing_contact_name,
    billing_contact_email: contact?.email || plainReceipt.billing_contact_email,
    billing_contact_phone: contact?.phone || plainReceipt.billing_contact_phone,
  };
};

const ensureReceiptForPayment = async ({
  payment,
  paymentId,
  invoice,
  patient,
  clinicSettings,
  actorId,
  forceGeneratePdf = false,
} = {}) => {
  const paymentDoc = payment
    || (paymentId !== undefined && paymentId !== null
      ? await Payment.findOne({ payment_id: paymentId })
      : null);

  if (!paymentDoc) {
    return { receipt: null };
  }

  const receiptDoc = await Receipt.findOne({ payment_id: paymentDoc.payment_id });
  const invoiceDoc = invoice
    || (paymentDoc.invoice_id !== undefined && paymentDoc.invoice_id !== null
      ? await Invoice.findOne({ invoice_id: paymentDoc.invoice_id })
      : null);
  const patientDoc = patient
    || (paymentDoc.patient_id !== undefined && paymentDoc.patient_id !== null
      ? await Patient.findOne({ patient_id: paymentDoc.patient_id })
      : null);
  const settings = clinicSettings || await getLatestClinicSettings();

  const isNewReceipt = !receiptDoc;
  const identifiers = isNewReceipt ? await nextReceiptIdentifiers() : null;
  const receipt = receiptDoc || new Receipt({
    receipt_id: identifiers.receiptId,
    receipt_number: identifiers.receiptNumber,
    payment_id: paymentDoc.payment_id,
    email_log: { status: 'not_sent' },
  });

  receipt.invoice_id = paymentDoc.invoice_id;
  receipt.invoice_number = paymentDoc.invoice_number;
  receipt.patient_id = paymentDoc.patient_id;
  receipt.appointment_id = paymentDoc.appointment_id;
  receipt.amount_paid = paymentDoc.amount_paid;
  receipt.currency = paymentDoc.currency || invoiceDoc?.currency || receipt.currency || 'GBP';
  receipt.payment_date = paymentDoc.payment_date;
  receipt.method = paymentDoc.method;
  receipt.pdf_url = receipt.pdf_url || buildReceiptPdfUrl(receipt.receipt_number);

  if (paymentDoc.reference !== undefined) {
    receipt.reference = paymentDoc.reference;
  }
  if (paymentDoc.notes !== undefined) {
    receipt.notes = paymentDoc.notes;
  }

  receipt.receipt_date = receipt.receipt_date || paymentDoc.payment_date || new Date();
  receipt.updatedBy = actorId || receipt.updatedBy;
  if (isNewReceipt) {
    receipt.createdBy = actorId || receipt.createdBy;
  }

  await receipt.save();

  let pdfBuffer;
  const shouldGeneratePdf = forceGeneratePdf || !receipt.pdf_generated_at;
  let receiptForPdf = null;

  if (shouldGeneratePdf) {
    const billingContact = resolveReceiptContact(receipt, toPlainObject(patientDoc) || {});
    receiptForPdf = buildReceiptExportPayload({
      receipt,
      payment: paymentDoc,
      invoice: invoiceDoc,
      patient: patientDoc,
      billingContact,
    });

    try {
      const { pdfPath, pdfBuffer: buffer, html } = await generateReceiptPdf({
        receipt: receiptForPdf,
        clinicSettings: settings,
      });
      receipt.pdf_path = pdfPath ? path.relative(process.cwd(), pdfPath) : null;
      receipt.pdf_url = buildReceiptPdfUrl(receipt.receipt_number);
      receipt.pdf_generated_at = new Date();
      receipt.html_snapshot = html;
      pdfBuffer = buffer;
      await receipt.save();
    } catch (error) {
      console.error('[receiptService] Failed to generate receipt PDF', {
        receipt: receipt.receipt_number,
        payment: paymentDoc.payment_id,
        message: error?.message,
      });
    }
  }

  return {
    receipt,
    receiptForPdf,
    pdfBuffer,
    invoice: invoiceDoc,
    patient: patientDoc,
    clinicSettings: settings,
  };
};

const backfillReceiptsForPayments = async ({ payments, actorId } = {}) => {
  const paymentDocs = payments || await Payment.find({});
  if (!paymentDocs || paymentDocs.length === 0) {
    return { created: 0, skipped: 0 };
  }

  const clinicSettings = await getLatestClinicSettings();
  const paymentIds = paymentDocs.map((payment) => payment.payment_id);
  const receiptDocs = await Receipt.find({ payment_id: { $in: paymentIds } })
    .select('payment_id');
  const existing = new Set(receiptDocs.map((receipt) => receipt.payment_id));

  let created = 0;
  let skipped = 0;

  for (const payment of paymentDocs) {
    if (existing.has(payment.payment_id)) {
      skipped += 1;
      continue;
    }
    const result = await ensureReceiptForPayment({
      payment,
      actorId,
      clinicSettings,
    });
    if (result?.receipt) {
      created += 1;
    }
  }

  return { created, skipped };
};

module.exports = {
  ensureReceiptForPayment,
  buildReceiptExportPayload,
  buildReceiptPdfUrl,
  resolveReceiptContact,
  backfillReceiptsForPayments,
};
