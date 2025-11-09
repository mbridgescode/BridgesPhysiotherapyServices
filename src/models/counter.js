const mongoose = require('mongoose');

const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  value: { type: Number, default: 0 },
}, { timestamps: true });

counterSchema.statics.next = async function next(key, increment = 1) {
  const result = await this.findOneAndUpdate(
    { key },
    { $inc: { value: increment } },
    { new: true, upsert: true },
  );
  return result.value;
};

module.exports = mongoose.model('Counter', counterSchema);
