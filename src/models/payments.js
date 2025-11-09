// src/models/payments.js

const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { encryptedStringField } = require('../utils/fieldEncryption');

// Define the schema for payments
const paymentSchema = new Schema({
  payment_id: { type: Number, required: true, unique: true },
  invoice_id: { type: Number, index: true },
  invoice_number: { type: String, trim: true, index: true },
  patient_id: { type: Number, required: true, index: true },
  appointment_id: { type: Number },
  treatment_id: { type: Number },
  treatment_description: { type: String },
  amount_paid: { type: Number, required: true },
  currency: { type: String, default: 'GBP' },
  payment_date: { type: Date, default: Date.now },
  method: { type: String, enum: ['card', 'cash', 'transfer', 'insurance', 'other'], default: 'other' },
  reference: encryptedStringField({ trim: true }),
  status: {
    type: String,
    enum: ['applied', 'pending', 'failed', 'refunded'],
    default: 'applied',
  },
  notes: encryptedStringField({ trim: true }),
  recordedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

paymentSchema.set('toJSON', { getters: true, virtuals: true });
paymentSchema.set('toObject', { getters: true, virtuals: true });
paymentSchema.set('runSettersOnQuery', true);

// Export the Payment model
module.exports = mongoose.model('Payment', paymentSchema);
