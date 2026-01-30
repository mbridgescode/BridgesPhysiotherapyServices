const express = require('express');
const Receipt = require('../models/receipts');
const { authenticate, authorize } = require('../middleware/auth');
const { recordAuditEvent } = require('../utils/audit');
const { sendTransactionalEmail } = require('../services/emailService');
const {
  ensureReceiptForPayment,
  buildReceiptExportPayload,
  resolveReceiptContact,
} = require('../services/receiptService');
const { buildReceiptDeliveryEmail } = require('../templates/email/receiptDeliveryEmail');
const { toPlainObject } = require('../utils/mongoose');

const router = express.Router();

const resolveReceiptEmailPayload = async ({
  paymentId,
  actorId,
}) => {
  const ensureResult = await ensureReceiptForPayment({
    paymentId,
    actorId,
    forceGeneratePdf: true,
  });

  if (!ensureResult?.receipt) {
    return { error: { status: 404, message: 'Receipt not found' } };
  }

  const patientPlain = toPlainObject(ensureResult.patient);
  if (!patientPlain) {
    return { error: { status: 404, message: 'Patient not found' } };
  }

  const receiptForEmail = ensureResult.receiptForPdf
    || buildReceiptExportPayload({
      receipt: ensureResult.receipt,
      payment: { payment_id: paymentId },
      invoice: ensureResult.invoice,
      patient: patientPlain,
      billingContact: resolveReceiptContact(ensureResult.receipt, patientPlain),
    });

  const billingContact = resolveReceiptContact(receiptForEmail, patientPlain);
  if (!billingContact.email) {
    return { error: { status: 400, message: 'Billing contact email is missing' } };
  }

  if (!ensureResult.pdfBuffer?.length) {
    return { error: { status: 500, message: 'Unable to generate receipt PDF' } };
  }

  return {
    receipt: ensureResult.receipt,
    receiptForEmail,
    billingContact,
    patient: patientPlain,
    clinicSettings: ensureResult.clinicSettings,
    pdfBuffer: ensureResult.pdfBuffer,
  };
};

