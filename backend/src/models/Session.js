const mongoose = require('mongoose');

const sessionSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School' }, // For global tracking
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // The creator of the session
  division: { type: String, enum: ['A', 'B', 'C', 'D'], required: true },
  title: { type: String, required: true },
  /** Carried from MCQ bank (or set manually) for per-subject reporting */
  subject: { type: String, default: '' },
  status: { type: String, enum: ['pending', 'active', 'completed'], default: 'pending' },
  questions: [{
    questionText: String,
    options: [{
      label: String,
      text: String
    }],
    correctAnswer: String,
    marks: { type: Number, default: 1 },
    image: String
  }],
  startTime: { type: Date, required: true },
  duration: { type: Number, required: true }, // in minutes
  liveClassLink: { type: String, default: '' },
  negativeMarking: { type: Boolean, default: false }
}, { timestamps: true });

module.exports = mongoose.model('Session', sessionSchema);