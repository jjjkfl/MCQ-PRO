/**
 * backend/src/models/User.js
 * Schema for Students and Teachers
 * Restoring password hashing and comparison methods.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, unique: true, required: true },
  password: { type: String, required: true },
  role: { 
    type: String, 
    enum: ['student', 'teacher', 'admin', 'school_admin'], 
    default: 'student' 
  },
  
  // ER Diagram Fields
  school_id: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  phone: { type: String, sparse: true },
  roll_number: { type: String, sparse: true },
  enrollment_status: { 
    type: String, 
    enum: ['active', 'inactive', 'graduated', 'suspended'], 
    default: 'active' 
  },
  aadhaar: { type: String },
  category: { type: String }, // e.g., General, OBC, SC, ST
  
  // Scholara Extended Fields for Students (Keeping for backward compatibility)
  studentDetails: {
    section: { type: String, default: 'Sec 11-A' },
    attendance: { type: Number, default: 0 },
    sessionsLogged: { type: Number, default: 0 },
    totalSessions: { type: Number, default: 30 },
    rank: { type: Number, default: 0 },
    totalPeers: { type: Number, default: 31 },
    gpa: { type: Number, default: 0 },
  },
  
  tasks: [{
    title: { type: String },
    subjectCode: { type: String },
    deadline: { type: Date },
    priority: { type: String, enum: ['LOW', 'MED', 'HIGH'], default: 'MED' }
  }],
  
  subjectPerformance: [{
    subject: { type: String },
    score: { type: Number }
  }],

  refreshToken: { type: String },
  createdAt: { type: Date, default: Date.now }
});

/* ─── PASSWORD HASHING ───────────────────────────────────────────── */
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (err) {
    next(err);
  }
});

/* ─── PASSWORD COMPARISON ────────────────────────────────────────── */
userSchema.methods.comparePassword = async function (candidatePassword) {
  try {
    return await bcrypt.compare(candidatePassword, this.password);
  } catch (err) {
    return false;
  }
};

module.exports = mongoose.model('User', userSchema);