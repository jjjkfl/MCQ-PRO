const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  score: { type: Number, required: true },
  violationCount: { type: Number, default: 0 },
  blockchainHash: { type: String },
  blockchainTx: { type: String }
}, { timestamps: true });

module.exports = mongoose.model('Result', resultSchema);