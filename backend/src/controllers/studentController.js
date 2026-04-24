const Session = require('../models/Session');
const Result = require('../models/Result');
const User = require('../models/User');

exports.getDashboard = async (req, res) => {
  try {
    const student = req.user;
    
    // Fetch upcoming exams for this student's course and division
    const upcomingExams = await Session.find({
      courseId: student.courseId,
      division: student.division,
      startTime: { $gte: new Date(Date.now() - 3600000) } // Recently started or upcoming
    }).limit(5);

    // Fetch recent results
    const recentResults = await Result.find({ studentId: student._id })
      .populate('sessionId', 'title')
      .sort('-createdAt')
      .limit(3);

    const mappedResults = recentResults.map(r => ({
      _id: r._id,
      session: { title: r.sessionId ? r.sessionId.title : 'Exam' },
      percentage: r.score,
      submittedAt: r.createdAt
    }));

    res.json({
      success: true,
      data: {
        profile: {
          name: student.name,
          section: `Course ${student.courseId ? 'ID:' + student.courseId : 'N/A'} - Div ${student.division}`,
          gpa: 3.8, // Mock for now
          attendance: 92,
          sessionsLogged: 24,
          totalSessions: 30,
          rank: 5,
          totalPeers: 31,
          tasks: 4
        },
        subjectPerformance: [
          { subject: 'Surgery', score: 88 },
          { subject: 'Anatomy', score: 92 }
        ],
        tasks: [],
        recentResults: mappedResults,
        upcomingExams: upcomingExams.map(e => ({
          _id: e._id,
          title: e.title,
          durationMinutes: e.duration,
          scheduledStart: e.startTime
        }))
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getAvailableExams = async (req, res) => {
  try {
    const exams = await Session.find({
      courseId: req.user.courseId,
      division: req.user.division
    }).select('-questions.correctAnswer');
    res.json({ success: true, data: exams });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getExamQuestions = async (req, res) => {
  try {
    const exam = await Session.findOne({
      _id: req.params.sessionId,
      courseId: req.user.courseId,
      division: req.user.division
    }).select('-questions.correctAnswer');
    
    if (!exam) return res.status(404).json({ success: false, message: 'Exam not found or access denied' });
    res.json({ success: true, data: exam });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.submitExam = async (req, res) => {
  try {
    const { sessionId, answers } = req.body;
    const session = await Session.findById(sessionId);
    if (!session) return res.status(404).json({ message: 'Exam not found' });

    let correct = 0;
    session.questions.forEach((q, idx) => {
      if (answers[idx] === q.correctAnswer) correct++;
    });
    const score = (correct / session.questions.length) * 100;

    const result = await Result.create({
      studentId: req.user._id,
      courseId: session.courseId,
      sessionId: session._id,
      score: Math.round(score)
    });

    res.status(201).json({ success: true, data: result });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getMyResults = async (req, res) => {
  try {
    const results = await Result.find({ studentId: req.user._id }).populate('sessionId', 'title');
    res.json({ success: true, data: results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};