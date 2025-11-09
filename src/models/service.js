const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  treatment_id: {
    type: Number,
    required: true,
    unique: true,
  },
  treatment_description: {
    type: String,
    required: true,
    trim: true,
  },
  price: {
    type: Number,
    required: true,
    min: 0,
  },
  duration_minutes: {
    type: Number,
    min: 0,
  },
  active: {
    type: Boolean,
    default: true,
  },
  notes: {
    type: String,
    trim: true,
  },
}, { timestamps: true });

serviceSchema.index({ treatment_description: 1 }, { unique: false });

module.exports = mongoose.model('Service', serviceSchema);
