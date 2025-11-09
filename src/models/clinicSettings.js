const mongoose = require('mongoose');

const brandingSchema = new mongoose.Schema({
  clinic_name: { type: String, trim: true },
  logo_url: { type: String, trim: true },
  primary_colour: { type: String, trim: true },
  secondary_colour: { type: String, trim: true },
  address: { type: String, trim: true },
  phone: { type: String, trim: true },
  email: { type: String, trim: true },
  website: { type: String, trim: true },
}, { _id: false });

const taxSchema = new mongoose.Schema({
  default_rate: { type: Number, default: 0 },
  registration_number: { type: String, trim: true },
}, { _id: false });

const emailTemplateSchema = new mongoose.Schema({
  template_name: { type: String, required: true },
  subject: { type: String, required: true },
  body: { type: String, required: true },
}, { _id: false });

const notificationPreferencesSchema = new mongoose.Schema({
  send_invoice_emails: { type: Boolean, default: true },
  send_payment_reminders: { type: Boolean, default: true },
  reminder_days_before_due: { type: Number, default: 3 },
  reminder_days_after_due: { type: Number, default: 5 },
}, { _id: false });

const clinicSettingsSchema = new mongoose.Schema({
  branding: brandingSchema,
  tax: taxSchema,
  invoice_prefix: { type: String, default: 'INV' },
  email_provider: {
    type: String,
    enum: ['sendgrid', 'postmark', 'smtp', 'none'],
    default: 'none',
  },
  email_templates: {
    type: [emailTemplateSchema],
    default: [],
  },
  notification_preferences: notificationPreferencesSchema,
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

module.exports = mongoose.model('ClinicSettings', clinicSettingsSchema);
