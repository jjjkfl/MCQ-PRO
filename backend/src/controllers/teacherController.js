const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');
const pdfParse = require('pdf-parse');
const mammoth = require('mammoth');
const OpenAI = require('openai');
const Session = require('../models/Session');
const Result = require('../models/Result');
const User = require('../models/User');
const Course = require('../models/Course');
const MCQBank = require('../models/MCQBank');
const aiParserSvc = require('../services/aiParserService');
const blockchain = require('../services/blockchain/blockchainService');

const mapBankQuestionsToSession = (questions) =>
  (questions || []).map((q) => ({
    questionText: q.questionText || q.text,
    options: (q.options || []).map((opt) => ({
      label: opt.label,
      text: opt.text,
      image: opt.image || ''
    })),
    correctAnswer: q.correctAnswer,
    marks: q.marks != null ? q.marks : 1,
    image: q.image || ''
  }));


// Document processing migrated to aiParserService.js

exports.getDashboard = async (req, res) => {
  try {
    const teacher = req.user;
    const courseIds = (teacher.courseIds || []).map((id) => id);

    const courses =
      courseIds.length > 0
        ? await Course.find({ _id: { $in: courseIds } }).select('courseName')
        : [];

    const [activeSessions, totalSessions, totalStudents, totalMCQBanks, sessions, recentResultDocs] =
      await Promise.all([
        Session.countDocuments({ courseId: { $in: courseIds }, status: 'active' }),
        Session.countDocuments({ courseId: { $in: courseIds } }),
        User.countDocuments({ role: 'student', courseId: { $in: courseIds } }),
        MCQBank.countDocuments({ createdBy: teacher._id }),
        Session.find({ courseId: { $in: courseIds } })
          .sort({ startTime: -1 })
          .limit(8)
          .lean(),
        Result.find({ courseId: { $in: courseIds } })
          .sort({ createdAt: -1 })
          .limit(5)
          .populate('studentId', 'name')
          .populate('sessionId', 'title')
          .lean()
      ]);

    const sessionIds = sessions.map((s) => s._id);
    const submissionCounts = sessionIds.length
      ? await Result.aggregate([
        { $match: { sessionId: { $in: sessionIds } } },
        { $group: { _id: '$sessionId', count: { $sum: 1 } } }
      ])
      : [];
    const countMap = Object.fromEntries(submissionCounts.map((c) => [String(c._id), c.count]));

    const recentSessions = sessions.map((s) => ({
      _id: s._id,
      title: s.title,
      courseId: s.courseId,
      division: s.division,
      startTime: s.startTime,
      scheduledStart: s.startTime,
      duration: s.duration,
      status: s.status,
      submissions: countMap[String(s._id)] || 0
    }));

    const recentResults = recentResultDocs.map((r) => ({
      _id: r._id,
      studentName: (r.studentId && r.studentId.name) || 'Student',
      examTitle: (r.sessionId && r.sessionId.title) || 'Exam',
      score: r.score,
      submittedAt: r.createdAt
    }));

    res.json({
      success: true,
      data: {
        stats: {
          activeSessions,
          totalSessions,
          totalStudents,
          totalMCQBanks
        },
        recentSessions,
        recentResults,
        courses
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createSession = async (req, res) => {
  try {
    const { title, scheduledStart, durationMinutes, mcqBankId, division, courseId, subject: subjectFromBody } =
      req.body;

    if (!courseId || !req.user.courseIds.map((id) => id.toString()).includes(courseId.toString())) {
      return res.status(403).json({ success: false, message: 'Invalid or unauthorized courseId' });
    }

    let questions = [];
    let subject = typeof subjectFromBody === 'string' ? subjectFromBody.trim() : '';

    if (mcqBankId) {
      const bank = await MCQBank.findById(mcqBankId);
      if (bank) {
        questions = mapBankQuestionsToSession(bank.questions);
        if (!subject) subject = bank.subject || '';
      }
    }

    const session = await Session.create({
      title,
      division: division || 'A',
      subject,
      questions,
      startTime: new Date(scheduledStart),
      duration: durationMinutes,
      courseId
    });

    res.status(201).json({ success: true, data: session });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getSessions = async (req, res) => {
  try {
    const sessions = await Session.find({ courseId: { $in: req.user.courseIds } }).sort('-createdAt');
    res.json({ success: true, data: sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateSession = async (req, res) => {
  try {
    const { title, durationMinutes, division, scheduledStart } = req.body;
    const updateData = { title, duration: durationMinutes, division };
    if (scheduledStart) updateData.startTime = new Date(scheduledStart);

    const session = await Session.findOneAndUpdate(
      { _id: req.params.id, courseId: { $in: req.user.courseIds } },
      updateData,
      { new: true }
    );
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    res.json({ success: true, data: session });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteSession = async (req, res) => {
  try {
    const session = await Session.findOneAndDelete({
      _id: req.params.id,
      courseId: { $in: req.user.courseIds }
    });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });

    res.json({ success: true, message: 'Session deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateSessionStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const session = await Session.findOneAndUpdate(
      { _id: req.params.sessionId, courseId: { $in: req.user.courseIds } },
      { status },
      { new: true }
    );
    if (!session) return res.status(404).json({ success: false, message: 'Session not found' });
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getStudents = async (req, res) => {
  try {
    const courseIds = req.user.courseIds || [];
    const students = await User.find({
      courseId: { $in: courseIds },
      role: 'student'
    }).select('-password').lean();

    // Attach total attendance count
    const Attendance = require('../models/Attendance');
    const studentData = await Promise.all(students.map(async (s) => {
      const attCount = await Attendance.countDocuments({ studentId: s._id, status: 'present' });
      return { ...s, totalAttendance: attCount };
    }));

    res.json({ success: true, data: studentData });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createStudent = async (req, res) => {
  try {
    const { name, email, password, courseId, division } = req.body;

    // Authorization check
    if (!req.user.courseIds.map(id => id.toString()).includes(courseId)) {
      return res.status(403).json({ success: false, message: 'You can only add students to your own courses.' });
    }

    const student = await User.create({
      name,
      email,
      password,
      role: 'student',
      courseId,
      division
    });

    res.status(201).json({ success: true, data: student });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.updateStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, courseId, division } = req.body;

    const student = await User.findById(id);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    const myCourses = req.user.courseIds.map(cid => cid.toString());
    const isOwner = myCourses.includes(student.courseId?.toString());
    const isNewOwner = myCourses.includes(courseId);

    if (!isOwner && !isNewOwner) {
      return res.status(403).json({ success: false, message: 'You do not have permission to manage this student.' });
    }

    student.name = name || student.name;
    student.email = email || student.email;
    student.courseId = courseId || student.courseId;
    student.division = division || student.division;

    await student.save();
    res.json({ success: true, data: student });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.deleteStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const student = await User.findById(id);
    if (!student || student.role !== 'student') {
      return res.status(404).json({ success: false, message: 'Student not found.' });
    }

    if (!req.user.courseIds.map(cid => cid.toString()).includes(student.courseId?.toString())) {
      return res.status(403).json({ success: false, message: 'You can only delete students assigned to your own courses.' });
    }

    await User.findByIdAndDelete(id);
    res.json({ success: true, message: 'Student deleted successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const PASS_SCORE = 60;

exports.getGeneralAnalytics = async (req, res) => {
  try {
    const courseIds = req.user.courseIds || [];
    if (courseIds.length === 0) {
      return res.json({
        success: true,
        data: {
          totalSubmissions: 0,
          avgScore: 0,
          passRate: 0,
          gradeBreakdown: { A: 0, B: 0, C: 0, D: 0, F: 0 }
        }
      });
    }

    const [summary] = await Result.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      {
        $group: {
          _id: null,
          totalSubmissions: { $sum: 1 },
          avgScore: { $avg: '$score' },
          passed: { $sum: { $cond: [{ $gte: ['$score', PASS_SCORE] }, 1, 0] } }
        }
      }
    ]);

    const [grades] = await Result.aggregate([
      { $match: { courseId: { $in: courseIds } } },
      {
        $group: {
          _id: null,
          A: { $sum: { $cond: [{ $gte: ['$score', 90] }, 1, 0] } },
          B: {
            $sum: {
              $cond: [{ $and: [{ $gte: ['$score', 80] }, { $lt: ['$score', 90] }] }, 1, 0]
            }
          },
          C: {
            $sum: {
              $cond: [{ $and: [{ $gte: ['$score', 70] }, { $lt: ['$score', 80] }] }, 1, 0]
            }
          },
          D: {
            $sum: {
              $cond: [{ $and: [{ $gte: ['$score', 60] }, { $lt: ['$score', 70] }] }, 1, 0]
            }
          },
          F: { $sum: { $cond: [{ $lt: ['$score', 60] }, 1, 0] } }
        }
      }
    ]);

    const total = summary ? summary.totalSubmissions : 0;
    const avgScore = summary && total ? Math.round(summary.avgScore * 10) / 10 : 0;
    const passRate = summary && total ? Math.round((summary.passed / total) * 1000) / 10 : 0;
    const gradeBreakdown = grades
      ? { A: grades.A, B: grades.B, C: grades.C, D: grades.D, F: grades.F }
      : { A: 0, B: 0, C: 0, D: 0, F: 0 };

    res.json({
      success: true,
      data: {
        totalSubmissions: total,
        avgScore,
        passRate,
        gradeBreakdown
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getSessionResults = async (req, res) => {
  try {
    const session = await Session.findOne({
      _id: req.params.sessionId,
      courseId: { $in: req.user.courseIds }
    });
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }
    const results = await Result.find({ sessionId: session._id }).populate('studentId', 'name email');
    res.json({ success: true, data: { results, stats: { total: results.length } } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getMCQBanks = async (req, res) => {
  try {
    const banks = await MCQBank.find({ createdBy: req.user._id })
      .sort({ createdAt: -1 })
      .lean();
    res.json({ success: true, data: banks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateMCQBank = async (req, res) => {
  try {
    const { title, subject, questions } = req.body;
    const updateData = {};
    if (typeof title === 'string') updateData.title = title.trim();
    if (typeof subject === 'string') updateData.subject = subject.trim();
    if (Array.isArray(questions)) updateData.questions = questions;

    const bank = await MCQBank.findOneAndUpdate(
      { _id: req.params.id, createdBy: req.user._id },
      updateData,
      { new: true, runValidators: true }
    );

    if (!bank) {
      return res.status(404).json({ success: false, message: 'MCQ bank not found' });
    }

    // Anchor updated content to blockchain
    blockchain.sealGenericData(bank.questions, 'mcqbank', bank._id.toString())
      .catch(e => console.warn('MCQ Bank update anchoring failed:', e.message));

    res.json({ success: true, data: bank });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.uploadMCQ = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, message: 'No file uploaded (use field "pdf")' });
  }
  const filePath = req.file.path;
  try {
    const { title, subject, numQuestions } = req.body;
    const n = Math.min(100, Math.max(5, parseInt(String(numQuestions || 10), 10) || 10));

    // Using the unified aiParserService which handles DOCX, PDF, Images, and Regex fallbacks
    const { questions, meta } = await aiParserSvc.extractMCQsFromDocument(
      filePath,
      subject || 'General',
      n,
      req.file.originalname
    );

    const doc = await MCQBank.create({
      title: title || 'MCQ Bank',
      subject: subject || 'General',
      questions,
      createdBy: req.user._id,
      meta: { ...meta, originalTitle: title }
    });

    // Anchor new content to blockchain
    blockchain.sealGenericData(doc.questions, 'mcqbank', doc._id.toString())
      .catch(e => console.warn('MCQ Bank upload anchoring failed:', e.message));

    res.json({
      success: true,
      data: {
        _id: doc._id,
        title: doc.title,
        questionCount: questions.length,
        questions: doc.questions,
        meta: doc.meta
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Extraction failed: ' + err.message });
  } finally {
    try {
      await fs.unlink(filePath);
    } catch {
      // ignore
    }
  }
};

exports.deleteMCQBank = async (req, res) => {
  try {
    const bank = await MCQBank.findOneAndDelete({ _id: req.params.id, createdBy: req.user._id });
    if (!bank) {
      return res.status(404).json({ success: false, message: 'MCQ bank not found' });
    }
    res.json({ success: true, message: 'MCQ Bank deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
