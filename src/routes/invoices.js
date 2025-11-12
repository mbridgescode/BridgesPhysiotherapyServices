const express = require('express');
const path = require('path');
const fs = require('fs');
const Invoice = require('../models/invoices');
const Patient = require('../models/patients');
const Appointment = require('../models/appointments');
const Counter = require('../models/counter');
const Payment = require('../models/payments');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/audit');
const { generateInvoicePdf } = require('../services/pdfService');
const { sendTransactionalEmail } = require('../services/emailService');
const { getLatestClinicSettings } = require('../services/clinicSettingsService');
const { buildInvoiceDeliveryEmail } = require('../templates/email/invoiceDeliveryEmail');
const { calculateTotals, refreshInvoiceWithPayments } = require('../utils/invoices');
const { buildPatientScopeQuery, userCanAccessPatient } = require('../utils/accessControl');
const { toPlainObject } = require('../utils/mongoose');

const router = express.Router();

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

const resolveInvoiceContact = (invoice, patient) => {
  const fallback = resolveBillingContact(patient);
  return {
    name: invoice?.billing_contact_name || fallback.name,
    email: invoice?.billing_contact_email || fallback.email,
    phone: invoice?.billing_contact_phone || fallback.phone,
  };
};

const normalizeAppointmentId = (value) => {
  if (value === undefined || value === null || value === '') {
    return null;
  }
  const numeric = Number(value);
  return Number.isNaN(numeric) ? null : numeric;
};

const normalizeAppointmentIdList = (value) => {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((entry) => normalizeAppointmentId(entry))
    .filter((entry) => entry !== null);
};

const collectAppointmentIds = (primaryValue, listValue) => {
  const normalized = [
    ...normalizeAppointmentIdList(listValue),
  ];
  const single = normalizeAppointmentId(primaryValue);
  if (single !== null) {
    normalized.push(single);
  }
  return [...new Set(normalized)];
};

const resolveSettings = async () => getLatestClinicSettings();

const nextInvoiceIdentifiers = async (settings) => {
  const [invoiceNumberSeq, invoiceIdSeq] = await Promise.all([
    Counter.next('invoice_number', 1),
    Counter.next('invoice_id', 1),
  ]);
  const prefix = settings?.invoice_prefix || 'INV';
  const year = new Date().getFullYear();
  return {
    invoiceNumber: `${prefix}-${year}-${String(invoiceNumberSeq).padStart(4, '0')}`,
    invoiceId: invoiceIdSeq,
  };
};

const parseServiceDate = (value) => {
  if (!value) {
    return undefined;
  }
  const asDate = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(asDate.getTime())) {
    return undefined;
  }
  return asDate;
};

const normalizeLineItems = (lineItems = []) => lineItems.map((item, index) => {
  const quantity = Number(item.quantity) || 1;
  const unitPrice = Number(item.unit_price) || 0;
  const baseAmount = quantity * unitPrice;
  const discountAmountRaw = Number(item.discount_amount || 0);
  const discountAmount = Number.isNaN(discountAmountRaw)
    ? 0
    : Math.min(Math.max(discountAmountRaw, 0), baseAmount);
  const total = Number(item.total ?? (baseAmount - discountAmount));
  const resolvedTotal = Number.isNaN(total) ? baseAmount - discountAmount : total;
  const appointmentRef = normalizeAppointmentId(item.appointment_id);
  const serviceDate = parseServiceDate(item.service_date || item.treatment_date);

  return {
    line_id: item.line_id || `line-${index + 1}`,
    description: item.description,
    quantity,
    unit_price: unitPrice,
    total: Math.max(resolvedTotal, 0),
    discount_amount: discountAmount,
    appointment_id: appointmentRef !== null ? appointmentRef : undefined,
    service_date: serviceDate,
    meta: item.meta,
    notes: item.notes,
  };
});

const buildPdfUrl = (invoiceNumber) => `/api/invoices/${invoiceNumber}/pdf`;

const toPlainInvoice = (invoice) => {
  if (!invoice) {
    return null;
  }
  return typeof invoice.toObject === 'function' ? invoice.toObject() : invoice;
};

