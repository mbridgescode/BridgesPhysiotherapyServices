const mongoose = require('mongoose');

const gpLetterTemplateSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  body: { type: String, required: true, trim: true },
  category: { type: String, trim: true },
  tags: {
    type: [String],
    default: undefined,
  },
  archived: { type: Boolean, default: false },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
}, { timestamps: true });

gpLetterTemplateSchema.set('toJSON', { getters: true, virtuals: true });
gpLetterTemplateSchema.set('toObject', { getters: true, virtuals: true });
gpLetterTemplateSchema.set('runSettersOnQuery', true);

module.exports = mongoose.model('GpLetterTemplate', gpLetterTemplateSchema, 'gp_letter_templates');
