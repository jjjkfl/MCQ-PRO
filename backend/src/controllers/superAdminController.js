const User = require('../models/User');
const School = require('../models/School');
const SubscriptionPlan = require('../models/SubscriptionPlan');
const Subscription = require('../models/Subscription');
const AuditLog = require('../models/AuditLog');
const Course = require('../models/Course');
const Session = require('../models/Session');

// Register a new school + create its school admin account
exports.registerSchool = async (req, res) => {
  try {
    const { schoolName, boardType, adminName, adminEmail, adminPassword, plan, state, district, latitude, longitude } = req.body;

    // 1. Check if school admin email already exists
    const existing = await User.findOne({ email: adminEmail });
    if (existing) return res.status(400).json({ message: 'Admin email already registered.' });

    // 2. Create school admin user (model pre-save hook will hash the password)
    const admin = await User.create({
      name: adminName,
      email: adminEmail,
      password: adminPassword || 'Admin@123',
      role: 'school_admin',
      isActive: true
    });

    // 3. Create the school
    const slug = schoolName.toLowerCase().replace(/\s+/g, '-');
    const school = await School.create({
      name: schoolName,
      name_slug: slug,
      board_type: boardType || 'CBSE',
      adminId: admin._id,
      subscription_plan: plan || 'Basic',
      is_active: true,
      state: state || 'Karnataka',
      district: district || 'Bengaluru',
      latitude: latitude !== undefined ? Number(latitude) : 12.9716,
      longitude: longitude !== undefined ? Number(longitude) : 77.5946
    });

    // 4. Link school to admin
    admin.schoolId = school._id;
    await admin.save();

    // 5. Emit real-time event
    const io = req.app.get('socketio');
    if (io) io.emit('new_school_registration', { name: school.name });

    res.status(201).json({ success: true, school, admin: { id: admin._id, email: admin.email } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Block / Unblock a User
exports.blockUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    user.isActive = !user.isActive;
    await user.save();
    res.json({ success: true, isActive: user.isActive });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// School Management
exports.getAllSchools = async (req, res) => {
  try {
    const schools = await School.find().populate('adminId', 'name email');
    // Self-healing check for legacy schools
    for (let s of schools) {
      if (!s.state || !s.district || s.latitude === undefined || s.longitude === undefined) {
        s.state = s.state || 'Karnataka';
        s.district = s.district || 'Bengaluru';
        if (s.latitude === undefined) s.latitude = 12.9716;
        if (s.longitude === undefined) s.longitude = 77.5946;
        await s.save();
      }
    }
    res.json(schools);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.approveSchool = async (req, res) => {
  try {
    const school = await School.findByIdAndUpdate(req.params.id, { is_active: true }, { new: true });
    
    // Real-time update
    const io = req.app.get('socketio');
    if (io) io.emit('school_approved', { id: school._id, name: school.name });
    
    res.json({ success: true, school });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.suspendSchool = async (req, res) => {
  try {
    const school = await School.findByIdAndUpdate(req.params.id, { is_active: false }, { new: true });
    res.json({ success: true, school });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// User Management (Global)
exports.getAllUsers = async (req, res) => {
  try {
    const users = await User.find().populate('schoolId', 'name');
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Subscription Management
exports.createPlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.create(req.body);
    res.status(201).json(plan);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getAnalytics = async (req, res) => {
  try {
    const totalSchools = await School.countDocuments();
    const activeUsers = await User.countDocuments({ isActive: true });
    const totalRevenue = await Subscription.aggregate([
      { $group: { _id: null, total: { $sum: '$paymentDetails.amount' } } }
    ]);
    
    res.json({
      totalSchools,
      activeUsers,
      revenue: totalRevenue[0]?.total || 0,
      systemHealth: 'Optimal'
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Deep Dive: School Teachers & Exams
exports.getSchoolTeachers = async (req, res) => {
  try {
    const teachers = await User.find({ schoolId: req.params.id, role: 'teacher' });
    res.json(teachers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getSchoolExams = async (req, res) => {
  try {
    const Exam = require('../models/Exam');
    const exams = await Exam.find({ schoolId: req.params.id }).populate('creatorId', 'name');
    res.json(exams);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};// Global Live Monitoring
exports.getGlobalLiveExams = async (req, res) => {
  return res.status(403).json({ message: 'Access denied. Live monitor is restricted to school administrators and teachers.' });
};

// Update School details
exports.updateSchool = async (req, res) => {
  try {
    const { name, board_type, subscription_plan, max_students_teachers, is_active, adminId, state, district, latitude, longitude } = req.body;
    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ message: 'School not found' });

    if (name) {
      school.name = name;
      school.name_slug = name.toLowerCase().replace(/\s+/g, '-');
    }
    if (board_type !== undefined) school.board_type = board_type;
    if (subscription_plan !== undefined) school.subscription_plan = subscription_plan;
    if (max_students_teachers !== undefined) school.max_students_teachers = max_students_teachers;
    if (is_active !== undefined) school.is_active = is_active;
    if (adminId !== undefined) school.adminId = adminId || null;
    if (state !== undefined) school.state = state;
    if (district !== undefined) school.district = district;
    if (latitude !== undefined) school.latitude = Number(latitude);
    if (longitude !== undefined) school.longitude = Number(longitude);

    await school.save();
    res.json({ success: true, school });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete school and recursively delete all associated users
exports.deleteSchool = async (req, res) => {
  try {
    const school = await School.findById(req.params.id);
    if (!school) return res.status(404).json({ message: 'School not found' });

    // Cascading delete: delete all users linked to this school
    await User.deleteMany({ schoolId: school._id });

    // Delete the school itself
    await School.findByIdAndDelete(school._id);

    res.json({ success: true, message: 'School and all associated users deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Create a platform user directly
exports.createUser = async (req, res) => {
  try {
    const { name, email, password, role, schoolId, classTag, division, isActive } = req.body;

    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered.' });

    const newUser = await User.create({
      name,
      email,
      password: password || 'Password@123',
      role: role || 'student',
      schoolId: schoolId || undefined,
      classTag: classTag || '',
      division: division || '',
      isActive: isActive !== undefined ? isActive : true
    });

    res.status(201).json({ success: true, user: newUser });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update an existing user
exports.updateUser = async (req, res) => {
  try {
    const { name, email, password, role, schoolId, classTag, division, isActive } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (email && email !== user.email) {
      const existing = await User.findOne({ email });
      if (existing) return res.status(400).json({ message: 'Email already registered.' });
      user.email = email;
    }

    if (name !== undefined) user.name = name;
    if (password) user.password = password; // Will be hashed via User schema pre-save hook
    if (role !== undefined) user.role = role;
    if (schoolId !== undefined) user.schoolId = schoolId || null;
    if (classTag !== undefined) user.classTag = classTag;
    if (division !== undefined) user.division = division;
    if (isActive !== undefined) user.isActive = isActive;

    await user.save();
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete a user
exports.deleteUser = async (req, res) => {
  try {
    const user = await User.findByIdAndDelete(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });

    // If user was a school admin, clear the school's adminId
    await School.updateMany({ adminId: user._id }, { $unset: { adminId: 1 } });

    res.json({ success: true, message: 'User deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all subscription plans
exports.getPlans = async (req, res) => {
  try {
    const plans = await SubscriptionPlan.find();
    res.json(plans);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Update subscription plan
exports.updatePlan = async (req, res) => {
  try {
    const { name, price, features, durationDays, isActive } = req.body;
    const plan = await SubscriptionPlan.findById(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });

    if (name !== undefined) plan.name = name;
    if (price !== undefined) plan.price = price;
    if (features !== undefined) plan.features = features;
    if (durationDays !== undefined) plan.durationDays = durationDays;
    if (isActive !== undefined) plan.isActive = isActive;

    await plan.save();
    res.json({ success: true, plan });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete subscription plan
exports.deletePlan = async (req, res) => {
  try {
    const plan = await SubscriptionPlan.findByIdAndDelete(req.params.id);
    if (!plan) return res.status(404).json({ message: 'Plan not found' });
    res.json({ success: true, message: 'Plan deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