const buildTotalsFallback = (invoice) => {
  const source = invoice?.totals || {};
  const discountAmount = source.discount ?? invoice?.discount?.amount ?? 0;
  return {
    net: source.net ?? invoice?.subtotal ?? 0,
    discount: discountAmount,
    gross: source.gross ?? invoice?.total_due ?? 0,
    paid: source.paid ?? invoice?.total_paid ?? 0,
    balance: source.balance ?? invoice?.balance_due ?? 0,
  };
};

const serializeInvoice = (invoice, context = {}) => {
  const plain = toPlainInvoice(invoice);
  if (!plain) {
    return plain;
  }
  const totals = buildTotalsFallback(plain);
  const result = {
    ...plain,
    client_id: plain.client_id || plain.patient_id,
    totals,
    pdf_url: plain.pdf_url || buildPdfUrl(plain.invoice_number),
  };

  if (context.patient) {
    const displayName = buildPatientDisplayName(context.patient);
    result.patient_name = displayName;
    result.patient_email = context.patient.email || result.patient_email;
    result.patient_phone = context.patient.phone || result.patient_phone;
  } else if (context.patientName) {
    result.patient_name = context.patientName;
  }

  if (context.billingContact) {
    result.billing_contact_name = context.billingContact.name || result.billing_contact_name;
    result.billing_contact_email = context.billingContact.email || result.billing_contact_email;
    result.billing_contact_phone = context.billingContact.phone || result.billing_contact_phone;
  }

  return result;
};

const enrichLineItemsWithPatientAppointmentNumbers = async ({ lineItems, patientId }) => {
  if (!Array.isArray(lineItems) || lineItems.length === 0) {
    return Array.isArray(lineItems) ? lineItems.map((item) => ({ ...item })) : lineItems;
  }

  const items = lineItems.map((item) => ({ ...item }));
  if (!patientId) {
    return items;
  }

  const appointmentAwareItems = items.filter(
    (item) => normalizeAppointmentId(item?.appointment_id) !== null,
  );

  if (appointmentAwareItems.length === 0) {
    return items.map((item) => ({ ...item }));
  }

  const patientAppointmentDocs = await Appointment.find({
    patient_id: patientId,
    status: 'completed',
  })
    .select('appointment_id date')
    .sort({ date: 1, appointment_id: 1 });

  const patientAppointments = toPlainObject(patientAppointmentDocs);

  if (patientAppointments.length === 0) {
    return items.map((item) => ({ ...item }));
  }

  const sequenceByAppointmentId = new Map();
  patientAppointments.forEach((appointment, index) => {
    const normalizedId = normalizeAppointmentId(appointment.appointment_id);
    if (normalizedId !== null) {
      sequenceByAppointmentId.set(normalizedId, index + 1);
    }
  });

  if (sequenceByAppointmentId.size === 0) {
    return items;
  }

  items.forEach((item) => {
    const normalizedId = normalizeAppointmentId(item?.appointment_id);
    if (normalizedId !== null) {
      const sequence = sequenceByAppointmentId.get(normalizedId);
      if (sequence) {
        item.patient_appointment_number = sequence;
      }
    }
  });

  return items;
};

const buildInvoiceExportPayload = async ({ invoice, patient, billingContact }) => {
  const plainInvoice = toPlainInvoice(invoice);
  if (!plainInvoice) {
    return null;
  }
  const contact = billingContact || resolveInvoiceContact(plainInvoice, patient);
  const patientId = plainInvoice.patient_id || patient?.patient_id;
  const enrichedLineItems = await enrichLineItemsWithPatientAppointmentNumbers({
    lineItems: plainInvoice.line_items,
    patientId,
  });

  return {
    ...plainInvoice,
    line_items: enrichedLineItems,
    patient_name: buildPatientDisplayName(patient),
    patient_email: patient?.email,
    patient_phone: patient?.phone,
    billing_contact_name: contact.name,
    billing_contact_email: contact.email,
    billing_contact_phone: contact.phone,
    client_id: plainInvoice.client_id || patient?.patient_id,
    totals: buildTotalsFallback(plainInvoice),
  };
};