router.get(
  '/:receiptNumber/pdf',
  authenticate,
  authorize('admin', 'receptionist'),
  async (req, res, next) => {
    try {
      const receipt = await Receipt.findOne({ receipt_number: req.params.receiptNumber });
      if (!receipt) {
        return res.status(404).json({ success: false, message: 'Receipt not found' });
      }

      const ensureResult = await ensureReceiptForPayment({
        paymentId: receipt.payment_id,
        actorId: req.user.id,
        forceGeneratePdf: true,
      });

      if (!ensureResult?.pdfBuffer?.length) {
        return res.status(500).json({ success: false, message: 'Unable to generate receipt PDF' });
      }

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `inline; filename="${receipt.receipt_number}.pdf"`);
      return res.send(ensureResult.pdfBuffer);
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/:receiptNumber/send',
  authenticate,
  authorize('admin', 'receptionist'),
  async (req, res, next) => {
    try {
      const receipt = await Receipt.findOne({ receipt_number: req.params.receiptNumber });
      if (!receipt) {
        return res.status(404).json({ success: false, message: 'Receipt not found' });
      }

      const emailPayload = await resolveReceiptEmailPayload({
        paymentId: receipt.payment_id,
        actorId: req.user.id,
      });

      if (emailPayload.error) {
        return res.status(emailPayload.error.status).json({
          success: false,
          message: emailPayload.error.message,
        });
      }

      const emailContent = buildReceiptDeliveryEmail({
        receipt: emailPayload.receiptForEmail,
        billingContact: emailPayload.billingContact,
        clinicSettings: emailPayload.clinicSettings,
        patient: emailPayload.patient,
      });

      const emailResult = await sendTransactionalEmail({
        to: emailPayload.billingContact.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        attachments: [
          {
            content: emailPayload.pdfBuffer,
            filename: `${emailPayload.receipt.receipt_number}.pdf`,
            type: 'application/pdf',
            disposition: 'attachment',
          },
        ],
        patientId: emailPayload.patient.patient_id,
        metadata: { receipt_number: emailPayload.receipt.receipt_number },
      });

      const emailDelivered = !emailResult.simulated && emailResult.status !== 'failed';

      emailPayload.receipt.email_log = {
        status: emailResult.status,
        provider: emailResult.provider || 'unknown',
        providerMessageId: emailResult.providerMessageId,
        lastAttemptAt: new Date(),
        errorMessage: emailResult.errorMessage,
      };
      if (emailDelivered) {
        emailPayload.receipt.status = 'sent';
        emailPayload.receipt.sent_at = new Date();
      } else if (emailResult.status === 'failed') {
        emailPayload.receipt.status = 'draft';
      }
      emailPayload.receipt.updatedBy = req.user.id;
      await emailPayload.receipt.save();

      await recordAuditEvent({
        event: 'receipt.send',
        success: emailResult.status !== 'failed',
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: {
          receipt_number: emailPayload.receipt.receipt_number,
        },
      });

      res.json({
        success: emailDelivered,
        emailResult,
        message: emailDelivered
          ? 'Receipt emailed successfully.'
          : emailResult.errorMessage || 'Unable to send receipt email.',
        receipt: toPlainObject(emailPayload.receipt),
      });
    } catch (error) {
      return next(error);
    }
  },
);

router.post(
  '/by-payment/:paymentId/send',
  authenticate,
  authorize('admin', 'receptionist'),
  async (req, res, next) => {
    try {
      const paymentId = Number(req.params.paymentId);
      if (Number.isNaN(paymentId)) {
        return res.status(400).json({ success: false, message: 'Invalid payment id' });
      }

      const emailPayload = await resolveReceiptEmailPayload({
        paymentId,
        actorId: req.user.id,
      });

      if (emailPayload.error) {
        return res.status(emailPayload.error.status).json({
          success: false,
          message: emailPayload.error.message,
        });
      }

      const emailContent = buildReceiptDeliveryEmail({
        receipt: emailPayload.receiptForEmail,
        billingContact: emailPayload.billingContact,
        clinicSettings: emailPayload.clinicSettings,
        patient: emailPayload.patient,
      });

      const emailResult = await sendTransactionalEmail({
        to: emailPayload.billingContact.email,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
        attachments: [
          {
            content: emailPayload.pdfBuffer,
            filename: `${emailPayload.receipt.receipt_number}.pdf`,
            type: 'application/pdf',
            disposition: 'attachment',
          },
        ],
        patientId: emailPayload.patient.patient_id,
        metadata: { receipt_number: emailPayload.receipt.receipt_number },
      });

      const emailDelivered = !emailResult.simulated && emailResult.status !== 'failed';

      emailPayload.receipt.email_log = {
        status: emailResult.status,
        provider: emailResult.provider || 'unknown',
        providerMessageId: emailResult.providerMessageId,
        lastAttemptAt: new Date(),
        errorMessage: emailResult.errorMessage,
      };
      if (emailDelivered) {
        emailPayload.receipt.status = 'sent';
        emailPayload.receipt.sent_at = new Date();
      } else if (emailResult.status === 'failed') {
        emailPayload.receipt.status = 'draft';
      }
      emailPayload.receipt.updatedBy = req.user.id;
      await emailPayload.receipt.save();

      await recordAuditEvent({
        event: 'receipt.send',
        success: emailResult.status !== 'failed',
        actorId: req.user.id,
        actorRole: req.user.role,
        metadata: {
          receipt_number: emailPayload.receipt.receipt_number,
          payment_id: paymentId.toString(),
        },
      });

      res.json({
        success: emailDelivered,
        emailResult,
        message: emailDelivered
          ? 'Receipt emailed successfully.'
          : emailResult.errorMessage || 'Unable to send receipt email.',
        receipt: toPlainObject(emailPayload.receipt),
      });
    } catch (error) {
      return next(error);
    }
  },
);

module.exports = router;
