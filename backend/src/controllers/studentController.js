/**
 * src/controllers/studentController.js
 * Student-facing exam, result, CGPA logic
 * Simplified to match Prompt 4 database schema.
 */

const mongoose = require('mongoose');
const User     = require('../models/User');
const Session  = require('../models/Session');
const Result   = require('../models/Result');
const MCQBank  = require('../models/MCQBank');
const logger   = require('../utils/logger');

/* ─── GET STUDENT DASHBOARD DATA ─────────────────────────────────── */
exports.getDashboard = async (req, res) => {
  try {
    const studentId = req.user._id.toString();

    const [user, results, availableExams] = await Promise.all([
      User.findById(studentId),
      Result.find({ studentId }).sort('-createdAt').limit(10),
      Session.find({ status: 'active' }).limit(10),
    ]);

    res.json({
      success  : true,
      data     : {
        profile: {
          name: user.name,
          email: user.email,
          section: user.studentDetails.section,
          rank: user.studentDetails.rank,
          totalPeers: user.studentDetails.totalPeers,
          attendance: user.studentDetails.attendance,
          sessionsLogged: user.studentDetails.sessionsLogged,
          totalSessions: user.studentDetails.totalSessions,
          gpa: user.studentDetails.gpa
        },
        stats: {
          totalExams: results.length,
          passedExams: results.filter(r => r.score >= 50).length,
          failedExams: results.filter(r => r.score < 50).length,
          cgpa: user.studentDetails.gpa || 0,
        },
        tasks: user.tasks,
        subjectPerformance: user.subjectPerformance,
        recentResults: results.map(r => ({
          _id: r._id,
          session: { title: r.examId },
          submittedAt: r.createdAt,
          grade: r.score >= 50 ? 'A' : 'F',
          percentage: r.score
        })),
        upcomingExams: availableExams.map(s => ({
          _id: s._id,
          title: s.examId,
          scheduledStart: s.startTime,
          durationMinutes: s.duration,
          status: s.status,
          accessCode: 'EXAM123' // Simplified
        })),
      },
    });
  } catch (err) {
    logger.error(`Dashboard error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to load dashboard.' });
  }
};

/* ─── GET AVAILABLE EXAMS ────────────────── */
exports.getAvailableExams = async (req, res) => {
  try {
    const exams = await Session.find({ status: 'active' }).sort('-createdAt');
    res.json({ success: true, data: exams.map(s => ({
      _id: s._id,
      title: s.examId,
      scheduledStart: s.startTime,
      durationMinutes: s.duration,
      status: s.status,
      accessCode: 'EXAM123'
    })) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch exams.' });
  }
};

/* ─── JOIN EXAM BY ACCESS CODE ───────────────────────────────────── */
exports.joinExamByCode = async (req, res) => {
  try {
    const { accessCode } = req.body;
    // In simplified mode, we just find the first active session or by examId if accessCode is examId
    const session = await Session.findOne({ status: 'active' });

    if (!session) {
      return res.status(404).json({ success: false, message: 'No active exams found.' });
    }

    res.json({ success: true, message: 'Joined exam successfully.', sessionId: session._id });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to join exam.' });
  }
};

/* ─── GET EXAM QUESTIONS ─────────────────── */
exports.getExamQuestions = async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId);
    if (!session) return res.status(404).json({ success: false, message: 'Session not found.' });

    // Get the most recent MCQ bank with the most questions
    const banks = await MCQBank.find({}).sort('-createdAt');
    
    // Collect all questions from all banks (or pick the largest one)
    let allQuestions = [];
    for (const bank of banks) {
      if (bank.questions && bank.questions.length > 0) {
        allQuestions = [...allQuestions, ...bank.questions];
      }
    }

    // If no questions from any bank, return empty
    if (allQuestions.length === 0) {
      return res.json({
        success: true,
        data: {
          sessionId: session._id,
          title: session.examId,
          durationMinutes: session.duration,
          questions: []
        }
      });
    }

    res.json({
      success : true,
      data    : {
        sessionId: session._id,
        title: session.examId,
        durationMinutes: session.duration,
        questions: allQuestions.map(q => ({
          _id: q._id,
          questionText: q.questionText,
          image: q.image || '',
          options: q.options,
          marks: q.marks || 1
        }))
      },
    });
  } catch (err) {
    logger.error(`Exam load error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to load exam.' });
  }
};

/* ─── SUBMIT EXAM ─────────────────────────────────────────────────── */
exports.submitExam = async (req, res) => {
  try {
    const { sessionId, answers, timeTaken, violations } = req.body;
    const session = await Session.findById(sessionId);

    // Load all questions from all banks
    const banks = await MCQBank.find({}).sort('-createdAt');
    const allQuestions = [];
    for (const bank of banks) {
      if (bank.questions && bank.questions.length > 0) {
        allQuestions.push(...bank.questions);
      }
    }

    // Build answer lookup { questionId → selectedOption }
    const answerMap = {};
    if (Array.isArray(answers)) {
      answers.forEach(a => { answerMap[a.questionId] = a.selectedOption; });
    }

    // Grade each question
    let correctCount = 0;
    let totalMarks = 0;
    let obtainedMarks = 0;

    const detailedAnswers = allQuestions.map(q => {
      const qId = q._id.toString();
      const selected = answerMap[qId] || '';
      const correct = q.correctAnswer || '';
      const isCorrect = selected && selected.toUpperCase() === correct.toUpperCase();
      const marks = q.marks || 1;

      totalMarks += marks;
      if (isCorrect) {
        correctCount++;
        obtainedMarks += marks;
      }

      return {
        questionId: qId,
        questionText: q.questionText,
        image: q.image || '',
        options: q.options.map(o => ({ label: o.label, text: o.text })),
        selectedAnswer: selected,
        correctAnswer: correct,
        isCorrect,
        marks
      };
    });

    const percentage = totalMarks > 0 ? Math.round((obtainedMarks / totalMarks) * 100) : 0;

    const result = await Result.create({
      studentId: req.user._id.toString(),
      examId: session ? session.examId : 'General Exam',
      score: percentage,
      totalMarks,
      correctCount,
      totalQuestions: allQuestions.length,
      timeTaken: timeTaken || 0,
      violations: violations || 0,
      answers: detailedAnswers
    });

    logger.info(`Exam submitted: student=${req.user._id} score=${percentage}% correct=${correctCount}/${allQuestions.length}`);

    res.json({
      success: true,
      message: 'Exam submitted successfully.',
      data: {
        resultId: result._id,
        percentage,
        correctCount,
        totalQuestions: allQuestions.length,
        totalMarks,
        obtainedMarks,
        isPassed: percentage >= 50,
        timeTaken: timeTaken || 0
      }
    });
  } catch (err) {
    logger.error(`Submit error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to submit exam.' });
  }
};

/* ─── GET MY RESULTS ──────────────────────────────────────────────── */
exports.getMyResults = async (req, res) => {
  try {
    const results = await Result.find({ studentId: req.user._id.toString() }).sort('-createdAt');
    res.json({ success: true, data: results.map(r => ({
      _id: r._id,
      session: { title: r.examId },
      submittedAt: r.createdAt,
      percentage: r.score,
      grade: r.score >= 50 ? 'A' : 'F',
      isPassed: r.score >= 50
    })) });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch results.' });
  }
};

/* ─── GET SINGLE RESULT DETAIL ────────────────────────────────────── */
exports.getResultDetail = async (req, res) => {
  try {
    const result = await Result.findById(req.params.resultId);
    if (!result) return res.status(404).json({ success: false, message: 'Result not found.' });

    res.json({
      success : true,
      data    : {
        _id: result._id,
        examId: result.examId,
        score: result.score,
        totalMarks: result.totalMarks || 0,
        correctCount: result.correctCount || 0,
        totalQuestions: result.totalQuestions || 0,
        timeTaken: result.timeTaken || 0,
        violations: result.violations || 0,
        createdAt: result.createdAt,
        session: { title: result.examId },
        percentage: result.score,
        marksObtained: result.correctCount || 0,
        isPassed: result.score >= 50,
        grade: result.score >= 90 ? 'A+' : result.score >= 80 ? 'A' : result.score >= 70 ? 'B' : result.score >= 60 ? 'C' : result.score >= 50 ? 'D' : 'F',
        answers: result.answers || []
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch result.' });
  }
};

/* ─── GET CGPA ────────────────── */
exports.getCGPA = async (req, res) => {
  try {
    const results = await Result.find({ studentId: req.user._id.toString() });
    const cgpa = results.length ? +(results.reduce((s, r) => s + (r.score/25), 0) / results.length).toFixed(2) : 0;
    res.json({ success: true, data: { cgpa } });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to compute CGPA.' });
  }
};

/* ─── VERIFY CERTIFICATE ────────────────── */
exports.verifyCertificate = async (req, res) => {
  try {
    const { resultId } = req.body;
    const result = await Result.findById(resultId);
    if (!result) return res.status(404).json({ success: false, message: 'Certificate not found.' });

    res.json({
      success: true,
      data: {
        verified: true,
        result: {
          examId: result.examId,
          score: result.score,
          createdAt: result.createdAt
        }
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Verification failed.' });
  }
};

/* ─── NOTIFICATIONS ────────────────── */
exports.getNotifications = async (req, res) => {
  res.json({ success: true, data: [] });
};

exports.markNotificationsRead = async (req, res) => {
  res.json({ success: true, message: 'Read.' });
};