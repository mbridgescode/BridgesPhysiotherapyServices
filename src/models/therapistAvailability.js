const mongoose = require('mongoose');

const slotSchema = new mongoose.Schema({
  day_of_week: { type: Number, min: 0, max: 6, required: true },
  start_time: { type: String, required: true },
  end_time: { type: String, required: true },
  location: { type: String, trim: true },
}, { _id: false });

const therapistAvailabilitySchema = new mongoose.Schema({
  therapist: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  therapist_employee_id: {
    type: Number,
    required: true,
  },
  slots: {
    type: [slotSchema],
    default: [],
  },
  effective_from: { type: Date, required: true },
  effective_to: { type: Date },
  is_default: { type: Boolean, default: false },
  notes: { type: String, trim: true },
}, { timestamps: true });

therapistAvailabilitySchema.index({ therapist: 1, effective_from: -1 });

module.exports = mongoose.model('TherapistAvailability', therapistAvailabilitySchema);
