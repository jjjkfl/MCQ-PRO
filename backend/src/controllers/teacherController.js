/**
 * src/controllers/teacherController.js
 * Teacher dashboard — PDF upload, MCQ management, session, result monitoring
 */

const path     = require('path');
const fs       = require('fs');
const multer   = require('multer');
const mongoose = require('mongoose');
const Session  = require('../models/Session');
const MCQBank  = require('../models/MCQBank');
const Result   = require('../models/Result');
const User     = require('../models/User');
const { extractMCQsFromPDF } = require('../services/aiParserService');
const logger   = require('../utils/logger');

/* ─── Multer Config for PDF uploads ──────────────────────────────── */
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
  if (file.mimetype === 'application/pdf') cb(null, true);
  else cb(new Error('Only PDF files allowed'), false);
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
    const teacherId = req.user._id;

    const [sessions, mcqBanks, totalStudents, recentResults] = await Promise.all([
      Session.find({ createdBy: teacherId }).sort('-createdAt').limit(5),
      MCQBank.find({ createdBy: teacherId }).sort('-createdAt').limit(5),
      User.countDocuments({ role: 'student', isActive: true }),
      Result.find({ session: { $in: await Session.find({ createdBy: teacherId }).distinct('_id') } })
            .populate('student', 'firstName lastName studentId')
            .populate('session', 'title')
            .sort('-submittedAt')
            .limit(10),
    ]);

    const activeSessions = sessions.filter(s => s.status === 'active').length;
    const totalSessions  = sessions.length;

    res.json({
      success : true,
      data    : {
        stats         : { activeSessions, totalSessions, totalStudents, totalMCQBanks: mcqBanks.length },
        recentSessions: sessions,
        recentMCQBanks: mcqBanks,
        recentResults,
      },
    });
  } catch (err) {
    logger.error(`Teacher dashboard error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to load dashboard.' });
  }
};

/* ─── UPLOAD PDF & EXTRACT MCQs ───────────────────────────────────── */
exports.uploadPDF = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'PDF file is required.' });
    }

    const { title, subject, chapter, numQuestions } = req.body;
    if (!title || !subject) {
      fs.unlink(req.file.path, () => {});
      return res.status(400).json({ success: false, message: 'Title and subject are required.' });
    }

    logger.info(`PDF upload: ${req.file.originalname} by teacher ${req.user._id}`);

    /* Extract MCQs via AI */
    const { questions, meta } = await extractMCQsFromPDF(
      req.file.path,
      subject,
      parseInt(numQuestions) || 20
    );

    if (!questions || questions.length === 0) {
      fs.unlink(req.file.path, () => {});
      return res.status(422).json({ success: false, message: 'No MCQs could be extracted from this PDF.' });
    }

    /* Save to MCQBank */
    const bank = await MCQBank.create({
      title,
      subject,
      chapter    : chapter || '',
      createdBy  : req.user._id,
      questions,
      aiExtracted: true,
      sourceFile : {
        originalName: req.file.originalname,
        storedName  : req.file.filename,
        size        : req.file.size,
        mimetype    : req.file.mimetype,
      },
      extractionMeta: {
        model      : meta.model,
        tokens     : meta.totalTokens,
        extractedAt: new Date(),
      },
    });

    logger.info(`MCQ bank created: ${bank._id} with ${questions.length} questions`);

    res.status(201).json({
      success : true,
      message : `Successfully extracted ${questions.length} MCQs from PDF.`,
      data    : {
        bankId    : bank._id,
        title     : bank.title,
        subject   : bank.subject,
        questionCount: bank.questions.length,
        totalMarks: bank.totalMarks,
        questions : bank.questions.map(q => ({
          _id         : q._id,
          questionText: q.questionText,
          options     : q.options,
          correctAnswer: q.correctAnswer,
          difficulty  : q.difficulty,
          topic       : q.topic,
          marks       : q.marks,
        })),
      },
    });
  } catch (err) {
    if (req.file) fs.unlink(req.file.path, () => {});
    logger.error(`PDF upload error: ${err.message}`);
    res.status(500).json({ success: false, message: `Failed to process PDF: ${err.message}` });
  }
};

/* ─── GET ALL MCQ BANKS ───────────────────────────────────────────── */
exports.getMCQBanks = async (req, res) => {
  try {
    const { page = 1, limit = 10, subject } = req.query;
    const filter = { createdBy: req.user._id };
    if (subject) filter.subject = new RegExp(subject, 'i');

    const [banks, total] = await Promise.all([
      MCQBank.find(filter)
             .select('-questions.correctAnswer')
             .sort('-createdAt')
             .limit(parseInt(limit))
             .skip((parseInt(page) - 1) * parseInt(limit)),
      MCQBank.countDocuments(filter),
    ]);

    res.json({
      success    : true,
      data       : banks,
      pagination : { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch MCQ banks.' });
  }
};

/* ─── GET MCQ BANK DETAIL (with correct answers for teacher) ──────── */
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
    const bank = await MCQBank.findOne({ _id: req.params.bankId, createdBy: req.user._id });
    if (!bank) return res.status(404).json({ success: false, message: 'MCQ bank not found.' });

    const allowed = ['title', 'subject', 'chapter', 'description', 'questions', 'tags', 'isPublished'];
    allowed.forEach(f => { if (req.body[f] !== undefined) bank[f] = req.body[f]; });

    await bank.save();
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

    /* Delete source PDF if stored */
    if (bank.sourceFile?.storedName) {
      const filePath = path.join(__dirname, '../../uploads', bank.sourceFile.storedName);
      fs.unlink(filePath, () => {});
    }

    res.json({ success: true, message: 'MCQ bank deleted.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to delete MCQ bank.' });
  }
};

/* ─── CREATE EXAM SESSION ─────────────────────────────────────────── */
exports.createSession = async (req, res) => {
  try {
    const {
      title, description, mcqBankId, scheduledStart, durationMinutes,
      passingScore, negativeMarking, settings, numQuestions, shuffleQuestions,
    } = req.body;

    /* Validate MCQ bank ownership */
    const bank = await MCQBank.findOne({ _id: mcqBankId, createdBy: req.user._id });
    if (!bank) return res.status(404).json({ success: false, message: 'MCQ bank not found.' });

    /* Select questions */
    let selectedQuestions = shuffleQuestions
      ? bank.getRandomQuestions(numQuestions || bank.questions.length)
      : bank.questions.slice(0, numQuestions || bank.questions.length);

    if (selectedQuestions.length === 0) {
      return res.status(400).json({ success: false, message: 'No questions available.' });
    }

    const start   = new Date(scheduledStart);
    const end     = new Date(start.getTime() + durationMinutes * 60000);
    const code    = Session.generateAccessCode();

    const session = await Session.create({
      title,
      description,
      createdBy      : req.user._id,
      mcqBank        : mcqBankId,
      questions      : selectedQuestions,
      scheduledStart : start,
      scheduledEnd   : end,
      durationMinutes: parseInt(durationMinutes),
      passingScore   : passingScore || 50,
      negativeMarking: negativeMarking || false,
      accessCode     : code,
      status         : 'scheduled',
      settings       : settings || {},
    });

    /* Update bank usage */
    await MCQBank.findByIdAndUpdate(mcqBankId, { $addToSet: { usedInSessions: session._id } });

    logger.info(`Session created: ${session._id} by teacher ${req.user._id}`);

    res.status(201).json({
      success : true,
      message : 'Exam session created.',
      data    : { ...session.toObject(), accessCode: session.accessCode },
    });
  } catch (err) {
    logger.error(`Create session error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to create session.' });
  }
};

