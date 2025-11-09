// models/notes.js
const mongoose = require('mongoose');
const { encryptedStringField } = require('../utils/fieldEncryption');

const NotesSchema = new mongoose.Schema({
  patient_id: { type: Number, required: true, index: true },
  appointment_id: { type: Number },
  employeeID: { type: Number },
  author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  type: {
    type: String,
    enum: ['treatment', 'communication', 'administrative'],
    default: 'treatment',
  },
  note: encryptedStringField({ required: true }),
  visibility: {
    type: String,
    enum: ['private', 'team', 'admin'],
    default: 'team',
  },
  date: { type: Date, default: Date.now },
  attachments: {
    type: [{
      fileName: String,
      fileUrl: String,
    }],
    default: [],
  },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

NotesSchema.set('toJSON', { getters: true, virtuals: true });
NotesSchema.set('toObject', { getters: true, virtuals: true });
NotesSchema.set('runSettersOnQuery', true);

module.exports = mongoose.model('Notes', NotesSchema);
