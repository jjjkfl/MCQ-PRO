/**
 * src/controllers/teacherController.js
 * Teacher dashboard — DOCX/PDF upload, MCQ management, session, result monitoring
 * Supports structured DOCX parsing with image extraction + AI fallback.
 */

const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const mongoose = require('mongoose');
const Session  = require('../models/Session');
const MCQBank  = require('../models/MCQBank');
const Result   = require('../models/Result');
const User     = require('../models/User');
const { extractMCQsFromDocx, extractMCQsFromDocument } = require('../services/aiParserService');
const logger   = require('../utils/logger');

/* ─── Multer Config for Document uploads ─────────────────────────── */
const uploadDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination : (_req, _file, cb) => cb(null, uploadDir),
  filename    : (_req, file, cb) => {
    const safeName = `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname)}`;
    cb(null, safeName);
  },
});

const fileFilter = (_req, file, cb) => {
  const allowed = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ];
  if (allowed.includes(file.mimetype)) cb(null, true);
  else cb(new Error('Only PDF and Word documents allowed'), false);
};

const upload = multer({
  storage,
  fileFilter,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB
});

exports.uploadPDFMiddleware = upload.single('pdf');

/* ─── DASHBOARD ───────────────────────────────────────────────────── */
exports.getDashboard = async (req, res) => {
  try {
    const [sessions, mcqBanks, totalStudents] = await Promise.all([
      Session.find({}).sort('-createdAt').limit(10),
      MCQBank.find({ createdBy: req.user._id }).sort('-createdAt').limit(10),
      User.countDocuments({ role: 'student' }),
    ]);

    const activeSessions = sessions.filter(s => s.status === 'active').length;

    res.json({
      success : true,
      data    : {
        stats: { 
          activeSessions, 
          totalSessions: sessions.length, 
          totalStudents, 
          totalMCQBanks: mcqBanks.length 
        },
        recentSessions: sessions.map(s => ({
          _id: s._id,
          title: s.examId,
          status: s.status,
          scheduledStart: s.startTime,
          durationMinutes: s.duration,
          submissions: 0
        })),
        recentMCQBanks: mcqBanks,
        recentResults: [] 
      },
    });
  } catch (err) {
    console.error('FULL DASHBOARD ERROR:', err);
    logger.error(`Teacher dashboard error: ${err.message}`);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to load dashboard.', 
      error: err.message,
      stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
    });
  }
};

/* ─── UPLOAD DOCUMENT & EXTRACT MCQs ──────────────────────────────── */
exports.uploadPDF = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, message: 'File is required.' });

    const { title, subject, numQuestions } = req.body;
    if (!title || !subject) {
      if (req.file) fs.unlink(req.file.path, () => {});
      return res.status(400).json({ success: false, message: 'Title and subject are required.' });
    }

    const ext = path.extname(req.file.originalname).toLowerCase();
    let questions, meta;

    if (ext === '.docx') {
      /* ─── DOCX Structured Parser (with images) ─── */
      logger.info(`Using DOCX structured parser for: ${req.file.originalname}`);
      const result = await extractMCQsFromDocx(req.file.path);
      questions = result.questions;
      meta = result.meta;

      /* If structured parsing found 0 questions, fall back to AI */
      if (!questions || questions.length === 0) {
        logger.warn('DOCX structured parser found 0 questions — falling back to AI extraction');
        const aiFallback = await extractMCQsFromDocument(
          req.file.path,
          subject,
          parseInt(numQuestions) || 20
        );
        questions = aiFallback.questions;
        meta = aiFallback.meta;
      }
    } else {
      /* ─── PDF / Legacy Word: AI-based extraction ─── */
      const result = await extractMCQsFromDocument(
        req.file.path,
        subject,
        parseInt(numQuestions) || 20
      );
      questions = result.questions;
      meta = result.meta;
    }

    if (!questions || questions.length === 0) {
      fs.unlink(req.file.path, () => {});
      return res.status(422).json({ success: false, message: 'No MCQs could be extracted from the document.' });
    }

    /* Save to MCQBank */
    const bank = await MCQBank.create({
      title,
      subject,
      createdBy: req.user._id,
      questions
    });

    /* Return full question data for preview */
    res.status(201).json({
      success : true,
      message : `Successfully extracted ${questions.length} MCQs.`,
      data    : {
        bankId: bank._id,
        title: bank.title,
        subject: bank.subject,
        questionCount: bank.questions.length,
        questions: bank.questions,
        meta
      },
    });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    logger.error(`Upload error: ${err.message}`);
    res.status(500).json({ success: false, message: `Failed to process document: ${err.message}` });
  }
};

/* ─── GET ALL MCQ BANKS ───────────────────────────────────────────── */
exports.getMCQBanks = async (req, res) => {
  try {
    const banks = await MCQBank.find({ createdBy: req.user._id }).sort('-createdAt');
    res.json({ success: true, data: banks });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch MCQ banks.' });
  }
};

