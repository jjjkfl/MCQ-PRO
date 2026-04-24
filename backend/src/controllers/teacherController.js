const Session = require('../models/Session');
const Result = require('../models/Result');
const User = require('../models/User');

// Global mock state for real-time simulation
let mockActiveSubmissions = 12;
let mockTotalSubmissions = 342;
let mockBanks = [
  { _id: 'bank_001', title: 'Anatomy Basics', subject: 'General Surgery', questions: new Array(50).fill({}) },
  { _id: 'bank_002', title: 'Advanced Pathology', subject: 'Pathology', questions: new Array(120).fill({}) },
  { _id: 'bank_003', title: 'Surgical Instruments', subject: 'Practical', questions: new Array(35).fill({}) },
  { _id: 'bank_004', title: 'Patient Care Ethics', subject: 'Ethics', questions: new Array(25).fill({}) },
  { _id: 'bank_005', title: 'Pharmacology 101', subject: 'Pharmacy', questions: new Array(80).fill({}) }
];

let mockSessions = [
  { _id: 'sess_001', title: 'Midterm Evaluation: Anatomy', division: 'A', startTime: new Date(Date.now() - 3600000), duration: 60, status: 'active', submissions: mockActiveSubmissions },
  { _id: 'sess_002', title: 'Quiz: General Surgery', division: 'B', startTime: new Date(Date.now() - 86400000), duration: 30, status: 'completed', submissions: 24 },
  { _id: 'sess_003', title: 'Finals: Pathophysiology', division: 'C', startTime: new Date(Date.now() + 172800000), duration: 120, status: 'upcoming', submissions: 0 },
  { _id: 'sess_004', title: 'Pop Quiz: Anesthesia', division: 'A', startTime: new Date(Date.now() - 172800000), duration: 15, status: 'completed', submissions: 22 },
  { _id: 'sess_005', title: 'Mock Exam: Board Prep', division: 'D', startTime: new Date(Date.now() - 259200000), duration: 180, status: 'completed', submissions: 25 }
];

setInterval(() => {
  mockActiveSubmissions += Math.floor(Math.random() * 3);
  mockTotalSubmissions += Math.floor(Math.random() * 2);
}, 5000);

exports.getDashboard = async (req, res) => {
  try {
    const teacher = req.user;
    
    // Create rich mock results
    const recentResults = [
      { _id: 'res_001', studentName: 'Alice Johnson', examTitle: 'Quiz: General Surgery', score: 92, submittedAt: new Date(Date.now() - 50000) },
      { _id: 'res_002', studentName: 'Michael Chang', examTitle: 'Midterm Evaluation: Anatomy', score: 85, submittedAt: new Date(Date.now() - 120000) },
      { _id: 'res_003', studentName: 'Sarah Davis', examTitle: 'Midterm Evaluation: Anatomy', score: 78, submittedAt: new Date(Date.now() - 360000) },
      { _id: 'res_004', studentName: 'David Kim', examTitle: 'Pop Quiz: Anesthesia', score: 45, submittedAt: new Date(Date.now() - 400000) },
      { _id: 'res_005', studentName: 'Emma Wilson', examTitle: 'Quiz: General Surgery', score: 88, submittedAt: new Date(Date.now() - 800000) }
    ];

    res.json({
      success: true,
      data: {
        stats: {
          activeSessions: 1,
          totalSessions: 14,
          totalStudents: 32,
          totalMCQBanks: mockBanks.length
        },
        recentSessions: mockSessions,
        recentResults
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.createSession = async (req, res) => {
  try {
    const { title, scheduledStart, durationMinutes, mcqBankId, division } = req.body;
    
    // Fallback to empty array if bank not found
    let questions = [];
    if (mcqBankId) {
      const bank = mockBanks.find(b => b._id === mcqBankId);
      if (bank && bank.questions) {
        questions = bank.questions;
      }
    }

    const session = await Session.create({
      title,
      division: division || 'A', // Fallback to 'A' if not provided
      questions: questions,
      startTime: new Date(scheduledStart),
      duration: durationMinutes,
      courseId: req.user.courseId
    });

    // Also push to mock sessions for real-time frontend updates
    mockSessions.unshift({
      _id: session._id,
      title: session.title,
      division: session.division,
      startTime: session.startTime,
      duration: session.duration,
      status: 'upcoming',
      submissions: 0
    });

    res.status(201).json({ success: true, data: session });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.getSessions = async (req, res) => {
  try {
    const sessions = await Session.find({ courseId: req.user.courseId }).sort('-createdAt');
    res.json({ success: true, data: sessions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.updateSessionStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const session = await Session.findOneAndUpdate(
      { _id: req.params.sessionId, courseId: req.user.courseId },
      { status },
      { new: true }
    );
    res.json({ success: true, data: session });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getStudents = async (req, res) => {
  try {
    const students = await User.find({ courseId: req.user.courseId, role: 'student' }).select('-password');
    res.json({ success: true, data: students });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getGeneralAnalytics = async (req, res) => {
  try {
    res.json({ 
      success: true, 
      data: { 
        totalSubmissions: mockTotalSubmissions, 
        avgScore: 76, 
        passRate: 82, 
        gradeBreakdown: { A: 45, B: 120, C: 110, D: 42, F: 25 } 
      } 
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getSessionResults = async (req, res) => {
  try {
    const results = await Result.find({ sessionId: req.params.sessionId }).populate('studentId', 'name email');
    res.json({ success: true, data: { results, stats: { total: results.length } } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.getMCQBanks = async (req, res) => {
  try {
    res.json({ success: true, data: mockBanks });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

exports.uploadMCQ = async (req, res) => {
  try {
    const { title, subject, numQuestions } = req.body;
    
    // Create mock questions to satisfy the frontend UI
    const questions = [];
    const count = numQuestions || 5;
    
    for (let i = 0; i < count; i++) {
      questions.push({
        questionText: `Mock Question ${i + 1} extracted from the document for ${subject}?`,
        options: [
          { label: 'A', text: 'Option A for this question' },
          { label: 'B', text: 'Option B for this question' },
          { label: 'C', text: 'Option C for this question' },
          { label: 'D', text: 'Option D for this question' }
        ],
        correctAnswer: ['A', 'B', 'C', 'D'][Math.floor(Math.random() * 4)],
        marks: 1
      });
    }

    const newBank = {
      _id: 'bank_' + Math.random().toString(36).substring(7),
      title: title || 'Extracted Document',
      subject: subject || 'General',
      questions: questions,
      meta: { model: 'Mock Extractor' }
    };

    // Add to global mock state so it appears in the grid!
    mockBanks.unshift(newBank);
    
    res.json({
      success: true,
      data: {
        title: newBank.title,
        questionCount: count,
        questions,
        meta: newBank.meta
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};