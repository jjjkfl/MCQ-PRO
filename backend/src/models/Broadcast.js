const mongoose = require('mongoose');

const broadcastSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true },
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', required: true },
  authorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetAudience: { type: String, enum: ['teachers', 'students', 'all'], default: 'teachers', required: true }
}, { timestamps: true });

module.exports = mongoose.model('Broadcast', broadcastSchema);
