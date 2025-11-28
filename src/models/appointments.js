// src/models/appointments.js
const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const { encryptedStringField } = require('../utils/fieldEncryption');

const recurrenceSchema = new Schema({
  frequency: {
    type: String,
    enum: ['daily', 'weekly', 'monthly'],
  },
  interval: {
    type: Number,
    default: 1,
  },
  daysOfWeek: {
    type: [Number], // 0-6 mapping to Sunday-Saturday
    default: undefined,
  },
  count: {
    type: Number,
  },
  until: {
    type: Date,
  },
}, { _id: false });

const appointmentSchema = new Schema({
  appointment_id: { type: Number, required: true, unique: true },
  series_id: { type: String, trim: true },
  patient_id: { type: Number, required: true },
  patient: { type: Schema.Types.ObjectId, ref: 'Patient' },
  employeeID: { type: Number, required: true },
  therapist: { type: Schema.Types.ObjectId, ref: 'User' },
  date: { type: Date, required: true },
  duration_minutes: { type: Number, default: 60 },
  location: { type: String, required: true },
  room: { type: String, trim: true },
  first_name: encryptedStringField({ required: true }),
  surname: encryptedStringField({ required: true }),
  contact: encryptedStringField({ required: true }),
  completed: { type: Boolean, default: false },
  status: {
    type: String,
    enum: [
      'scheduled',
      'completed',
      'cancelled',
      'cancelled_same_day',
      'cancelled_by_patient',
      'cancelled_by_therapist',
      'other',
    ],
    default: 'scheduled',
  },
  completion_status: {
    type: String,
    enum: [
      'scheduled',
      'completed',
      'completed_manual',
      'cancelled_same_day',
      'cancelled_reschedule',
      'cancelled_by_patient',
      'cancelled_by_therapist',
      'other',
    ],
    default: 'scheduled',
  },
  completion_note: {
    type: String,
    trim: true,
  },
  cancellation_reason: encryptedStringField({ trim: true }),
  cancelled_at: { type: Date },
  treatment_id: { type: Number, required: true },
  treatment_description: { type: String, required: true },
  treatment_count: { type: Number, required: true },
  price: { type: Number, required: true },
  recurrence: recurrenceSchema,
  treatment_notes: encryptedStringField({ default: '' }),
  billing_mode: {
    type: String,
    enum: ['individual', 'monthly'],
    default: 'individual',
  },
  clinical_notes: {
    type: [
      {
        author: { type: Schema.Types.ObjectId, ref: 'User' },
        note: encryptedStringField({ required: true }),
        createdAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

appointmentSchema.index({ date: 1, employeeID: 1 });
appointmentSchema.index({ patient_id: 1, date: -1 });

appointmentSchema.set('toJSON', { getters: true, virtuals: true });
appointmentSchema.set('toObject', { getters: true, virtuals: true });
appointmentSchema.set('runSettersOnQuery', true);

module.exports = mongoose.model('Appointment', appointmentSchema, 'appointments');