/* ─── GET MCQ BANK DETAIL ─────────────────────────────────────────── */
exports.getMCQBankDetail = async (req, res) => {
  try {
    const bank = await MCQBank.findOne({ _id: req.params.bankId, createdBy: req.user._id });
    if (!bank) return res.status(404).json({ success: false, message: 'MCQ bank not found.' });
    res.json({ success: true, data: bank });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch MCQ bank.' });
  }
};

/* ─── UPDATE MCQ BANK ─────────────────────────────────────────────── */
exports.updateMCQBank = async (req, res) => {
  try {
    const bank = await MCQBank.findOneAndUpdate(
      { _id: req.params.bankId, createdBy: req.user._id },
      req.body,
      { new: true }
    );
    if (!bank) return res.status(404).json({ success: false, message: 'MCQ bank not found.' });
    res.json({ success: true, message: 'MCQ bank updated.', data: bank });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update MCQ bank.' });
  }
};

/* ─── DELETE MCQ BANK ─────────────────────────────────────────────── */
exports.deleteMCQBank = async (req, res) => {
  try {
    const bank = await MCQBank.findOneAndDelete({ _id: req.params.bankId, createdBy: req.user._id });
    if (!bank) return res.status(404).json({ success: false, message: 'MCQ bank not found.' });
    res.json({ success: true, message: 'MCQ bank deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete MCQ bank.' });
  }
};

/* ─── CREATE EXAM SESSION ─────────────────────────────────────────── */
exports.createSession = async (req, res) => {
  try {
    const { title, scheduledStart, durationMinutes } = req.body;
    const session = await Session.create({
      examId: title,
      startTime: new Date(scheduledStart),
      duration: parseInt(durationMinutes),
      status: 'active'
    });
    res.status(201).json({ success: true, message: 'Session created.', data: session });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to create session.' });
  }
};

/* ─── GET ALL SESSIONS ────────────────────────────────────────────── */
exports.getSessions = async (req, res) => {
  try {
    const sessions = await Session.find({}).sort('-createdAt');
    res.json({
      success : true,
      data    : sessions.map(s => ({
        _id: s._id,
        title: s.examId,
        scheduledStart: s.startTime,
        durationMinutes: s.duration,
        status: s.status
      }))
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch sessions.' });
  }
};

/* ─── GET SESSION DETAIL ──────────────────────────────────────────── */
exports.getSessionDetail = async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });
    res.json({ success: true, data: {
      _id: session._id,
      title: session.examId,
      scheduledStart: session.startTime,
      durationMinutes: session.duration,
      status: session.status,
      enrolledStudents: [],
      submittedStudents: []
    }});
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch session.' });
  }
};

/* ─── UPDATE SESSION STATUS ───────────────────────────────────────── */
exports.updateSessionStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const session = await Session.findByIdAndUpdate(req.params.sessionId, { status }, { new: true });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });
    res.json({ success: true, message: 'Status updated.', data: session });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update status.' });
  }
};

