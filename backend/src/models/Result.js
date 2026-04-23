/**
 * src/models/Result.js
 * Exam result schema with blockchain hash verification
 */

const mongoose = require('mongoose');
const crypto   = require('crypto');

const answerSchema = new mongoose.Schema({
  questionId     : { type: mongoose.Schema.Types.ObjectId, required: true },
  selectedOption : { type: String, enum: ['A', 'B', 'C', 'D', null] },
  correctAnswer  : { type: String, enum: ['A', 'B', 'C', 'D'] },
  isCorrect      : Boolean,
  marksAwarded   : { type: Number, default: 0 },
  timeSpent      : { type: Number, default: 0 }, // seconds on question
}, { _id: false });

const resultSchema = new mongoose.Schema(
  {
    student    : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    session    : { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
    mcqBank    : { type: mongoose.Schema.Types.ObjectId, ref: 'MCQBank' },

    /* Answers detail */
    answers    : [answerSchema],

    /* Score breakdown */
    totalQuestions  : { type: Number, required: true },
    attemptedCount  : { type: Number, default: 0 },
    correctCount    : { type: Number, default: 0 },
    incorrectCount  : { type: Number, default: 0 },
    skippedCount    : { type: Number, default: 0 },
    rawScore        : { type: Number, default: 0 },
    negativeScore   : { type: Number, default: 0 },
    totalMarks      : { type: Number, required: true },
    marksObtained   : { type: Number, default: 0 },
    percentage      : { type: Number, default: 0 },
    grade           : { type: String },
    isPassed        : { type: Boolean, default: false },

    /* Timing */
    startedAt   : Date,
    submittedAt : { type: Date, default: Date.now },
    timeTaken   : { type: Number, default: 0 }, // seconds

    /* Proctoring */
    tabSwitches       : { type: Number, default: 0 },
    suspiciousFlags   : [String],
    proctorNotes      : String,

    /* Submission control */
    attemptNumber : { type: Number, default: 1 },
    isFinalized   : { type: Boolean, default: false },

    /* Blockchain integrity */
    resultHash          : { type: String }, // SHA256 of result data
    blockchainTxHash    : { type: String },
    blockchainVerified  : { type: Boolean, default: false },
    blockchainTimestamp : Date,
    blockchainNetwork   : String,

    /* Certificate */
    certificateIssued   : { type: Boolean, default: false },
    certificateHash     : { type: String },
    certificateIssuedAt : Date,
  },
  {
    timestamps : true,
    toJSON     : { virtuals: true },
  }
);

/* ─── Unique index: one attempt per student per session ───────────── */
resultSchema.index({ student: 1, session: 1, attemptNumber: 1 }, { unique: true });
resultSchema.index({ student: 1 });
resultSchema.index({ session: 1 });
resultSchema.index({ resultHash: 1 });

/* ─── Pre-save: compute derived fields ───────────────────────────── */
resultSchema.pre('save', function (next) {
  /* Grade */
  const pct = this.percentage;
  if      (pct >= 90) this.grade = 'A+';
  else if (pct >= 80) this.grade = 'A';
  else if (pct >= 70) this.grade = 'B';
  else if (pct >= 60) this.grade = 'C';
  else if (pct >= 50) this.grade = 'D';
  else                this.grade = 'F';

  next();
});

/* ─── Static: compute and store SHA256 result hash ───────────────── */
resultSchema.statics.computeHash = function (resultData) {
  const payload = JSON.stringify({
    studentId      : resultData.student.toString(),
    sessionId      : resultData.session.toString(),
    marksObtained  : resultData.marksObtained,
    totalMarks     : resultData.totalMarks,
    percentage     : resultData.percentage,
    grade          : resultData.grade,
    submittedAt    : resultData.submittedAt,
    correctCount   : resultData.correctCount,
    totalQuestions : resultData.totalQuestions,
  });
  return crypto.createHash('sha256').update(payload).digest('hex');
};

/* ─── Virtual: CGPA contribution ─────────────────────────────────── */
resultSchema.virtual('gradePoints').get(function () {
  const map = { 'A+': 4.0, 'A': 4.0, 'B': 3.0, 'C': 2.0, 'D': 1.0, 'F': 0.0 };
  return map[this.grade] || 0;
});

/* ─── Instance: compute result hash ──────────────────────────────── */
resultSchema.methods.generateHash = function () {
  this.resultHash = mongoose.model('Result').computeHash(this);
  return this.resultHash;
};

const Result = mongoose.model('Result', resultSchema);
module.exports = Result;