const Permission = require('../models/Permission');

// Default permissions seeded on first use
const DEFAULTS = {
  super_admin: {
    viewSchools: true, createSchools: true, suspendSchools: true,
    viewUsers: true, createUsers: true, blockUsers: true, resetPasswords: true,
    viewExams: true, createExams: true, deleteExams: true, publishExams: true,
    viewResults: true, editResults: true, exportResults: true,
    issueCertificates: true, revokeCertificates: true,
    manageBilling: true, viewInvoices: true,
    sendAnnouncements: true, viewAuditLogs: true,
    editSchoolSettings: true, editSystemSettings: true
  },
  school_admin: {
    viewSchools: false, createSchools: false, suspendSchools: false,
    viewUsers: true, createUsers: true, blockUsers: false, resetPasswords: true,
    viewExams: true, createExams: false, deleteExams: false, publishExams: false,
    viewResults: true, editResults: false, exportResults: true,
    issueCertificates: true, revokeCertificates: false,
    manageBilling: false, viewInvoices: true,
    sendAnnouncements: true, viewAuditLogs: false,
    editSchoolSettings: true, editSystemSettings: false
  },
  teacher: {
    viewSchools: false, createSchools: false, suspendSchools: false,
    viewUsers: false, createUsers: false, blockUsers: false, resetPasswords: false,
    viewExams: true, createExams: true, deleteExams: false, publishExams: true,
    viewResults: true, editResults: false, exportResults: true,
    issueCertificates: false, revokeCertificates: false,
    manageBilling: false, viewInvoices: false,
    sendAnnouncements: false, viewAuditLogs: false,
    editSchoolSettings: false, editSystemSettings: false
  },
  student: {
    viewSchools: false, createSchools: false, suspendSchools: false,
    viewUsers: false, createUsers: false, blockUsers: false, resetPasswords: false,
    viewExams: true, createExams: false, deleteExams: false, publishExams: false,
    viewResults: true, editResults: false, exportResults: false,
    issueCertificates: false, revokeCertificates: false,
    manageBilling: false, viewInvoices: false,
    sendAnnouncements: false, viewAuditLogs: false,
    editSchoolSettings: false, editSystemSettings: false
  }
};

// GET all permissions for all roles
exports.getAllPermissions = async (req, res) => {
  try {
    // Seed defaults if not present
    for (const [role, perms] of Object.entries(DEFAULTS)) {
      await Permission.findOneAndUpdate(
        { role },
        { $setOnInsert: { role, permissions: perms } },
        { upsert: true, new: true }
      );
    }
    const permissions = await Permission.find();
    res.json(permissions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// PUT update permissions for a specific role
exports.updatePermissions = async (req, res) => {
  try {
    const { role, permissions } = req.body;
    if (!role || !permissions) return res.status(400).json({ message: 'role and permissions required' });

    const updated = await Permission.findOneAndUpdate(
      { role },
      { permissions },
      { new: true, upsert: true }
    );

    // Emit real-time update
    const io = req.app.get('socketio');
    if (io) io.emit('permissions_updated', { role, by: req.user.id });

    res.json({ success: true, permission: updated });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// GET permissions for the current logged-in user's role
exports.getMyPermissions = async (req, res) => {
  try {
    const perm = await Permission.findOne({ role: req.user.role });
    if (!perm) return res.json({ permissions: DEFAULTS[req.user.role] || {} });
    res.json({ permissions: perm.permissions });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