/* ─── GET SESSION RESULTS (Teacher Analytics) ────────────────────── */
exports.getSessionResults = async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    const results = await Result.find({ examId: session.examId }).sort('-createdAt');
    
    const mappedResults = await Promise.all(results.map(async r => {
      const student = await User.findById(r.studentId).select('name email');
      return {
        _id: r._id,
        student: student || { name: 'Unknown Student' },
        percentage: r.score,
        grade: r.score >= 50 ? 'A' : 'F',
        isPassed: r.score >= 50,
        submittedAt: r.createdAt
      };
    }));

    const stats = {
      total: mappedResults.length,
      passed: mappedResults.filter(r => r.isPassed).length,
      failed: mappedResults.filter(r => !r.isPassed).length,
      avgPercent: mappedResults.length 
        ? +(mappedResults.reduce((s, r) => s + r.percentage, 0) / mappedResults.length).toFixed(2)
        : 0,
      highScore: mappedResults.length ? Math.max(...mappedResults.map(r => r.percentage)) : 0,
      lowScore: mappedResults.length ? Math.min(...mappedResults.map(r => r.percentage)) : 0,
      gradeBreakdown: {
        'A': mappedResults.filter(r => r.grade === 'A').length,
        'F': mappedResults.filter(r => r.grade === 'F').length,
      }
    };

    res.json({ success: true, data: { session: { title: session.examId }, results: mappedResults, stats } });
  } catch (err) {
    logger.error(`Analytics error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics.' });
  }
};

/* ─── GET ALL STUDENTS ────────────────────────────────────────────── */
exports.getAllStudents = async (req, res) => {
  try {
    const students = await User.find({ role: 'student' }).select('name email').sort('name');
    res.json({ success: true, data: students });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch students.' });
  }
};

/* ─── GET STUDENT DETAIL ─────────────────────────────────────────── */
exports.getStudentDetail = async (req, res) => {
  try {
    const student = await User.findOne({ _id: req.params.studentId, role: 'student' }).select('-password');
    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    const results = await Result.find({ studentId: student._id.toString() }).sort('-createdAt');
    const mapped = results.map(r => ({
      _id: r._id,
      session: { title: r.examId },
      submittedAt: r.createdAt,
      percentage: r.score,
      isPassed: r.score >= 50
    }));

    res.json({ success: true, data: { student, results: mapped } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch student detail.' });
  }
};

/* ─── LIVE MONITORING ────────────────────────────────────────────── */
exports.getLiveMonitoring = async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    // Get all results for this session's exam
    const results = await Result.find({ examId: session.examId }).sort('-createdAt');

    // Get enrolled students (participants)
    let enrolled = [];
    if (session.participants && session.participants.length > 0) {
      enrolled = await User.find({ _id: { $in: session.participants } }).select('name email');
    } else {
      // Fallback: get all students who submitted results
      const studentIds = results.map(r => r.studentId);
      enrolled = await User.find({ _id: { $in: studentIds } }).select('name email');
    }

    // Map enrolled with submission status
    const submittedIds = new Set(results.map(r => r.studentId));
    const enrolledData = enrolled.map(s => ({
      _id: s._id,
      firstName: s.name ? s.name.split(' ')[0] : 'Student',
      lastName: s.name ? s.name.split(' ').slice(1).join(' ') : '',
      studentId: s.email || s._id,
      hasSubmitted: submittedIds.has(s._id.toString())
    }));

    res.json({
      success: true,
      data: {
        sessionId: session._id,
        title: session.examId,
        status: session.status,
        enrolledCount: enrolledData.length,
        submittedCount: results.length,
        enrolled: enrolledData,
        submitted: results.map(r => ({
          studentId: r.studentId,
          score: r.score,
          correctCount: r.correctCount || 0,
          totalQuestions: r.totalQuestions || 0,
          timeTaken: r.timeTaken || 0,
          violations: r.violations || 0,
          submittedAt: r.createdAt
        }))
      }
    });
  } catch (err) {
    logger.error(`Monitor error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to fetch monitoring data.' });
  }
};

/* ─── GET SESSION RESULTS (Analytics) ────────────────────────────── */
exports.getSessionResults = async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    // Fetch all results for this session's exam
    const results = await Result.find({ examId: session.examId }).sort('-createdAt');

    if (results.length === 0) {
      return res.json({
        success: true,
        data: {
          sessionTitle: session.examId,
          stats: {
            total: 0,
            passed: 0,
            failed: 0,
            avgPercent: 0,
            highScore: 0,
            lowScore: 0,
            gradeBreakdown: { A: 0, B: 0, C: 0, D: 0, F: 0 }
          },
          results: []
        }
      });
    }

    // Calculate stats
    const scores = results.map(r => r.score);
    const passed = scores.filter(s => s >= 50).length;
    const avgPercent = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
    const highScore = Math.max(...scores);
    const lowScore = Math.min(...scores);

    // Grade breakdown
    const gradeBreakdown = { 'A+': 0, A: 0, B: 0, C: 0, D: 0, F: 0 };
    scores.forEach(s => {
      if (s >= 90) gradeBreakdown['A+']++;
      else if (s >= 80) gradeBreakdown.A++;
      else if (s >= 70) gradeBreakdown.B++;
      else if (s >= 60) gradeBreakdown.C++;
      else if (s >= 50) gradeBreakdown.D++;
      else gradeBreakdown.F++;
    });

    // Get student names
    const studentIds = results.map(r => r.studentId);
    const students = await User.find({ _id: { $in: studentIds } }).select('name email');
    const studentMap = {};
    students.forEach(s => { studentMap[s._id.toString()] = s; });

    const resultData = results.map(r => {
      const student = studentMap[r.studentId] || {};
      return {
        _id: r._id,
        studentName: student.name || 'Unknown',
        studentEmail: student.email || '',
        score: r.score,
        correctCount: r.correctCount || 0,
        totalQuestions: r.totalQuestions || 0,
        timeTaken: r.timeTaken || 0,
        violations: r.violations || 0,
        isPassed: r.score >= 50,
        grade: r.score >= 90 ? 'A+' : r.score >= 80 ? 'A' : r.score >= 70 ? 'B' : r.score >= 60 ? 'C' : r.score >= 50 ? 'D' : 'F',
        submittedAt: r.createdAt
      };
    });

    res.json({
      success: true,
      data: {
        sessionTitle: session.examId,
        stats: {
          total: results.length,
          passed,
          failed: results.length - passed,
          avgPercent,
          highScore,
          lowScore,
          gradeBreakdown
        },
        results: resultData
      }
    });
  } catch (err) {
    logger.error(`Session results error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to load results.' });
  }
};