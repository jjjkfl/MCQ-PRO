/**
 * src/models/User.js
 * User schema — students & teachers
 */

const mongoose  = require('mongoose');
const bcrypt    = require('bcryptjs');
const CryptoJS  = require('crypto-js');

const AES_KEY = process.env.AES_SECRET_KEY || 'fallback_key_32_chars_!!!!!!!!!';

/* ─── Helpers ─────────────────────────────────────────────────────── */
const encrypt = (text) =>
  text ? CryptoJS.AES.encrypt(text.toString(), AES_KEY).toString() : text;

const decrypt = (cipherText) => {
  if (!cipherText) return cipherText;
  try {
    return CryptoJS.AES.decrypt(cipherText, AES_KEY).toString(CryptoJS.enc.Utf8);
  } catch {
    return cipherText;
  }
};

/* ─── Schema ──────────────────────────────────────────────────────── */
const userSchema = new mongoose.Schema(
  {
    firstName : { type: String, required: [true, 'First name is required'], trim: true, maxlength: 50 },
    lastName  : { type: String, required: [true, 'Last name is required'],  trim: true, maxlength: 50 },
    email     : {
      type      : String,
      required  : [true, 'Email is required'],
      unique    : true,
      lowercase : true,
      trim      : true,
      match     : [/^\S+@\S+\.\S+$/, 'Please provide a valid email'],
    },
    password  : { type: String, required: [true, 'Password is required'], minlength: 8, select: false },
    role      : { type: String, enum: ['student', 'teacher', 'admin'], default: 'student' },

    /* Student-specific fields */
    studentId : { type: String, unique: true, sparse: true },
    program   : { type: String, trim: true },
    semester  : { type: Number, min: 1, max: 12 },
    cgpa      : { type: Number, min: 0, max: 4, default: 0 },

    /* Teacher-specific fields */
    employeeId  : { type: String, unique: true, sparse: true },
    department  : { type: String, trim: true },
    designation : { type: String, trim: true },

    /* Encrypted sensitive PII */
    phoneEncrypted   : { type: String },
    addressEncrypted : { type: String },

    /* Account control */
    isActive       : { type: Boolean, default: true },
    isVerified     : { type: Boolean, default: false },
    lastLogin      : { type: Date },
    loginAttempts  : { type: Number, default: 0 },
    lockUntil      : { type: Date },
    refreshToken   : { type: String, select: false },
    passwordChangedAt : { type: Date },

    /* Notifications */
    notifications : [
      {
        message   : String,
        read      : { type: Boolean, default: false },
        createdAt : { type: Date, default: Date.now },
      },
    ],
  },
  {
    timestamps : true,
    toJSON     : { virtuals: true, getters: false },
    toObject   : { virtuals: true },
  }
);

/* ─── Indexes ─────────────────────────────────────────────────────── */
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ studentId: 1 });

/* ─── Virtuals ────────────────────────────────────────────────────── */
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.virtual('phone').get(function () {
  return this.phoneEncrypted ? decrypt(this.phoneEncrypted) : null;
});
userSchema.virtual('phone').set(function (val) {
  this.phoneEncrypted = encrypt(val);
});

userSchema.virtual('address').get(function () {
  return this.addressEncrypted ? decrypt(this.addressEncrypted) : null;
});
userSchema.virtual('address').set(function (val) {
  this.addressEncrypted = encrypt(val);
});

userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

/* ─── Pre-save: Hash password ─────────────────────────────────────── */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password         = await bcrypt.hash(this.password, 12);
  this.passwordChangedAt = new Date();
  next();
});

/* ─── Pre-save: Auto-generate IDs ────────────────────────────────── */
userSchema.pre('save', async function (next) {
  if (this.isNew) {
    const year = new Date().getFullYear().toString().slice(-2);
    if (this.role === 'student' && !this.studentId) {
      const count = await mongoose.model('User').countDocuments({ role: 'student' });
      this.studentId = `STU${year}${String(count + 1).padStart(5, '0')}`;
    }
    if (this.role === 'teacher' && !this.employeeId) {
      const count = await mongoose.model('User').countDocuments({ role: 'teacher' });
      this.employeeId = `TCH${year}${String(count + 1).padStart(4, '0')}`;
    }
  }
  next();
});

/* ─── Instance Methods ────────────────────────────────────────────── */
userSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.incLoginAttempts = async function () {
  /* Unlock if lock has expired */
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({ $set: { loginAttempts: 1 }, $unset: { lockUntil: 1 } });
  }
  const updates = { $inc: { loginAttempts: 1 } };
  if (this.loginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 2 * 60 * 60 * 1000 }; // 2-hour lock
  }
  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = async function () {
  return this.updateOne({ $set: { loginAttempts: 0, lastLogin: new Date() }, $unset: { lockUntil: 1 } });
};

userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    return parseInt(this.passwordChangedAt.getTime() / 1000, 10) > JWTTimestamp;
  }
  return false;
};

/* ─── Static Methods ──────────────────────────────────────────────── */
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase() }).select('+password +refreshToken');
};

const User = mongoose.model('User', userSchema);
module.exports = User;