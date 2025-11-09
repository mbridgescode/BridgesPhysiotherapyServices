// models/Communication.js
const mongoose = require('mongoose');
const { encryptedStringField } = require('../utils/fieldEncryption');

const CommunicationSchema = new mongoose.Schema({
  communication_id: { type: Number, required: true, unique: true },
  patient_id: { type: Number, required: true },
  patient: { type: mongoose.Schema.Types.ObjectId, ref: 'Patient' },
  employeeID: { type: Number },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  date: { type: Date, default: Date.now },
  type: {
    type: String,
    enum: ['email', 'sms', 'phone', 'in_person', 'note'],
    required: true,
  },
  subject: encryptedStringField({ trim: true }),
  content: encryptedStringField({ required: true }),
  delivery_status: {
    type: String,
    enum: ['pending', 'sent', 'delivered', 'failed'],
    default: 'pending',
  },
  metadata: { type: Map, of: String },
}, { timestamps: true });

CommunicationSchema.set('toJSON', { getters: true, virtuals: true });
CommunicationSchema.set('toObject', { getters: true, virtuals: true });
CommunicationSchema.set('runSettersOnQuery', true);

module.exports = mongoose.model('Communication', CommunicationSchema);
