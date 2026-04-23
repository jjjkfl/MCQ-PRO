/**
 * src/controllers/studentController.js
 * Student-facing exam, result, CGPA, certificate logic
 */

const mongoose = require('mongoose');
const User     = require('../models/User');
const Session  = require('../models/Session');
const Result   = require('../models/Result');
const MCQBank  = require('../models/MCQBank');
const { verifyResultOnBlockchain } = require('../services/blockchain/blockchainService');
const { computeHash }              = require('../services/blockchain/hashService');
const logger   = require('../utils/logger');

/* ─── GET STUDENT DASHBOARD DATA ─────────────────────────────────── */
exports.getDashboard = async (req, res) => {
  try {
    const studentId = req.user._id;

    const [user, results, upcomingExams] = await Promise.all([
      User.findById(studentId),
      Result.find({ student: studentId, isFinalized: true })
            .populate('session', 'title scheduledStart durationMinutes')
            .sort('-submittedAt')
            .limit(10),
      Session.find({
        enrolledStudents : studentId,
        status           : { $in: ['scheduled', 'active'] },
        scheduledStart   : { $gte: new Date() },
      }).select('title scheduledStart durationMinutes status accessCode'),
    ]);

    /* Compute CGPA from finalized results */
    const cgpaData = await computeCGPA(studentId);

    res.json({
      success  : true,
      data     : {
        profile      : {
          fullName   : user.fullName,
          studentId  : user.studentId,
          program    : user.program,
          semester   : user.semester,
          email      : user.email,
        },
        cgpa         : cgpaData,
        recentResults: results,
        upcomingExams,
        stats        : {
          totalExamsTaken : results.length,
          passed          : results.filter(r => r.isPassed).length,
          failed          : results.filter(r => !r.isPassed).length,
          avgPercentage   : results.length
                              ? +(results.reduce((s, r) => s + r.percentage, 0) / results.length).toFixed(2)
                              : 0,
        },
      },
    });
  } catch (err) {
    logger.error(`Dashboard error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to load dashboard.' });
  }
};

/* ─── GET AVAILABLE EXAMS (with access code join) ────────────────── */
exports.getAvailableExams = async (req, res) => {
  try {
    const exams = await Session.find({
      enrolledStudents : req.user._id,
      status           : { $in: ['scheduled', 'active'] },
    }).populate('createdBy', 'firstName lastName')
      .select('-questions.correctAnswer')
      .sort('scheduledStart');

    res.json({ success: true, data: exams });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch exams.' });
  }
};

/* ─── JOIN EXAM BY ACCESS CODE ───────────────────────────────────── */
exports.joinExamByCode = async (req, res) => {
  try {
    const { accessCode } = req.body;
    const session = await Session.findOne({ accessCode: accessCode.toUpperCase() });

    if (!session) {
      return res.status(404).json({ success: false, message: 'Invalid access code.' });
    }
    if (session.status === 'completed' || session.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'This exam is no longer available.' });
    }

    /* Add student if not already enrolled */
    if (!session.enrolledStudents.includes(req.user._id)) {
      session.enrolledStudents.push(req.user._id);
      await session.save();
    }

    res.json({ success: true, message: 'Joined exam successfully.', sessionId: session._id });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to join exam.' });
  }
};

/* ─── GET EXAM QUESTIONS (student-safe view, no correct answers) ─── */
exports.getExamQuestions = async (req, res) => {
  try {
    const session = await Session.findById(req.params.sessionId);
    if (!session) {
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    /* Must be enrolled */
    if (!session.enrolledStudents.includes(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Not enrolled in this exam.' });
    }

    if (!['active', 'scheduled'].includes(session.status)) {
      return res.status(400).json({ success: false, message: 'Exam is not accessible.' });
    }

    /* Check existing result (prevent re-entry if maxAttempts reached) */
    const existingResults = await Result.countDocuments({
      student : req.user._id,
      session : session._id,
    });
    if (existingResults >= session.allowedAttempts) {
      return res.status(400).json({ success: false, message: 'Maximum attempts reached.' });
    }

    /* Strip correct answers */
    const studentQuestions = session.questions.map(q => ({
      _id          : q._id,
      questionText : q.questionText,
      options      : q.options,
      marks        : q.marks,
      topic        : q.topic,
      difficulty   : q.difficulty,
    }));

    /* Shuffle options if enabled */
    if (session.settings.shuffleOptions) {
      studentQuestions.forEach(q => {
        q.options = q.options.sort(() => Math.random() - 0.5);
      });
    }

    res.json({
      success : true,
      data    : {
        sessionId      : session._id,
        title          : session.title,
        durationMinutes: session.durationMinutes,
        totalQuestions : studentQuestions.length,
        totalMarks     : session.questions.reduce((s, q) => s + q.marks, 0),
        settings       : session.settings,
        questions      : studentQuestions,
        endTime        : session.scheduledEnd,
      },
    });
  } catch (err) {
    logger.error(`Get exam questions error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Failed to load exam.' });
  }
};

/* ─── SUBMIT EXAM ─────────────────────────────────────────────────── */
exports.submitExam = async (req, res) => {
  const dbSession = await mongoose.startSession();
  dbSession.startTransaction();

  try {
    const { sessionId, answers, startedAt, tabSwitches } = req.body;
    // answers = [{ questionId, selectedOption }]

    const session = await Session.findById(sessionId).session(dbSession);
    if (!session) {
      await dbSession.abortTransaction();
      return res.status(404).json({ success: false, message: 'Session not found.' });
    }

    /* Enrolment check */
    if (!session.enrolledStudents.includes(req.user._id)) {
      await dbSession.abortTransaction();
      return res.status(403).json({ success: false, message: 'Not enrolled.' });
    }

    /* Duplicate submission check */
    const attemptNumber = (await Result.countDocuments({ student: req.user._id, session: sessionId })) + 1;
    if (attemptNumber > session.allowedAttempts) {
      await dbSession.abortTransaction();
      return res.status(400).json({ success: false, message: 'Maximum attempts reached.' });
    }

    /* Grade answers */
    const questionMap = new Map(session.questions.map(q => [q._id.toString(), q]));
    let rawScore = 0, negativeScore = 0, correctCount = 0, incorrectCount = 0, skippedCount = 0;
    const gradedAnswers = [];

    for (const q of session.questions) {
      const submitted = answers.find(a => a.questionId === q._id.toString());
      const selected  = submitted?.selectedOption || null;
      const isCorrect = selected === q.correctAnswer;

      let marksAwarded = 0;
      if (!selected) {
        skippedCount++;
      } else if (isCorrect) {
        correctCount++;
        marksAwarded = q.marks;
        rawScore    += q.marks;
      } else {
        incorrectCount++;
        if (session.negativeMarking) {
          marksAwarded  = -(q.negativeMark || 0);
          negativeScore += q.negativeMark || 0;
        }
      }

      gradedAnswers.push({
        questionId     : q._id,
        selectedOption : selected,
        correctAnswer  : q.correctAnswer,
        isCorrect      : selected ? isCorrect : false,
        marksAwarded,
        timeSpent      : submitted?.timeSpent || 0,
      });
    }

    const totalMarks    = session.questions.reduce((s, q) => s + q.marks, 0);
    const marksObtained = Math.max(0, rawScore - negativeScore);
    const percentage    = totalMarks > 0 ? +((marksObtained / totalMarks) * 100).toFixed(2) : 0;
    const isPassed      = percentage >= (session.passingScore || 50);

    /* Build result */
    const submittedAt = new Date();
    const startTime   = startedAt ? new Date(startedAt) : new Date(submittedAt.getTime() - 60000);
    const timeTaken   = Math.round((submittedAt - startTime) / 1000);

    const resultDoc = new Result({
      student         : req.user._id,
      session         : sessionId,
      mcqBank         : session.mcqBank,
      answers         : gradedAnswers,
      totalQuestions  : session.questions.length,
      attemptedCount  : correctCount + incorrectCount,
      correctCount,
      incorrectCount,
      skippedCount,
      rawScore,
      negativeScore,
      totalMarks,
      marksObtained,
      percentage,
      isPassed,
      startedAt       : startTime,
      submittedAt,
      timeTaken,
      tabSwitches     : tabSwitches || 0,
      attemptNumber,
      isFinalized     : true,
    });

    /* Compute and attach SHA256 hash */
    resultDoc.generateHash();

    await resultDoc.save({ session: dbSession });

    /* Mark student as submitted in session */
    await Session.findByIdAndUpdate(
      sessionId,
      { $addToSet: { submittedStudents: req.user._id } },
      { session: dbSession }
    );

    /* Update student CGPA */
    await updateStudentCGPA(req.user._id, dbSession);

    await dbSession.commitTransaction();

    /* Async: store hash on blockchain (non-blocking) */
    storeOnBlockchain(resultDoc).catch(err =>
      logger.error(`Blockchain store error: ${err.message}`)
    );

    /* Emit result event to teacher via Socket.io */
    const io = req.app.get('io');
    if (io) {
      io.to(sessionId).emit('exam:studentSubmitted', {
        userId     : req.user._id,
        studentName: req.user.fullName,
        percentage,
        isPassed,
        submittedAt,
      });
    }

    logger.info(`Exam submitted: user=${req.user._id} session=${sessionId} score=${percentage}%`);

    res.json({
      success : true,
      message : 'Exam submitted successfully.',
      result  : {
        _id            : resultDoc._id,
        marksObtained,
        totalMarks,
        percentage,
        grade          : resultDoc.grade,
        isPassed,
        correctCount,
        incorrectCount,
        skippedCount,
        timeTaken,
        resultHash     : resultDoc.resultHash,
      },
    });
  } catch (err) {
    await dbSession.abortTransaction();
    logger.error(`Submit exam error: ${err.message}`);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Duplicate submission detected.' });
    }
    res.status(500).json({ success: false, message: 'Failed to submit exam.' });
  } finally {
    dbSession.endSession();
  }
};