/* ─── GET ALL SESSIONS ────────────────────────────────────────────── */
exports.getSessions = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const filter = { createdBy: req.user._id };
    if (status) filter.status = status;

    const [sessions, total] = await Promise.all([
      Session.find(filter)
             .select('-questions.correctAnswer')
             .populate('mcqBank', 'title subject')
             .sort('-scheduledStart')
             .limit(parseInt(limit))
             .skip((parseInt(page) - 1) * parseInt(limit)),
      Session.countDocuments(filter),
    ]);

    res.json({
      success    : true,
      data       : sessions,
      pagination : { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch sessions.' });
  }
};

/* ─── GET SESSION DETAIL ──────────────────────────────────────────── */
exports.getSessionDetail = async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.sessionId, createdBy: req.user._id })
      .populate('enrolledStudents', 'firstName lastName studentId email')
      .populate('submittedStudents', 'firstName lastName studentId');

    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch session.' });
  }
};

/* ─── UPDATE SESSION STATUS ───────────────────────────────────────── */
exports.updateSessionStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const allowed    = ['scheduled', 'active', 'completed', 'cancelled'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    const session = await Session.findOneAndUpdate(
      { _id: req.params.sessionId, createdBy: req.user._id },
      {
        status,
        ...(status === 'active'    && { actualStart: new Date() }),
        ...(status === 'completed' && { actualEnd  : new Date() }),
      },
      { new: true }
    );

    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    /* Notify via Socket.io */
    const io = req.app.get('io');
    if (io) {
      io.to(session._id.toString()).emit(`exam:status_changed`, { status, sessionId: session._id });
    }

    res.json({ success: true, message: `Session status updated to ${status}.`, data: session });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update session.' });
  }
};

