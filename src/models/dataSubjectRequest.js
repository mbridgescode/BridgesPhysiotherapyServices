const mongoose = require('mongoose');
const { encryptedStringField } = require('../utils/fieldEncryption');

const historyEntrySchema = new mongoose.Schema({
  action: { type: String, required: true },
  note: encryptedStringField({ trim: true }),
  actor: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now },
}, { _id: false });

const dataSubjectRequestSchema = new mongoose.Schema({
  request_id: {
    type: Number,
    required: true,
    unique: true,
  },
  patient_id: {
    type: Number,
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: ['access', 'rectification', 'erasure', 'restriction', 'portability'],
    required: true,
  },
  status: {
    type: String,
    enum: ['open', 'in_progress', 'fulfilled', 'rejected'],
    default: 'open',
    index: true,
  },
  requesterName: encryptedStringField({ required: true, trim: true }),
  requesterEmail: encryptedStringField({ trim: true, lowercase: true, normalize: (value) => value.toLowerCase() }),
  receivedAt: { type: Date, default: Date.now },
  dueAt: { type: Date, required: true },
  completedAt: { type: Date },
  handledBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  notes: encryptedStringField({ trim: true }),
  history: {
    type: [historyEntrySchema],
    default: [],
  },
}, { timestamps: true });

dataSubjectRequestSchema.index({ dueAt: 1, status: 1 });

module.exports = mongoose.model('DataSubjectRequest', dataSubjectRequestSchema);
