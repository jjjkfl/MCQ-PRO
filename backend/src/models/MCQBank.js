/**
 * src/models/MCQBank.js
 * MCQ bank — questions extracted from PDF via AI
 */

const mongoose = require('mongoose');

const optionSchema = new mongoose.Schema({
  label : { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
  text  : { type: String, required: true, trim: true },
}, { _id: false });

const questionSchema = new mongoose.Schema({
  questionText  : { type: String, required: true, trim: true },
  options       : { type: [optionSchema], validate: [arr => arr.length === 4, 'Exactly 4 options required'] },
  correctAnswer : { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
  explanation   : { type: String, trim: true },
  difficulty    : { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
  topic         : { type: String, trim: true },
  marks         : { type: Number, default: 1, min: 0.5, max: 10 },
  negativeMark  : { type: Number, default: 0, min: 0 },
}, { _id: true });

const mcqBankSchema = new mongoose.Schema(
  {
    title       : { type: String, required: true, trim: true, maxlength: 200 },
    subject     : { type: String, required: true, trim: true },
    chapter     : { type: String, trim: true },
    description : { type: String, trim: true },
    createdBy   : { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    questions   : [questionSchema],
    totalMarks  : { type: Number, default: 0 },
    tags        : [String],
    isPublished : { type: Boolean, default: false },
    sourceFile  : {
      originalName : String,
      storedName   : String,
      size         : Number,
      mimetype     : String,
    },
    aiExtracted  : { type: Boolean, default: false },
    extractionMeta: {
      model      : String,
      tokens     : Number,
      extractedAt: Date,
    },
    usedInSessions: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Session' }],
  },
  { timestamps: true }
);

/* ─── Middleware: compute totalMarks ─────────────────────────────── */
mcqBankSchema.pre('save', function (next) {
  this.totalMarks = this.questions.reduce((sum, q) => sum + q.marks, 0);
  next();
});

/* ─── Indexes ─────────────────────────────────────────────────────── */
mcqBankSchema.index({ createdBy: 1, subject: 1 });
mcqBankSchema.index({ isPublished: 1 });
mcqBankSchema.index({ tags: 1 });

/* ─── Methods ─────────────────────────────────────────────────────── */
mcqBankSchema.methods.getRandomQuestions = function (count) {
  const shuffled = [...this.questions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, Math.min(count, this.questions.length));
};

mcqBankSchema.methods.getStudentView = function () {
  return this.questions.map(q => ({
    _id          : q._id,
    questionText : q.questionText,
    options      : q.options,
    marks        : q.marks,
    difficulty   : q.difficulty,
    topic        : q.topic,
    /* correctAnswer excluded */
  }));
};

const MCQBank = mongoose.model('MCQBank', mcqBankSchema);
module.exports = MCQBank;