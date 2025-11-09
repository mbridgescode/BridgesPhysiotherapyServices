const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { encryptedStringField } = require('../utils/fieldEncryption');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
  },
  email: {
    type: String,
    required: false,
    trim: true,
    lowercase: true,
  },
  password: {
    type: String,
    required: true,
    minlength: 8,
  },
  role: {
    type: String,
    enum: ['admin', 'therapist', 'receptionist'],
    default: 'therapist',
  },
  employeeID: {
    type: Number,
  },
  administrator: {
    type: Boolean,
    default: false,
  },
  active: {
    type: Boolean,
    default: true,
  },
  lastLoginAt: {
    type: Date,
  },
  failedLoginAttempts: {
    type: Number,
    default: 0,
  },
  lockedAt: {
    type: Date,
  },
  passwordResetToken: {
    type: String,
  },
  passwordResetExpires: {
    type: Date,
  },
  twoFactorEnabled: {
    type: Boolean,
    default: false,
  },
  twoFactorSecret: encryptedStringField({
    select: false,
  }),
  twoFactorTempSecret: encryptedStringField({
    select: false,
  }),
  twoFactorVerifiedAt: {
    type: Date,
  },
}, { timestamps: true });

userSchema.pre('save', async function hashPassword(next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    return next();
  } catch (error) {
    return next(error);
  }
});

userSchema.methods.comparePassword = function comparePassword(candidate) {
  return bcrypt.compare(candidate, this.password);
};

userSchema.methods.resetFailedLoginAttempts = function resetFailedLoginAttempts() {
  this.failedLoginAttempts = 0;
  this.lockedAt = undefined;
  return this.save();
};

userSchema.methods.incrementFailedLogins = async function incrementFailedLogins(threshold = 5) {
  this.failedLoginAttempts += 1;
  if (this.failedLoginAttempts >= threshold) {
    this.lockedAt = new Date();
    this.active = false;
  }
  await this.save();
  return this.failedLoginAttempts;
};

module.exports = mongoose.model('User', userSchema);
