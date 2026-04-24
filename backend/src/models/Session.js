const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  division: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
  title: { type: String, required: true },
  questions: [{
    text: String,
    options: [String],
    correctAnswer: String
  }],
  startTime: { type: Date, required: true },
  duration: { type: Number, required: true } // in minutes
}, { timestamps: true });

module.exports = mongoose.model('Session', sessionSchema);