/* ─── GET SESSION RESULTS (teacher view) ─────────────────────────── */
exports.getSessionResults = async (req, res) => {
  try {
    /* Validate ownership */
    const session = await Session.findOne({ _id: req.params.sessionId, createdBy: req.user._id });
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    const results = await Result.find({ session: req.params.sessionId, isFinalized: true })
      .populate('student', 'firstName lastName studentId email program semester')
      .sort('-submittedAt');

    const stats = {
      total       : results.length,
      passed      : results.filter(r => r.isPassed).length,
      failed      : results.filter(r => !r.isPassed).length,
      avgPercent  : results.length
                      ? +(results.reduce((s, r) => s + r.percentage, 0) / results.length).toFixed(2)
                      : 0,
      highScore   : results.length ? Math.max(...results.map(r => r.percentage)) : 0,
      lowScore    : results.length ? Math.min(...results.map(r => r.percentage)) : 0,
      gradeBreakdown: {
        'A+': results.filter(r => r.grade === 'A+').length,
        'A' : results.filter(r => r.grade === 'A' ).length,
        'B' : results.filter(r => r.grade === 'B' ).length,
        'C' : results.filter(r => r.grade === 'C' ).length,
        'D' : results.filter(r => r.grade === 'D' ).length,
        'F' : results.filter(r => r.grade === 'F' ).length,
      },
    };

    res.json({ success: true, data: { session, results, stats } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch results.' });
  }
};

/* ─── GET ALL STUDENTS ────────────────────────────────────────────── */
exports.getAllStudents = async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;
    const filter = { role: 'student', isActive: true };
    if (search) {
      filter.$or = [
        { firstName  : new RegExp(search, 'i') },
        { lastName   : new RegExp(search, 'i') },
        { email      : new RegExp(search, 'i') },
        { studentId  : new RegExp(search, 'i') },
      ];
    }

    const [students, total] = await Promise.all([
      User.find(filter)
          .select('-password -refreshToken -notifications')
          .sort('firstName')
          .limit(parseInt(limit))
          .skip((parseInt(page) - 1) * parseInt(limit)),
      User.countDocuments(filter),
    ]);

    res.json({
      success    : true,
      data       : students,
      pagination : { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch students.' });
  }
};

/* ─── GET STUDENT DETAIL (teacher view) ──────────────────────────── */
exports.getStudentDetail = async (req, res) => {
  try {
    const [student, results] = await Promise.all([
      User.findOne({ _id: req.params.studentId, role: 'student' }).select('-password -refreshToken'),
      Result.find({ student: req.params.studentId, isFinalized: true })
            .populate('session', 'title scheduledStart')
            .sort('-submittedAt'),
    ]);

    if (!student) return res.status(404).json({ success: false, message: 'Student not found.' });

    res.json({ success: true, data: { student, results } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch student detail.' });
  }
};

/* ─── LIVE MONITORING: GET ACTIVE SESSION STUDENTS ───────────────── */
exports.getLiveMonitoring = async (req, res) => {
  try {
    const session = await Session.findOne({ _id: req.params.sessionId, createdBy: req.user._id })
      .populate('enrolledStudents', 'firstName lastName studentId');

    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    const submitted = await Result.find({ session: session._id })
      .select('student percentage grade isPassed tabSwitches submittedAt')
      .populate('student', 'firstName lastName studentId');

    res.json({
      success : true,
      data    : {
        sessionId     : session._id,
        status        : session.status,
        enrolledCount : session.enrolledStudents.length,
        submittedCount: submitted.length,
        enrolled      : session.enrolledStudents,
        submitted,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch monitoring data.' });
  }
};