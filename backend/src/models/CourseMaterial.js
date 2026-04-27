const mongoose = require('mongoose');

const courseMaterialSchema = new mongoose.Schema({
    courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course', required: true },
    title: { type: String, required: true },
    description: { type: String },
    type: { type: String, enum: ['video', 'pdf', 'link', 'note'], required: true },
    url: { type: String, required: true }, // URL to video, PDF file path, or external link
    order: { type: Number, default: 0 },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

module.exports = mongoose.model('CourseMaterial', courseMaterialSchema);
