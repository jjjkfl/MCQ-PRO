const mongoose = require('mongoose');

const certificateSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  examId: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  issueDate: { type: Date, default: Date.now },
  certificateNumber: { type: String, unique: true, required: true },
  templateData: {
    studentName: { type: String },
    examName: { type: String },
    score: { type: String },
    grade: { type: String }
  },
  isVerified: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Certificate', certificateSchema);
