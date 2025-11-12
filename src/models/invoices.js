// models/invoice.js
const mongoose = require('mongoose');
const { encryptedStringField } = require('../utils/fieldEncryption');

const lineItemSchema = new mongoose.Schema({
  line_id: { type: String, required: true },
  description: { type: String, required: true },
  quantity: { type: Number, required: true, min: 1, default: 1 },
  unit_price: { type: Number, required: true },
  discount_amount: { type: Number, default: 0 },
  total: { type: Number, required: true },
  appointment_id: { type: Number },
  service_date: { type: Date },
  meta: { type: String, trim: true },
  notes: encryptedStringField({ trim: true }),
}, { _id: false });

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

const totalsSchema = new mongoose.Schema({
  net: { type: Number, default: 0 },
  discount: { type: Number, default: 0 },
  gross: { type: Number, default: 0 },
  paid: { type: Number, default: 0 },
  balance: { type: Number, default: 0 },
}, { _id: false });

const InvoiceSchema = new mongoose.Schema({
  invoice_id: {
    type: Number,
    index: true,
  },
  invoice_number: {
    type: String,
    required: true,
    unique: true,
    trim: true,
  },
  patient_id: {
    type: Number,
    required: true,
  },
  client_id: {
    type: Number,
    index: true,
  },
  appointment_id: {
    type: Number,
  },
  appointment_ids: {
    type: [Number],
    default: [],
  },
  patient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Patient',
  },
  billing_contact_name: encryptedStringField({ trim: true }),
  billing_contact_email: encryptedStringField({
    trim: true,
    normalize: (value) => value.toLowerCase(),
  }),
  billing_contact_phone: encryptedStringField({ trim: true }),
  status: {
    type: String,
    enum: ['draft', 'sent', 'partially_paid', 'paid', 'void'],
    default: 'draft',
  },
  line_items: {
    type: [lineItemSchema],
    default: [],
  },
  totals: {
    type: totalsSchema,
    default: () => ({}),
  },
  subtotal: { type: Number, required: true },
  discount: {
    amount: { type: Number, default: 0 },
    invoice_amount: { type: Number, default: 0 },
    line_item_amount: { type: Number, default: 0 },
    notes: encryptedStringField({ trim: true }),
  },
  total_due: { type: Number, required: true },
  total_paid: { type: Number, default: 0 },
  balance_due: { type: Number, required: true },
  issue_date: { type: Date, default: Date.now },
  due_date: { type: Date },
  sent_at: { type: Date },
  paid_at: { type: Date },
  pdf_path: { type: String, trim: true },
  pdf_url: { type: String, trim: true },
  pdf_generated_at: { type: Date },
  html_snapshot: { type: String },
  currency: { type: String, default: 'GBP' },
  notes: encryptedStringField({ trim: true }),
  email_log: deliveryStatusSchema,
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

InvoiceSchema.index({ invoice_number: 1 });
InvoiceSchema.index({ patient_id: 1, createdAt: -1 });
InvoiceSchema.index({ client_id: 1, createdAt: -1 });
InvoiceSchema.index({ appointment_id: 1 });
InvoiceSchema.index({ appointment_ids: 1 });

InvoiceSchema.set('toJSON', { getters: true, virtuals: true });
InvoiceSchema.set('toObject', { getters: true, virtuals: true });
InvoiceSchema.set('runSettersOnQuery', true);

module.exports = mongoose.model('Invoice', InvoiceSchema);
