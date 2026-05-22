const User = require('../models/User');
const Exam = require('../models/Exam');
const Result = require('../models/Result');
const Certificate = require('../models/Certificate');
const Course = require('../models/Course');
const Session = require('../models/Session');
const CourseMaterial = require('../models/CourseMaterial');

// Student Management
exports.getStudents = async (req, res) => {
  try {
    const students = await User.find({ schoolId: req.user.schoolId, role: 'student' });
    res.json(students);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createStudent = async (req, res) => {
  try {
    const { name, email, password, classTag, division } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered.' });

    const student = await User.create({
      name, email,
      password: password || 'Student@123',
      role: 'student',
      schoolId: req.user.schoolId,
      classTag: classTag || '',
      division: division || 'A',
      isActive: true
    });

    // Emit real-time event
    const io = req.app.get('socketio');
    if (io) io.emit('student_joined', { name: student.name });

    res.status(201).json({ success: true, student: { id: student._id, name: student.name, email: student.email } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Teacher Management
exports.getTeachers = async (req, res) => {
  try {
    const teachers = await User.find({ schoolId: req.user.schoolId, role: 'teacher' });
    res.json(teachers);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.createTeacher = async (req, res) => {
  try {
    const { name, email, password } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered.' });

    const teacher = await User.create({
      name, email,
      password: password || 'Teacher@123',
      role: 'teacher',
      schoolId: req.user.schoolId,
      isActive: true
    });

    res.status(201).json({ success: true, teacher: { id: teacher._id, name: teacher.name } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { name, email, classTag, division, isActive } = req.body;
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { name, email, classTag, division, isActive: isActive === 'true' || isActive === true },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Exam & Results
exports.getExams = async (req, res) => {
  try {
    const exams = await Exam.find({ school_id: req.user.schoolId }).populate('created_by', 'name'); 
    res.json(exams);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Certificate Generation
exports.generateCertificate = async (req, res) => {
  try {
    const { studentId, examId } = req.body;
    const certificateNumber = `CERT-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    
    const certificate = await Certificate.create({
      studentId,
      examId,
      schoolId: req.user.schoolId,
      certificateNumber,
      issueDate: new Date()
    });
    
    res.status(201).json(certificate);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

exports.getDashboardStats = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;
    const totalStudents = await User.countDocuments({ schoolId, role: 'student' });
    const totalTeachers = await User.countDocuments({ schoolId, role: 'teacher' });
    const upcomingExams = await Exam.countDocuments({ date: { $gte: new Date() } });
    
    res.json({
      totalStudents,
      totalTeachers,
      upcomingExams,
      attendanceRate: '95%' // Mocked for now
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Global Live Monitoring for the School
exports.getSchoolLiveExams = async (req, res) => {
  try {
    const Session = require('../models/Session');
    const sessions = await Session.find({ 
      schoolId: req.user.schoolId,
      status: { $in: ['active', 'pending'] } 
    })
      .populate('courseId', 'courseName')
      .populate('teacherId', 'name')
      .sort({ startTime: 1 })
      .limit(15);
      
    res.json(sessions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get School Results (including proctoring violation alerts)
exports.getSchoolResults = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;
    const students = await User.find({ schoolId, role: 'student' }).select('_id');
    const studentIds = students.map(s => s._id);

    const results = await Result.find({ studentId: { $in: studentIds } })
      .populate('studentId', 'name email classTag division')
      .populate('courseId', 'courseName')
      .populate('sessionId', 'title startTime')
      .sort({ createdAt: -1 });

    res.json(results);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get Academic Materials
exports.getSchoolMaterials = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;
    const teachers = await User.find({ schoolId, role: 'teacher' }).select('_id');
    const teacherIds = teachers.map(t => t._id);

    const materials = await CourseMaterial.find({ createdBy: { $in: teacherIds } })
      .populate('createdBy', 'name email')
      .populate('courseId', 'courseName')
      .sort({ createdAt: -1 });

    res.json(materials);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete Academic Material
exports.deleteSchoolMaterial = async (req, res) => {
  try {
    const schoolId = req.user.schoolId;
    const materialId = req.params.id;

    const material = await CourseMaterial.findById(materialId);
    if (!material) {
      return res.status(404).json({ message: 'Material not found.' });
    }

    const creator = await User.findById(material.createdBy);
    if (!creator || creator.schoolId.toString() !== schoolId.toString()) {
      return res.status(403).json({ message: 'Unauthorized.' });
    }

    await CourseMaterial.findByIdAndDelete(materialId);
    res.json({ success: true, message: 'Material deleted successfully.' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
