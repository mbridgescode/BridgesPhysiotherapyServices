const mongoose = require('mongoose');
const Counter = require('./counter');

const profitLossEntrySchema = new mongoose.Schema({
  entry_id: { type: Number, unique: true },
  date: { type: Date, required: true },
  type: {
    type: String,
    enum: ['income', 'expense'],
    default: 'expense',
  },
  category: { type: String, trim: true },
  description: { type: String, trim: true },
  amount: { type: Number, required: true, min: 0 },
  source: {
    type: String,
    enum: ['manual', 'invoice'],
    default: 'manual',
  },
  invoice_number: { type: String, trim: true },
  invoice_id: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

profitLossEntrySchema.pre('save', async function assignEntryId(next) {
  if (this.entry_id) {
    return next();
  }
  try {
    const value = await Counter.next('profit_loss_entry_id', 1);
    this.entry_id = value;
    return next();
  } catch (error) {
    return next(error);
  }
});

profitLossEntrySchema.set('toJSON', { virtuals: true });
profitLossEntrySchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('ProfitLossEntry', profitLossEntrySchema, 'profit_loss_entries');
