const mongoose = require('mongoose');

const { Schema } = mongoose;

const treatmentNoteTemplateSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  body: {
    type: String,
    required: true,
    trim: true,
  },
  tags: {
    type: [String],
    default: [],
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  archived: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

treatmentNoteTemplateSchema.index({ name: 1 }, { unique: false });
treatmentNoteTemplateSchema.index({ archived: 1 });

treatmentNoteTemplateSchema.set('toJSON', { virtuals: true });
treatmentNoteTemplateSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('TreatmentNoteTemplate', treatmentNoteTemplateSchema, 'treatment_note_templates');
