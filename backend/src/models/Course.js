const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  courseName: { type: String, required: true },
  teacherIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }]
}, { timestamps: true });

module.exports = mongoose.model('Course', courseSchema);
