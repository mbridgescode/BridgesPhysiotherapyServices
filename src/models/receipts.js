// src/models/receipts.js

const mongoose = require('mongoose');
const { encryptedStringField } = require('../utils/fieldEncryption');

const deliveryStatusSchema = new mongoose.Schema({
  status: {
    type: String,
    enum: ['not_sent', 'queued', 'sent', 'delivered', 'bounced', 'failed'],
    default: 'not_sent',
  },
  provider: { type: String, trim: true },
  providerMessageId: { type: String, trim: true },
  lastAttemptAt: { type: Date },
  errorMessage: { type: String, trim: true },
}, { _id: false });

const receiptSchema = new mongoose.Schema({
  receipt_id: { type: Number, required: true, unique: true, index: true },
  receipt_number: { type: String, required: true, unique: true, trim: true, index: true },
  payment_id: { type: Number, required: true, unique: true, index: true },
  invoice_id: { type: Number, index: true },
  invoice_number: { type: String, trim: true, index: true },
  patient_id: { type: Number, required: true, index: true },
  appointment_id: { type: Number },
  amount_paid: { type: Number, required: true },
  currency: { type: String, default: 'GBP' },
  payment_date: { type: Date },
  method: {
    type: String,
    enum: ['card', 'cash', 'transfer', 'cheque', 'insurance', 'other'],
    default: 'other',
  },
  reference: encryptedStringField({ trim: true }),
  notes: encryptedStringField({ trim: true }),
  receipt_date: { type: Date, default: Date.now },
  status: {
    type: String,
    enum: ['draft', 'sent'],
    default: 'draft',
  },
  sent_at: { type: Date },
  pdf_path: { type: String, trim: true },
  pdf_url: { type: String, trim: true },
  pdf_generated_at: { type: Date },
  html_snapshot: { type: String },
  email_log: deliveryStatusSchema,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

receiptSchema.index({ receipt_number: 1 });
receiptSchema.index({ patient_id: 1, createdAt: -1 });
receiptSchema.index({ invoice_id: 1 });
receiptSchema.index({ payment_id: 1 });

receiptSchema.set('toJSON', { getters: true, virtuals: true });
receiptSchema.set('toObject', { getters: true, virtuals: true });
receiptSchema.set('runSettersOnQuery', true);

module.exports = mongoose.model('Receipt', receiptSchema);