router.get(
  '/',
  authenticate,
  authorize('admin', 'receptionist', 'therapist'),
  async (req, res, next) => {
    try {
      const {
        status,
        patient_id: patientId,
        from,
        to,
        include,
      } = req.query;

      const query = {};

      if (status) {
        query.status = status;
      }

      if (patientId) {
        query.patient_id = Number(patientId);
      }

      if (from || to) {
        query.issue_date = {};
        if (from) {
          query.issue_date.$gte = new Date(from);
        }
        if (to) {
          query.issue_date.$lte = new Date(to);
        }
      }

      let scopedPatientIdsSet = null;
      if (req.user.role !== 'admin') {
        const scopeQuery = buildPatientScopeQuery(req.user);
        if (scopeQuery) {
          const scopedPatientDocs = await Patient.find(scopeQuery).select('patient_id');
          scopedPatientIdsSet = new Set(scopedPatientDocs.map((doc) => doc.patient_id));
          if (scopedPatientIdsSet.size === 0) {
            return res.json({ success: true, invoices: [] });
          }
          if (query.patient_id) {
            const requested = Number(query.patient_id);
            if (Number.isNaN(requested) || !scopedPatientIdsSet.has(requested)) {
              return res.json({ success: true, invoices: [] });
            }
          } else {
            query.patient_id = { $in: Array.from(scopedPatientIdsSet) };
          }
        } else {
          query.createdBy = req.user.id;
        }
      }

      const invoiceDocs = await Invoice.find(query)
        .sort({ issue_date: -1 });
      let invoices = toPlainObject(invoiceDocs);

      if (include === 'payments') {
        const hydrated = await Promise.all(
          invoices.map((invoice) => refreshInvoiceWithPayments(invoice)),
        );
        invoices = hydrated.map((entry) => entry.invoice);
      }

      const patientIds = [...new Set(
        invoices
          .map((invoice) => invoice.patient_id)
          .filter((value) => typeof value === 'number' && !Number.isNaN(value)),
      )];

      const patientDocs = patientIds.length
        ? await Patient.find({ patient_id: { $in: patientIds } })
          .select('patient_id first_name surname preferred_name email phone primary_contact_name primary_contact_email primary_contact_phone')
        : [];

      const patients = toPlainObject(patientDocs);

      const patientMap = new Map(patients.map((patient) => [patient.patient_id, patient]));

      const payload = invoices.map((invoice) => serializeInvoice(invoice, {
        patient: patientMap.get(invoice.patient_id),
      }));

      const filteredPayload = req.user.role === 'admin'
        ? payload
        : payload.filter((invoice) => {
          const patient = patientMap.get(invoice.patient_id);
          if (patient && userCanAccessPatient(patient, req.user)) {
            return true;
          }
          if (invoice.createdBy && invoice.createdBy.toString && invoice.createdBy.toString() === String(req.user.id)) {
            return true;
          }
          return false;
        });

      res.json({
        success: true,
        invoices: filteredPayload,
      });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:invoiceNumber',
  authenticate,
  authorize('admin', 'receptionist', 'therapist'),
  async (req, res, next) => {
    try {
      const invoice = await Invoice.findOne({ invoice_number: req.params.invoiceNumber });
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }
      invoice.client_id = invoice.client_id || invoice.patient_id;

      const patientDoc = await Patient.findOne({ patient_id: invoice.patient_id });
      const patient = toPlainObject(patientDoc);
      if (
        req.user.role !== 'admin'
        && !userCanAccessPatient(patient, req.user)
        && !(invoice.createdBy && invoice.createdBy.toString && invoice.createdBy.toString() === String(req.user.id))
      ) {
        return res.status(403).json({ success: false, message: 'Forbidden' });
      }
      const refreshed = await refreshInvoiceWithPayments(invoice);
      res.json({
        success: true,
        invoice: serializeInvoice(refreshed.invoice, { patient }),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/',
  authenticate,
  authorize('admin', 'receptionist'),
  async (req, res, next) => {
    try {
      const {
        patient_id: patientId,
        appointment_id: appointmentId,
        line_items: lineItemsInput,
        discount,
        notes,
        due_date: dueDate,
        sendEmail = false,
        currency = 'GBP',
        issue_date: issueDate,
      } = req.body;

      if (!patientId || !lineItemsInput || lineItemsInput.length === 0) {
        return res.status(400).json({ success: false, message: 'patient_id and at least one line item are required' });
      }

      const patient = await Patient.findOne({ patient_id: patientId });
      if (!patient) {
        return res.status(404).json({ success: false, message: 'Patient not found' });
      }

      const billingContact = resolveBillingContact(patient);
      const settings = await resolveSettings();
      const identifiers = await nextInvoiceIdentifiers(settings);

      const lineItems = normalizeLineItems(lineItemsInput);
      const invoiceDiscountInput = discount
        ? {
          amount: Number(discount.amount) || 0,
          notes: discount.notes,
        }
        : { amount: 0 };

      const totals = calculateTotals({
        lineItems,
        discount: invoiceDiscountInput,
      });
      const normalizedDiscount = invoiceDiscountInput.notes
        ? {
          amount: totals.discountAmount || 0,
          invoice_amount: totals.invoiceDiscountAmount || 0,
          line_item_amount: totals.lineDiscountTotal || 0,
          notes: invoiceDiscountInput.notes,
        }
        : {
          amount: totals.discountAmount || 0,
          invoice_amount: totals.invoiceDiscountAmount || 0,
          line_item_amount: totals.lineDiscountTotal || 0,
        };
      const invoiceTotals = totals.totals || {
        net: totals.subtotal,
        discount: totals.discountAmount,
        gross: totals.totalDue,
        paid: 0,
        balance: totals.balanceDue,
      };

      const appointmentIds = collectAppointmentIds(appointmentId, req.body.appointment_ids);
      if (appointmentIds.length > 0) {
        const appointments = await Appointment.find({ appointment_id: { $in: appointmentIds } });
        if (appointments.length !== appointmentIds.length) {
          const foundIds = new Set(appointments.map((entry) => entry.appointment_id));
          const missingId = appointmentIds.find((id) => !foundIds.has(id));
          return res.status(404).json({
            success: false,
            message: `Appointment ${missingId} not found`,
          });
        }

        const invalidAppointment = appointments.find((appointment) => appointment.patient_id !== patient.patient_id);
        if (invalidAppointment) {
          return res.status(400).json({
            success: false,
            message: `Appointment ${invalidAppointment.appointment_id} does not belong to the selected patient`,
          });
        }

        const conflictingInvoice = await Invoice.findOne({
          $or: [
            { appointment_id: { $in: appointmentIds } },
            { appointment_ids: { $in: appointmentIds } },
          ],
        });

        if (conflictingInvoice) {
          return res.status(409).json({
            success: false,
            message: 'An invoice already references one of the selected appointments',
            invoice_number: conflictingInvoice.invoice_number,
          });
        }
      }

      const invoice = await Invoice.create({
        invoice_id: identifiers.invoiceId,
        invoice_number: identifiers.invoiceNumber,
        patient_id: patient.patient_id,
        client_id: patient.patient_id,
        patient: patient.id,
        billing_contact_name: billingContact.name,
        billing_contact_email: billingContact.email,
        billing_contact_phone: billingContact.phone,
        appointment_id: appointmentIds[0] ?? undefined,
        appointment_ids: appointmentIds,
        line_items: lineItems,
        totals: invoiceTotals,
        discount: normalizedDiscount,
        subtotal: totals.subtotal,
        total_due: totals.totalDue,
        total_paid: 0,
        balance_due: totals.balanceDue,
        currency,
        issue_date: issueDate || new Date(),
        due_date: dueDate,
        notes,
        status: 'draft',
        createdBy: req.user.id,
        email_log: {
          status: 'not_sent',
        },
      });

      const invoiceForPdf = await buildInvoiceExportPayload({
        invoice,
        patient,
        billingContact,
      });

      const { pdfPath, pdfBuffer, html } = await generateInvoicePdf({
        invoice: invoiceForPdf,
        clinicSettings: settings,
      });

      invoice.pdf_path = pdfPath ? path.relative(process.cwd(), pdfPath) : null;
      invoice.pdf_url = buildPdfUrl(invoice.invoice_number);
      invoice.pdf_generated_at = new Date();
      invoice.html_snapshot = html;

      await invoice.save();

      if (sendEmail) {
        const emailContent = buildInvoiceDeliveryEmail({
          invoice: invoiceForPdf || invoice,
          billingContact,
          clinicSettings: settings,
          patient,
        });
        const emailResult = await sendTransactionalEmail({
          to: billingContact.email,
          subject: emailContent.subject,
          html: emailContent.html,
          text: emailContent.text,
          attachments: [
            {
              content: pdfBuffer,
              filename: `${invoice.invoice_number}.pdf`,
              type: 'application/pdf',
              disposition: 'attachment',
            },
          ],
          patientId: patient.patient_id,
          metadata: { invoice_number: invoice.invoice_number },
        });

        const emailDelivered = !emailResult.simulated && emailResult.status !== 'failed';

        invoice.email_log = {
          status: emailResult.status,
          provider: emailResult.provider || 'unknown',
          providerMessageId: emailResult.providerMessageId,
          lastAttemptAt: new Date(),
          errorMessage: emailResult.errorMessage,
        };
        if (emailDelivered) {
          invoice.status = 'sent';
          invoice.sent_at = new Date();
        } else if (emailResult.status === 'failed') {
          invoice.status = 'draft';
        }
        await invoice.save();
      }

      await recordAuditEvent({
        event: 'invoice.create',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: {
          invoice_number: invoice.invoice_number,
          patient_id: patient.patient_id.toString(),
        },
      });

      res.status(201).json({
        success: true,
        invoice: serializeInvoice(invoice, { patient }),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.put(
  '/:invoiceNumber',
  authenticate,
  authorize('admin', 'receptionist'),
  async (req, res, next) => {
    try {
      const invoice = await Invoice.findOne({ invoice_number: req.params.invoiceNumber });
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }
      const patientDoc = await Patient.findOne({ patient_id: invoice.patient_id });
      const patient = toPlainObject(patientDoc);

      const lineItems = req.body.line_items
        ? normalizeLineItems(req.body.line_items)
        : invoice.line_items;

      const invoiceDiscountInput = req.body.discount
        ? {
          amount: Number(req.body.discount.amount) || 0,
          notes: req.body.discount.notes,
        }
        : {
          amount: Number(invoice.discount?.invoice_amount || 0),
          notes: invoice.discount?.notes,
        };

      const totals = calculateTotals({
        lineItems,
        discount: invoiceDiscountInput,
      });
      const normalizedDiscount = invoiceDiscountInput.notes
        ? {
          amount: totals.discountAmount || 0,
          invoice_amount: totals.invoiceDiscountAmount || 0,
          line_item_amount: totals.lineDiscountTotal || 0,
          notes: invoiceDiscountInput.notes,
        }
        : {
          amount: totals.discountAmount || 0,
          invoice_amount: totals.invoiceDiscountAmount || 0,
          line_item_amount: totals.lineDiscountTotal || 0,
        };

      invoice.line_items = lineItems;
      invoice.discount = normalizedDiscount;
      invoice.subtotal = totals.subtotal;
      invoice.total_due = totals.totalDue;
      invoice.balance_due = totals.balanceDue;
      invoice.currency = req.body.currency || invoice.currency;
      invoice.due_date = req.body.due_date || invoice.due_date;
      invoice.notes = req.body.notes ?? invoice.notes;
      invoice.status = req.body.status || invoice.status;
      invoice.updatedBy = req.user.id;

      const refreshed = await refreshInvoiceWithPayments(invoice);

      await invoice.save();

      await recordAuditEvent({
        event: 'invoice.update',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { invoice_number: invoice.invoice_number },
      });

      res.json({ success: true, invoice: serializeInvoice(refreshed.invoice, { patient }) });
    } catch (error) {
      next(error);
    }
  },
);

router.get(
  '/:invoiceNumber/pdf',
  authenticate,
  authorize('admin', 'receptionist', 'therapist'),
  async (req, res, next) => {
    try {
      console.log('[invoicePdf] request', {
        invoice: req.params.invoiceNumber,
        user: req.user?.id,
        time: new Date().toISOString(),
      });
      const invoice = await Invoice.findOne({ invoice_number: req.params.invoiceNumber });
      if (!invoice) {
        console.warn('[invoicePdf] not-found', { invoice: req.params.invoiceNumber });
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      const patient = await Patient.findOne({ patient_id: invoice.patient_id });
      if (!patient) {
        console.warn('[invoicePdf] patient-not-found', {
          invoice: req.params.invoiceNumber,
          patientId: invoice.patient_id,
        });
        return res.status(404).json({ success: false, message: 'Patient not found' });
      }

      const settings = await resolveSettings();
      const billingContact = resolveInvoiceContact(invoice, patient);

      const invoiceForExport = await buildInvoiceExportPayload({
        invoice,
        patient,
        billingContact,
      });

      const renderStart = Date.now();
      const { pdfPath, pdfBuffer, html } = await generateInvoicePdf({
        invoice: invoiceForExport,
        clinicSettings: settings,
      });
      const renderDurationMs = Date.now() - renderStart;
      console.log('[invoicePdf] render-complete', {
        invoice: invoice.invoice_number,
        bufferSize: pdfBuffer?.length,
        persistedPath: pdfPath ? path.relative(process.cwd(), pdfPath) : null,
        durationMs: renderDurationMs,
      });
      if (!pdfBuffer?.length) {
        console.error('[invoicePdf] empty-buffer', {
          invoice: invoice.invoice_number,
        });
      }

      invoice.pdf_path = pdfPath ? path.relative(process.cwd(), pdfPath) : null;
      invoice.pdf_url = buildPdfUrl(invoice.invoice_number);
      invoice.pdf_generated_at = new Date();
      invoice.html_snapshot = html;
      invoice.updatedBy = req.user.id;
      await invoice.save();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${invoice.invoice_number}.pdf"`);
      console.log('[invoicePdf] response-ready', {
        invoice: invoice.invoice_number,
        contentLength: pdfBuffer?.length,
      });
      return res.send(pdfBuffer);
    } catch (error) {
      console.error('[invoicePdf] error', {
        invoice: req.params.invoiceNumber,
        message: error?.message,
        stack: error?.stack,
      });
      return next(error);
    }
  },
);

router.post(
  '/:invoiceNumber/send',
  authenticate,
  authorize('admin', 'receptionist'),
  async (req, res, next) => {
    try {
      const invoice = await Invoice.findOne({ invoice_number: req.params.invoiceNumber });
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      const patient = await Patient.findOne({ patient_id: invoice.patient_id });
      if (!patient) {
        return res.status(404).json({ success: false, message: 'Patient not found' });
      }

      const settings = await resolveSettings();

      const billingContact = resolveInvoiceContact(invoice, patient);

      const invoiceForExport = await buildInvoiceExportPayload({
        invoice,
        patient,
        billingContact,
      });

      const { pdfPath, pdfBuffer, html } = await generateInvoicePdf({
        invoice: invoiceForExport,
        clinicSettings: settings,
      });
      invoice.pdf_path = pdfPath ? path.relative(process.cwd(), pdfPath) : null;
      invoice.pdf_url = buildPdfUrl(invoice.invoice_number);
      invoice.pdf_generated_at = new Date();
      invoice.html_snapshot = html;

      const emailContent = buildInvoiceDeliveryEmail({
        invoice: invoiceForExport || invoice,
        billingContact,
        clinicSettings: settings,
        patient,
      });

      const emailResult = await sendTransactionalEmail({
        to: billingContact.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        attachments: [
          {
            content: pdfBuffer,
            filename: `${invoice.invoice_number}.pdf`,
            type: 'application/pdf',
            disposition: 'attachment',
          },
        ],
        patientId: patient.patient_id,
        metadata: { invoice_number: invoice.invoice_number },
      });

      const emailDelivered = !emailResult.simulated && emailResult.status !== 'failed';

      invoice.email_log = {
        status: emailResult.status,
        provider: emailResult.provider || 'unknown',
        providerMessageId: emailResult.providerMessageId,
        lastAttemptAt: new Date(),
        errorMessage: emailResult.errorMessage,
      };
      if (emailDelivered) {
        invoice.status = 'sent';
        invoice.sent_at = new Date();
      } else if (emailResult.status === 'failed') {
        invoice.status = 'draft';
      }

      invoice.updatedBy = req.user.id;
      await invoice.save();

      await recordAuditEvent({
        event: 'invoice.send',
        success: emailResult.status !== 'failed',
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { invoice_number: invoice.invoice_number },
      });

      res.json({
        success: emailDelivered,
        emailResult,
        message: emailDelivered
          ? 'Invoice emailed successfully.'
          : emailResult.errorMessage || 'Unable to send invoice email.',
        invoice: serializeInvoice(invoice, { patient, billingContact }),
      });
    } catch (error) {
      next(error);
    }
  },
);

router.post(
  '/:invoiceNumber/pay',
  authenticate,
  authorize('admin', 'receptionist'),
  async (req, res, next) => {
    try {
      const invoice = await Invoice.findOne({ invoice_number: req.params.invoiceNumber });
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      const patientDoc = await Patient.findOne({ patient_id: invoice.patient_id });
      const patient = toPlainObject(patientDoc);
      if (!patient) {
        return res.status(404).json({ success: false, message: 'Patient not found' });
      }

      const refreshedBefore = await refreshInvoiceWithPayments(invoice);
      const outstanding = Math.max(refreshedBefore.invoice.balance_due || 0, 0);

      if (outstanding <= 0) {
        return res.status(400).json({ success: false, message: 'Invoice is already fully paid' });
      }

      const requestedAmount = Number(req.body.amount ?? outstanding);
      if (Number.isNaN(requestedAmount) || requestedAmount <= 0) {
        return res.status(400).json({ success: false, message: 'amount must be greater than 0' });
      }

      const paymentAmount = Math.min(requestedAmount, outstanding);
      const paymentDate = req.body.payment_date ? new Date(req.body.payment_date) : new Date();

      const paymentId = await Counter.next('payment_id', 1);
      const payment = await Payment.create({
        payment_id: paymentId,
        invoice_id: invoice.invoice_id,
        invoice_number: invoice.invoice_number,
        patient_id: invoice.patient_id,
        appointment_id: invoice.appointment_id,
        amount_paid: paymentAmount,
        currency: invoice.currency || 'GBP',
        payment_date: paymentDate,
        method: req.body.method || 'other',
        reference: req.body.reference,
        notes: req.body.notes,
        recordedBy: req.user.id,
      });

      const refreshed = await refreshInvoiceWithPayments(invoice);
      invoice.updatedBy = req.user.id;
      if (refreshed.invoice.balance_due <= 0) {
        invoice.paid_at = invoice.paid_at || new Date();
      }
      await invoice.save();

      await recordAuditEvent({
        event: 'invoice.markPaid',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: {
          invoice_number: invoice.invoice_number,
          payment_id: payment.payment_id.toString(),
        },
      });

      return res.json({
        success: true,
        message: 'Invoice marked as paid.',
        payment,
        invoice: serializeInvoice(refreshed.invoice, { patient }),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.patch(
  '/:invoiceNumber/void',
  authenticate,
  authorize('admin'),
  async (req, res, next) => {
    try {
      const invoice = await Invoice.findOne({ invoice_number: req.params.invoiceNumber });
      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      const patientDoc = await Patient.findOne({ patient_id: invoice.patient_id });
      const patient = toPlainObject(patientDoc);

      await Invoice.deleteOne({ _id: invoice._id });

      await recordAuditEvent({
        event: 'invoice.delete',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: { invoice_number: invoice.invoice_number },
      });

      res.json({
        success: true,
        message: 'Invoice deleted successfully.',
        invoice: serializeInvoice(invoice, { patient }),
      });
    } catch (error) {
      next(error);
    }
  },
);

module.exports = router;
