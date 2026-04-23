/**
 * src/routes/portalRoutes.js
 * Student and Teacher portal API routes
 */

const router  = require('express').Router();
const { authMiddleware }    = require('../middleware/authMiddleware');
const { rbac }              = require('../middleware/rbacMiddleware');

const studentCtrl = require('../controllers/studentController');
const teacherCtrl = require('../controllers/teacherController');

const { blockchainHealthCheck, getBlockchainStats, verifyResultOnBlockchain } =
  require('../services/blockchain/blockchainService');

/* ─── All routes require authentication ───────────────────────────── */
router.use(authMiddleware);

/* ══════════════════════════════════════════════════════════════════
   STUDENT ROUTES  (/api/portal/student/*)
   ══════════════════════════════════════════════════════════════════ */
router.get('/student/dashboard',          rbac('student'), studentCtrl.getDashboard);
router.get('/student/exams',              rbac('student'), studentCtrl.getAvailableExams);
router.post('/student/exams/join',        rbac('student'), studentCtrl.joinExamByCode);
router.get('/student/exams/:sessionId',   rbac('student'), studentCtrl.getExamQuestions);
router.post('/student/exams/submit',      rbac('student'), studentCtrl.submitExam);
router.get('/student/results',            rbac('student'), studentCtrl.getMyResults);
router.get('/student/results/:resultId',  rbac('student'), studentCtrl.getResultDetail);
router.get('/student/cgpa',               rbac('student'), studentCtrl.getCGPA);
router.post('/student/verify',            rbac('student'), studentCtrl.verifyCertificate);
router.get('/student/notifications',      rbac('student'), studentCtrl.getNotifications);
router.patch('/student/notifications/read', rbac('student'), studentCtrl.markNotificationsRead);

/* ══════════════════════════════════════════════════════════════════
   TEACHER ROUTES  (/api/portal/teacher/*)
   ══════════════════════════════════════════════════════════════════ */
router.get('/teacher/dashboard', rbac('teacher', 'admin'), teacherCtrl.getDashboard);

/* MCQ Bank */
router.post('/teacher/mcq/upload',
  rbac('teacher', 'admin'),
  teacherCtrl.uploadPDFMiddleware,
  teacherCtrl.uploadPDF
);
router.get ('/teacher/mcq',              rbac('teacher', 'admin'), teacherCtrl.getMCQBanks);
router.get ('/teacher/mcq/:bankId',      rbac('teacher', 'admin'), teacherCtrl.getMCQBankDetail);
router.put ('/teacher/mcq/:bankId',      rbac('teacher', 'admin'), teacherCtrl.updateMCQBank);
router.delete('/teacher/mcq/:bankId',   rbac('teacher', 'admin'), teacherCtrl.deleteMCQBank);

/* Sessions / Exams */
router.post('/teacher/sessions',                   rbac('teacher', 'admin'), teacherCtrl.createSession);
router.get ('/teacher/sessions',                   rbac('teacher', 'admin'), teacherCtrl.getSessions);
router.get ('/teacher/sessions/:sessionId',        rbac('teacher', 'admin'), teacherCtrl.getSessionDetail);
router.patch('/teacher/sessions/:sessionId/status',rbac('teacher', 'admin'), teacherCtrl.updateSessionStatus);
router.get ('/teacher/sessions/:sessionId/results',rbac('teacher', 'admin'), teacherCtrl.getSessionResults);
router.get ('/teacher/sessions/:sessionId/monitor',rbac('teacher', 'admin'), teacherCtrl.getLiveMonitoring);

/* Students */
router.get('/teacher/students',           rbac('teacher', 'admin'), teacherCtrl.getAllStudents);
router.get('/teacher/students/:studentId',rbac('teacher', 'admin'), teacherCtrl.getStudentDetail);

/* ══════════════════════════════════════════════════════════════════
   SHARED / BLOCKCHAIN ROUTES  (/api/portal/blockchain/*)
   ══════════════════════════════════════════════════════════════════ */
router.get('/blockchain/health', async (_req, res) => {
  const status = await blockchainHealthCheck();
  res.json({ success: true, data: status });
});

router.get('/blockchain/stats', rbac('teacher', 'admin'), async (_req, res) => {
  try {
    const stats = await getBlockchainStats();
    res.json({ success: true, data: stats });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post('/blockchain/verify', async (req, res) => {
  try {
    const { resultHash } = req.body;
    if (!resultHash) return res.status(400).json({ success: false, message: 'resultHash required.' });
    const data = await verifyResultOnBlockchain(resultHash);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

module.exports = router;