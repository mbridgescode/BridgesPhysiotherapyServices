const express = require('express');
const Payment = require('../models/payments');
const Invoice = require('../models/invoices');
const Counter = require('../models/counter');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/audit');
const { refreshInvoiceWithPayments } = require('../utils/invoices');
const { toPlainObject } = require('../utils/mongoose');

const router = express.Router();

const sanitizeNumber = (value) => {
  if (value === undefined || value === null || value === '') {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isNaN(parsed) ? undefined : parsed;
};

const findInvoiceByReference = async ({ invoiceNumber, invoiceId }) => {
  if (!invoiceNumber && !invoiceId) {
    return null;
  }
  const query = [];
  if (invoiceNumber) {
    query.push({ invoice_number: invoiceNumber });
  }
  const normalizedInvoiceId = sanitizeNumber(invoiceId);
  if (normalizedInvoiceId !== undefined) {
    query.push({ invoice_id: normalizedInvoiceId });
  }
  if (!query.length) {
    return null;
  }
  return Invoice.findOne({ $or: query });
};

const buildInvoiceSummary = (invoiceDoc) => {
  if (!invoiceDoc) {
    return null;
  }
  const invoice = toPlainObject(invoiceDoc);
  return {
    invoice_id: invoice.invoice_id,
    invoice_number: invoice.invoice_number,
    patient_id: invoice.patient_id,
    patient_name: invoice.patient_name || invoice.billing_contact_name || null,
    total_due: invoice.total_due,
    balance_due: invoice.balance_due,
    currency: invoice.currency || 'GBP',
    status: invoice.status,
  };
};

const refreshInvoiceById = async (invoiceId, userId) => {
  if (!invoiceId && invoiceId !== 0) {
    return null;
  }
  const invoiceDoc = await Invoice.findOne({ invoice_id: invoiceId });
  if (!invoiceDoc) {
    return null;
  }
  await refreshInvoiceWithPayments(invoiceDoc);
  invoiceDoc.updatedBy = userId;
  await invoiceDoc.save();
  return invoiceDoc;
};

router.get(
  '/',
  authenticate,
  authorize('admin', 'receptionist'),
  async (req, res, next) => {
    try {
      const {
        appointment_id: appointmentId,
        invoice_number: invoiceNumber,
        invoice_id: invoiceId,
        patient_id: patientId,
      } = req.query;

      const query = {};

      if (appointmentId) {
        query.appointment_id = Number(appointmentId);
      }

      if (invoiceNumber) {
        query.invoice_number = invoiceNumber;
      }

      if (invoiceId) {
        query.invoice_id = Number(invoiceId);
      }

      if (patientId) {
        query.patient_id = Number(patientId);
      }

      const paymentDocs = await Payment.find(query).sort({ payment_date: -1 });
      const payments = toPlainObject(paymentDocs);
      const invoiceIds = [
        ...new Set(
          payments
            .map((payment) => payment.invoice_id)
            .filter((value) => value !== undefined && value !== null),
        ),
      ];
      const invoices = await Invoice.find({ invoice_id: { $in: invoiceIds } })
        .select('invoice_id invoice_number patient_id patient_name billing_contact_name total_due balance_due currency status');
      const invoiceSummaries = new Map(
        invoices.map((invoice) => [invoice.invoice_id, buildInvoiceSummary(invoice)]),
      );

      res.json({
        success: true,
        payments: payments.map((payment) => ({
          ...payment,
          invoice_summary: invoiceSummaries.get(payment.invoice_id) || null,
        })),
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
        invoice_number: invoiceNumber,
        invoice_id: invoiceId,
        patient_id: patientId,
        appointment_id: appointmentId,
        amount_paid: amountPaid,
        method,
        payment_date: paymentDate,
        reference,
        notes,
      } = req.body;

      if (!invoiceNumber && !invoiceId) {
        return res.status(400).json({
          success: false,
          message: 'invoice_number or invoice_id is required',
        });
      }

      const invoice = await findInvoiceByReference({ invoiceNumber, invoiceId });

      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      const normalizedAmount = Number(amountPaid);
      if (Number.isNaN(normalizedAmount) || normalizedAmount <= 0) {
        return res.status(400).json({ success: false, message: 'amount_paid must be greater than zero' });
      }

      const paymentDateValue = paymentDate ? new Date(paymentDate) : new Date();
      if (Number.isNaN(paymentDateValue.getTime())) {
        return res.status(400).json({ success: false, message: 'payment_date is invalid' });
      }

      const paymentId = await Counter.next('payment_id', 1);

      const payment = await Payment.create({
        payment_id: paymentId,
        invoice_id: invoice.invoice_id,
        invoice_number: invoice.invoice_number,
        patient_id: patientId || invoice.patient_id,
        appointment_id: appointmentId || invoice.appointment_id,
        amount_paid: normalizedAmount,
        method,
        payment_date: paymentDateValue,
        reference,
        notes,
        recordedBy: req.user.id,
      });

      await refreshInvoiceWithPayments(invoice);
      invoice.updatedBy = req.user.id;
      await invoice.save();

      await recordAuditEvent({
        event: 'payment.create',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: {
          invoice_number: invoice.invoice_number,
          payment_id: payment.payment_id.toString(),
        },
      });

      return res.status(201).json({
        success: true,
        payment: {
          ...toPlainObject(payment),
          invoice_summary: buildInvoiceSummary(invoice),
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.put(
  '/:paymentId',
  authenticate,
  authorize('admin', 'receptionist'),
  async (req, res, next) => {
    try {
      const paymentId = sanitizeNumber(req.params.paymentId);
      if (paymentId === undefined) {
        return res.status(400).json({ success: false, message: 'Invalid payment id' });
      }

      const payment = await Payment.findOne({ payment_id: paymentId });
      if (!payment) {
        return res.status(404).json({ success: false, message: 'Payment not found' });
      }

      const {
        invoice_number: invoiceNumber,
        invoice_id: invoiceId,
        patient_id: patientId,
        appointment_id: appointmentId,
        amount_paid: amountPaid,
        method,
        payment_date: paymentDate,
        reference,
        notes,
      } = req.body;

      const previousInvoiceId = payment.invoice_id;
      let invoice = null;
      if (invoiceNumber || invoiceId) {
        invoice = await findInvoiceByReference({ invoiceNumber, invoiceId });
        if (!invoice) {
          return res.status(404).json({ success: false, message: 'Invoice not found' });
        }
        payment.invoice_id = invoice.invoice_id;
        payment.invoice_number = invoice.invoice_number;
      } else if (payment.invoice_id) {
        invoice = await Invoice.findOne({ invoice_id: payment.invoice_id });
      }

      if (!invoice) {
        return res.status(400).json({ success: false, message: 'Payment must be associated with an invoice' });
      }

      if (amountPaid !== undefined) {
        const normalizedAmount = Number(amountPaid);
        if (Number.isNaN(normalizedAmount) || normalizedAmount <= 0) {
          return res.status(400).json({ success: false, message: 'amount_paid must be greater than zero' });
        }
        payment.amount_paid = normalizedAmount;
      }

      if (paymentDate) {
        const paymentDateValue = new Date(paymentDate);
        if (Number.isNaN(paymentDateValue.getTime())) {
          return res.status(400).json({ success: false, message: 'payment_date is invalid' });
        }
        payment.payment_date = paymentDateValue;
      }

      if (method) {
        payment.method = method;
      }

      if (reference !== undefined) {
        payment.reference = reference;
      }

      if (notes !== undefined) {
        payment.notes = notes;
      }

      if (patientId !== undefined) {
        const normalizedPatientId = sanitizeNumber(patientId);
        payment.patient_id = normalizedPatientId ?? payment.patient_id;
      } else if (!payment.patient_id) {
        payment.patient_id = invoice.patient_id;
      }

      if (appointmentId !== undefined) {
        payment.appointment_id = sanitizeNumber(appointmentId);
      }

      await payment.save();

      const invoiceIdsToRefresh = new Set([payment.invoice_id]);
      if (previousInvoiceId && previousInvoiceId !== payment.invoice_id) {
        invoiceIdsToRefresh.add(previousInvoiceId);
      }

      const refreshedInvoices = new Map();
      for (const id of invoiceIdsToRefresh) {
        const refreshed = await refreshInvoiceById(id, req.user.id);
        if (refreshed) {
          refreshedInvoices.set(id, refreshed);
        }
      }

      await recordAuditEvent({
        event: 'payment.update',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: {
          payment_id: payment.payment_id.toString(),
        },
      });

      return res.json({
        success: true,
        payment: {
          ...toPlainObject(payment),
          invoice_summary: buildInvoiceSummary(
            refreshedInvoices.get(payment.invoice_id) || (await Invoice.findOne({ invoice_id: payment.invoice_id })),
          ),
        },
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.delete(
  '/:paymentId',
  authenticate,
  authorize('admin', 'receptionist'),
  async (req, res, next) => {
    try {
      const paymentId = sanitizeNumber(req.params.paymentId);
      if (paymentId === undefined) {
        return res.status(400).json({ success: false, message: 'Invalid payment id' });
      }
      const payment = await Payment.findOneAndDelete({ payment_id: paymentId });
      if (!payment) {
        return res.status(404).json({ success: false, message: 'Payment not found' });
      }

      await refreshInvoiceById(payment.invoice_id, req.user.id);

      await recordAuditEvent({
        event: 'payment.delete',
        success: true,
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: {
          payment_id: payment.payment_id.toString(),
          invoice_number: payment.invoice_number,
        },
      });

      return res.json({ success: true });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