/* ─── GET MY RESULTS ──────────────────────────────────────────────── */
exports.getMyResults = async (req, res) => {
  try {
    const { page = 1, limit = 10, sessionId } = req.query;
    const filter = { student: req.user._id, isFinalized: true };
    if (sessionId) filter.session = sessionId;

    const results = await Result.find(filter)
      .populate('session', 'title scheduledStart durationMinutes')
      .select('-answers')
      .sort('-submittedAt')
      .limit(parseInt(limit))
      .skip((parseInt(page) - 1) * parseInt(limit));

    const total = await Result.countDocuments(filter);

    res.json({
      success    : true,
      data       : results,
      pagination : { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch results.' });
  }
};

/* ─── GET SINGLE RESULT DETAIL ────────────────────────────────────── */
exports.getResultDetail = async (req, res) => {
  try {
    const result = await Result.findOne({
      _id     : req.params.resultId,
      student : req.user._id,
    }).populate('session', 'title settings questions');

    if (!result) return res.status(404).json({ success: false, message: 'Result not found.' });

    /* Only show answers if session settings allow */
    const showAnswers = result.session?.settings?.showAnswers;

    res.json({
      success : true,
      data    : {
        ...result.toJSON(),
        answers: showAnswers ? result.answers : undefined,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch result.' });
  }
};

/* ─── GET CGPA ────────────────────────────────────────────────────── */
exports.getCGPA = async (req, res) => {
  try {
    const cgpaData = await computeCGPA(req.user._id);
    res.json({ success: true, data: cgpaData });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to compute CGPA.' });
  }
};

/* ─── VERIFY CERTIFICATE ─────────────────────────────────────────── */
exports.verifyCertificate = async (req, res) => {
  try {
    const { resultHash, resultId } = req.body;

    const result = await Result.findOne(
      resultId ? { _id: resultId, student: req.user._id } : { resultHash }
    ).populate('student', 'fullName studentId')
     .populate('session', 'title scheduledStart');

    if (!result) {
      return res.status(404).json({ success: false, message: 'Result/Certificate not found.' });
    }

    /* Local hash integrity check */
    const recomputedHash  = Result.computeHash(result);
    const localIntact     = recomputedHash === result.resultHash;

    /* Blockchain verification */
    let blockchainVerified = false;
    let blockchainData     = null;

    if (result.blockchainTxHash) {
      try {
        blockchainData     = await verifyResultOnBlockchain(result.resultHash);
        blockchainVerified = blockchainData.verified;
      } catch (bcErr) {
        logger.warn(`Blockchain verification failed: ${bcErr.message}`);
      }
    }

    res.json({
      success    : true,
      data       : {
        verified         : localIntact && (result.blockchainTxHash ? blockchainVerified : true),
        localIntact,
        blockchainVerified,
        blockchainTxHash : result.blockchainTxHash,
        blockchainData,
        result : {
          student        : result.student,
          session        : result.session,
          marksObtained  : result.marksObtained,
          totalMarks     : result.totalMarks,
          percentage     : result.percentage,
          grade          : result.grade,
          isPassed       : result.isPassed,
          submittedAt    : result.submittedAt,
          resultHash     : result.resultHash,
        },
      },
    });
  } catch (err) {
    logger.error(`Verify certificate error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Verification failed.' });
  }
};

/* ─── GET NOTIFICATIONS ───────────────────────────────────────────── */
exports.getNotifications = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('notifications');
    res.json({
      success : true,
      data    : user.notifications.sort((a, b) => b.createdAt - a.createdAt),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch notifications.' });
  }
};

exports.markNotificationsRead = async (req, res) => {
  try {
    await User.updateOne(
      { _id: req.user._id },
      { $set: { 'notifications.$[].read': true } }
    );
    res.json({ success: true, message: 'Notifications marked as read.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to update notifications.' });
  }
};

/* ─── Helpers ─────────────────────────────────────────────────────── */
async function computeCGPA(studentId) {
  const results = await Result.find({ student: studentId, isFinalized: true, isPassed: true });
  if (!results.length) return { cgpa: 0, gradePoints: [], totalCredits: 0 };

  const gradeMap = { 'A+': 4.0, 'A': 4.0, 'B': 3.0, 'C': 2.0, 'D': 1.0, 'F': 0.0 };
  let totalPoints = 0, totalCredits = 0;
  const gradePoints = results.map(r => {
    const gp = gradeMap[r.grade] || 0;
    totalPoints  += gp;
    totalCredits += 1;
    return { grade: r.grade, gp };
  });

  const cgpa = totalCredits > 0 ? +(totalPoints / totalCredits).toFixed(2) : 0;

  /* Update user's CGPA */
  await User.findByIdAndUpdate(studentId, { cgpa });

  return { cgpa, gradePoints, totalCredits };
}

async function updateStudentCGPA(studentId, session) {
  const data = await computeCGPA(studentId);
  await User.findByIdAndUpdate(studentId, { cgpa: data.cgpa }, { session });
}

async function storeOnBlockchain(resultDoc) {
  const { storeResultHash } = require('../services/blockchain/blockchainService');
  try {
    const txData = await storeResultHash(resultDoc.resultHash, resultDoc._id.toString());
    if (txData?.txHash) {
      await Result.findByIdAndUpdate(resultDoc._id, {
        blockchainTxHash   : txData.txHash,
        blockchainVerified : true,
        blockchainTimestamp: new Date(),
        blockchainNetwork  : process.env.BLOCKCHAIN_NETWORK,
        certificateIssued  : true,
        certificateIssuedAt: new Date(),
      });
      logger.info(`Blockchain: result ${resultDoc._id} stored at tx ${txData.txHash}`);
    }
  } catch (err) {
    logger.error(`storeOnBlockchain failed: ${err.message}`);
  }
}