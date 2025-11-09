const express = require('express');
const Payment = require('../models/payments');
const Invoice = require('../models/invoices');
const Counter = require('../models/counter');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/audit');
const { refreshInvoiceWithPayments } = require('../utils/invoices');

const router = express.Router();

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

      const payments = await Payment.find(query).sort({ payment_date: -1 });

      res.json({ success: true, payments });
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
        return res.status(400).json({ success: false, message: 'invoice_number or invoice_id is required' });
      }

      const invoice = await Invoice.findOne({
        $or: [
          { invoice_number: invoiceNumber },
          { invoice_id: invoiceId },
        ],
      });

      if (!invoice) {
        return res.status(404).json({ success: false, message: 'Invoice not found' });
      }

      const paymentId = await Counter.next('payment_id', 1);

      const payment = await Payment.create({
        payment_id: paymentId,
        invoice_id: invoice.invoice_id,
        invoice_number: invoice.invoice_number,
        patient_id: patientId || invoice.patient_id,
        appointment_id: appointmentId || invoice.appointment_id,
        amount_paid: amountPaid,
        method,
        payment_date: paymentDate || new Date(),
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

      return res.status(201).json({ success: true, payment, invoice });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
