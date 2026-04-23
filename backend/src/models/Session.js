/**
 * src/models/Session.js
 * Exam session schema
 */

const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema(
  {
    title        : { type: String, required: true, trim: true },
    description  : { type: String, trim: true },
    createdBy    : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    mcqBank      : { type: mongoose.Schema.Types.ObjectId, ref: 'MCQBank', required: true },

    /* Snapshot of questions used (so changing the bank doesn't affect ongoing exams) */
    questions    : [
      {
        questionText  : String,
        options       : [{ label: String, text: String }],
        correctAnswer : { type: String, select: false },
        marks         : { type: Number, default: 1 },
        negativeMark  : { type: Number, default: 0 },
        topic         : String,
        difficulty    : String,
      },
    ],

    /* Timing */
    scheduledStart : { type: Date, required: true },
    scheduledEnd   : { type: Date, required: true },
    durationMinutes: { type: Number, required: true, min: 5, max: 360 },
    actualStart    : Date,
    actualEnd      : Date,

    /* Control */
    status : {
      type    : String,
      enum    : ['draft', 'scheduled', 'active', 'completed', 'cancelled'],
      default : 'draft',
    },
    accessCode   : { type: String, unique: true, sparse: true },
    shuffleOptions: { type: Boolean, default: true },
    allowedAttempts: { type: Number, default: 1 },
    passingScore : { type: Number, default: 50 },
    negativeMarking: { type: Boolean, default: false },

    /* Enrolled students */
    enrolledStudents : [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
    submittedStudents: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],

    /* Settings */
    settings: {
      fullscreen       : { type: Boolean, default: true  },
      webcamRequired   : { type: Boolean, default: false },
      preventTabSwitch : { type: Boolean, default: true  },
      maxTabSwitches   : { type: Number,  default: 3     },
      showResult       : { type: Boolean, default: true  },
      showAnswers      : { type: Boolean, default: false },
    },

    /* Blockchain */
    blockchainTxHash : String,
    blockchainVerified: { type: Boolean, default: false },
  },
  { timestamps: true }
);

/* ─── Indexes ─────────────────────────────────────────────────────── */
sessionSchema.index({ createdBy: 1, status: 1 });
sessionSchema.index({ scheduledStart: 1 });
sessionSchema.index({ accessCode: 1 });

/* ─── Statics ─────────────────────────────────────────────────────── */
sessionSchema.statics.generateAccessCode = function () {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
};

/* ─── Virtuals ────────────────────────────────────────────────────── */
sessionSchema.virtual('totalMarks').get(function () {
  return this.questions.reduce((sum, q) => sum + (q.marks || 1), 0);
});

sessionSchema.virtual('isLive').get(function () {
  return this.status === 'active';
});

const Session = mongoose.model('Session', sessionSchema);
module.exports = Session;