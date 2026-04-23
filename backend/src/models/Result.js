/**
 * backend/src/models/Result.js
 * Schema for Examination Results — stores detailed answer data
 */

const mongoose = require('mongoose');

const answerDetailSchema = new mongoose.Schema({
  questionId: { type: String, required: true },
  questionText: { type: String },
  image: { type: String, default: '' },
  options: [{
    label: { type: String },
    text: { type: String }
  }],
  selectedAnswer: { type: String, default: '' },
  correctAnswer: { type: String, required: true },
  isCorrect: { type: Boolean, default: false },
  marks: { type: Number, default: 1 }
}, { _id: false });

const resultSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  examId: { type: String, required: true },
  score: { type: Number, required: true },
  totalMarks: { type: Number, default: 0 },
  correctCount: { type: Number, default: 0 },
  totalQuestions: { type: Number, default: 0 },
  timeTaken: { type: Number, default: 0 }, // seconds
  violations: { type: Number, default: 0 },
  answers: [answerDetailSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Result', resultSchema);