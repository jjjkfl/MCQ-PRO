const mongoose = require('mongoose');

const permissionSchema = new mongoose.Schema({
  role: {
    type: String,
    enum: ['super_admin', 'school_admin', 'teacher', 'student'],
    unique: true,
    required: true
  },
  permissions: {
    // School Management
    viewSchools:        { type: Boolean, default: false },
    createSchools:      { type: Boolean, default: false },
    suspendSchools:     { type: Boolean, default: false },
    // User Management
    viewUsers:          { type: Boolean, default: false },
    createUsers:        { type: Boolean, default: false },
    blockUsers:         { type: Boolean, default: false },
    resetPasswords:     { type: Boolean, default: false },
    // Exam Management
    viewExams:          { type: Boolean, default: false },
    createExams:        { type: Boolean, default: false },
    deleteExams:        { type: Boolean, default: false },
    publishExams:       { type: Boolean, default: false },
    // Results
    viewResults:        { type: Boolean, default: false },
    editResults:        { type: Boolean, default: false },
    exportResults:      { type: Boolean, default: false },
    // Certificates
    issueCertificates:  { type: Boolean, default: false },
    revokeCertificates: { type: Boolean, default: false },
    // Billing
    manageBilling:      { type: Boolean, default: false },
    viewInvoices:       { type: Boolean, default: false },
    // Announcements
    sendAnnouncements:  { type: Boolean, default: false },
    // Audit
    viewAuditLogs:      { type: Boolean, default: false },
    // Settings
    editSchoolSettings: { type: Boolean, default: false },
    editSystemSettings: { type: Boolean, default: false },
  }
}, { timestamps: true });

module.exports = mongoose.model('Permission', permissionSchema);
