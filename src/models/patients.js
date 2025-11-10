const mongoose = require('mongoose');
const {
  encryptedStringField,
  encryptedDateField,
  encryptedStringArrayField,
} = require('../utils/fieldEncryption');
const { buildPatientSearchTokens } = require('../utils/patientSecurity');

const addressSchema = new mongoose.Schema({
  line1: encryptedStringField({ trim: true }),
  line2: encryptedStringField({ trim: true }),
  city: encryptedStringField({ trim: true }),
  state: encryptedStringField({ trim: true }),
  postcode: encryptedStringField({ trim: true }),
  country: encryptedStringField({ trim: true }),
}, { _id: false });

const emergencyContactSchema = new mongoose.Schema({
  name: encryptedStringField({ trim: true }),
  relationship: encryptedStringField({ trim: true }),
  phone: encryptedStringField({ trim: true }),
  email: encryptedStringField({
    trim: true,
    normalize: (value) => value.toLowerCase(),
  }),
}, { _id: false });

const insuranceSchema = new mongoose.Schema({
  provider: encryptedStringField({ trim: true }),
  policyNumber: encryptedStringField({ trim: true }),
  memberId: encryptedStringField({ trim: true }),
  expiry: encryptedDateField({}),
  notes: encryptedStringField({ trim: true }),
}, { _id: false });

const PatientSchema = new mongoose.Schema({
  patient_id: {
    type: Number,
    required: true,
    unique: true,
  },
  first_name: encryptedStringField({
    required: true,
    trim: true,
  }),
  surname: encryptedStringField({
    required: true,
    trim: true,
  }),
  preferred_name: encryptedStringField({
    trim: true,
  }),
  date_of_birth: encryptedDateField({}),
  gender: {
    type: String,
    enum: ['female', 'male', 'non-binary', 'other', 'unknown'],
    default: 'unknown',
  },
  email: encryptedStringField({
    required: true,
    trim: true,
    normalize: (value) => value.toLowerCase(),
  }),
  phone: encryptedStringField({
    required: true,
    trim: true,
  }),
  primary_contact_name: encryptedStringField({
    trim: true,
  }),
  primary_contact_email: encryptedStringField({
    trim: true,
    normalize: (value) => value.toLowerCase(),
  }),
  primary_contact_phone: encryptedStringField({
    trim: true,
  }),
  secondary_phone: encryptedStringField({
    trim: true,
  }),
  address: addressSchema,
  emergency_contact: emergencyContactSchema,
  insurance: insuranceSchema,
  medical_alerts: encryptedStringArrayField({
    default: [],
  }),
  primary_therapist_id: {
    type: Number,
  },
  primaryTherapist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'archived'],
    default: 'active',
  },
  tags: {
    type: [String],
    default: [],
  },
  billing_mode: {
    type: String,
    enum: ['individual', 'monthly'],
    default: 'individual',
  },
  consent_signed_at: encryptedDateField({}),
  notes_summary: encryptedStringField({
    trim: true,
  }),
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  searchTokens: {
    type: [String],
    default: [],
    select: false,
    index: true,
  },
}, { timestamps: true });

PatientSchema.pre('save', function setSearchTokens(next) {
  this.searchTokens = buildPatientSearchTokens(this);
  next();
});

PatientSchema.set('toJSON', { getters: true, virtuals: true });
PatientSchema.set('toObject', { getters: true, virtuals: true });
PatientSchema.set('runSettersOnQuery', true);

module.exports = mongoose.model('Patient', PatientSchema);
