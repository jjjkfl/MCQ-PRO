const mongoose = require('mongoose');

const courseSchema = new mongoose.Schema({
  courseName: { type: String, required: true },
  description: { type: String, default: '' },
  department: { type: String, default: 'General' },
  driveLink: { type: String, default: '' },
  teacherIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  schoolId: { type: mongoose.Schema.Types.ObjectId, ref: 'School', default: null }
}, { timestamps: true });

module.exports = mongoose.model('Course', courseSchema);
