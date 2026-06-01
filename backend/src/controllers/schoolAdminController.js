const User = require('../models/User');
const Exam = require('../models/Exam');
const Result = require('../models/Result');
const Certificate = require('../models/Certificate');
const Course = require('../models/Course');
const Session = require('../models/Session');
const CourseMaterial = require('../models/CourseMaterial');
const Broadcast = require('../models/Broadcast');
const Mark = require('../models/Mark');
const School = require('../models/School');
const fs = require('fs').promises;
const XLSX = require('xlsx');

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
    const { name, email, password, classTag, division, bloodGroup, phoneNumber } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered.' });

    let cameraPhoto = '';
    let aadharCard = '';

    if (req.files) {
      if (req.files.cameraPhoto) {
        cameraPhoto = '/uploads/' + req.files.cameraPhoto[0].filename;
      }
      if (req.files.aadharCard) {
        aadharCard = '/uploads/' + req.files.aadharCard[0].filename;
      }
    }

    const student = await User.create({
      name, email,
      password: password || 'Student@123',
      role: 'student',
      schoolId: req.user.schoolId,
      classTag: classTag || '',
      division: division || 'A',
      cameraPhoto,
      aadharCard,
      bloodGroup: bloodGroup || '',
      phoneNumber: phoneNumber || '',
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
    const { name, email, password, bloodGroup, phoneNumber } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email already registered.' });

    let cameraPhoto = '';
    let aadharCard = '';

    if (req.files) {
      if (req.files.cameraPhoto) {
        cameraPhoto = '/uploads/' + req.files.cameraPhoto[0].filename;
      }
      if (req.files.aadharCard) {
        aadharCard = '/uploads/' + req.files.aadharCard[0].filename;
      }
    }

    const teacher = await User.create({
      name, email,
      password: password || 'Teacher@123',
      role: 'teacher',
      schoolId: req.user.schoolId,
      cameraPhoto,
      aadharCard,
      bloodGroup: bloodGroup || '',
      phoneNumber: phoneNumber || '',
      isActive: true
    });

    res.status(201).json({ success: true, teacher: { id: teacher._id, name: teacher.name } });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateUser = async (req, res) => {
  try {
    const { name, email, classTag, division, isActive, bloodGroup, phoneNumber } = req.body;
    const updateData = { 
      name, email, classTag, division, 
      isActive: isActive === 'true' || isActive === true,
      bloodGroup: bloodGroup || '',
      phoneNumber: phoneNumber || ''
    };

    if (req.files) {
      if (req.files.cameraPhoto) {
        updateData.cameraPhoto = '/uploads/' + req.files.cameraPhoto[0].filename;
      }
      if (req.files.aadharCard) {
        updateData.aadharCard = '/uploads/' + req.files.aadharCard[0].filename;
      }
    }

    const user = await User.findByIdAndUpdate(
      req.params.id,
      updateData,
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

// Broadcast Management
exports.createBroadcast = async (req, res) => {
  try {
    const { title, content, targetAudience } = req.body;
    if (!title || !content) {
      return res.status(400).json({ message: 'Title and content are required.' });
    }

    const broadcast = await Broadcast.create({
      title,
      content,
      schoolId: req.user.schoolId,
      authorId: req.user.id,
      targetAudience: targetAudience || 'teachers'
    });

    // Notify teachers/students via websocket if socketio is present
    const io = req.app.get('socketio');
    if (io) {
      io.to(`school:${broadcast.schoolId}`).emit('announcement', {
        title: broadcast.title,
        content: broadcast.content,
        schoolId: broadcast.schoolId,
        targetAudience: broadcast.targetAudience
      });
    }

    res.status(201).json({ success: true, data: broadcast });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.getBroadcasts = async (req, res) => {
  try {
    const query = { schoolId: req.user.schoolId };
    if (req.user.role === 'teacher') {
      query.targetAudience = { $in: ['teachers', 'all'] };
    }
    const broadcasts = await Broadcast.find(query)
      .populate('authorId', 'name')
      .sort({ createdAt: -1 });
    res.json(broadcasts);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Excel Marks Upload
exports.uploadMarksExcel = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded.' });
  }

  const { courseId, subject, examType } = req.body;
  if (!courseId || !subject || !examType) {
    return res.status(400).json({ success: false, message: 'courseId, subject, and examType are required.' });
  }

  try {
    const workbook = XLSX.readFile(req.file.path);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(worksheet);

    const results = [];
    const errors = [];

    for (let i = 0; i < data.length; i++) {
      const row = data[i];
      // supports different spellings of headers
      const email = row.email || row.Email || row['Student Email'] || row['student_email'];
      const marksObtained = row.marks || row.Marks || row['Marks Obtained'] || row.marks_obtained;
      const totalMarks = row.total || row.Total || row['Total Marks'] || row.total_marks || 100;
      const remarks = row.remarks || row.Remarks || '';

      if (!email || marksObtained == null) {
        errors.push(`Row ${i + 2}: Missing Email or Marks.`);
        continue;
      }

      // Find student in current school
      const student = await User.findOne({ 
        email: email.toString().trim().toLowerCase(), 
        role: 'student', 
        schoolId: req.user.schoolId 
      });

      if (!student) {
        errors.push(`Row ${i + 2}: Student with email ${email} not found in this school.`);
        continue;
      }

      try {
        const mark = await Mark.findOneAndUpdate(
          { studentId: student._id, subject, examType },
          {
            studentId: student._id,
            courseId,
            teacherId: req.user.id, // uploaded by admin
            subject,
            examType,
            marksObtained: Number(marksObtained),
            totalMarks: Number(totalMarks),
            remarks: remarks
          },
          { upsert: true, new: true, runValidators: true }
        );
        results.push(mark);
      } catch (err) {
        errors.push(`Row ${i + 2}: Error saving mark: ${err.message}`);
      }
    }

    // Clean up uploaded file
    await fs.unlink(req.file.path);

    res.json({
      success: true,
      message: `Successfully processed ${results.length} records.`,
      uploadedCount: results.length,
      errors
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// School settings
exports.getSchoolSettings = async (req, res) => {
  try {
    const school = await School.findById(req.user.schoolId);
    if (!school) return res.status(404).json({ message: 'School not found' });
    res.json(school);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

exports.updateSchoolSettings = async (req, res) => {
  try {
    const { name, primary_color, secondary_color } = req.body;
    const school = await School.findById(req.user.schoolId);
    if (!school) return res.status(404).json({ message: 'School not found' });

    school.name = name || school.name;
    if (!school.branding) {
      school.branding = {
        primary_color: '#0071e3',
        secondary_color: '#1d1d1f'
      };
    }
    school.branding.primary_color = primary_color || school.branding.primary_color;
    school.branding.secondary_color = secondary_color || school.branding.secondary_color;

    if (req.file) {
      school.branding.logo = '/uploads/' + req.file.filename;
    }

    await school.save();
    res.json({ success: true, school });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ─── Course Management ────────────────────────────────────────────────

exports.getCourses = async (req, res) => {
  try {
    const courses = await Course.find({ schoolId: req.user.schoolId })
      .populate('teacherIds', 'name email')
      .lean();
    res.json({ success: true, data: courses });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createCourse = async (req, res) => {
  try {
    const { courseName, description, department, teacherId } = req.body;
    if (!courseName) {
      return res.status(400).json({ success: false, message: 'Course name is required.' });
    }

    const course = await Course.create({
      courseName,
      description: description || '',
      department: department || 'General',
      schoolId: req.user.schoolId,
      teacherIds: teacherId ? [teacherId] : []
    });

    // Push this course into the assigned teacher's courseIds
    if (teacherId) {
      await User.findByIdAndUpdate(teacherId, { $addToSet: { courseIds: course._id } });
    }

    res.status(201).json({ success: true, data: course });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateCourse = async (req, res) => {
  try {
    const { courseName, description, department, teacherId } = req.body;
    const course = await Course.findOne({ _id: req.params.id, schoolId: req.user.schoolId });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });

    if (courseName) course.courseName = courseName;
    if (description !== undefined) course.description = description;
    if (department) course.department = department;

    if (teacherId && !course.teacherIds.map(id => id.toString()).includes(teacherId)) {
      course.teacherIds.push(teacherId);
      await User.findByIdAndUpdate(teacherId, { $addToSet: { courseIds: course._id } });
    }

    await course.save();
    res.json({ success: true, data: course });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteCourse = async (req, res) => {
  try {
    const course = await Course.findOneAndDelete({ _id: req.params.id, schoolId: req.user.schoolId });
    if (!course) return res.status(404).json({ success: false, message: 'Course not found.' });

    // Remove this course from all teachers that had it assigned
    await User.updateMany(
      { courseIds: course._id },
      { $pull: { courseIds: course._id } }
    );

    res.json({ success: true, message: 'Course deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
