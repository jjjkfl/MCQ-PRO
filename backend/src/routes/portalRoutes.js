const router = require('express').Router();
const { authMiddleware } = require('../middleware/authMiddleware');
const { rbac } = require('../middleware/rbacMiddleware');
const studentCtrl = require('../controllers/studentController');
const teacherCtrl = require('../controllers/teacherController');
const adminCtrl = require('../controllers/adminController');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });
router.use(authMiddleware);

// ══════════════════════════════════════════════════════════════════
// ADMIN PORTAL ROUTES (/api/portal/admin/*)
// ══════════════════════════════════════════════════════════════════
router.get('/portal/admin/dashboard', rbac(['admin']), adminCtrl.getDashboard);

router.get('/portal/admin/users',       rbac(['admin']), adminCtrl.getUsers);
router.post('/portal/admin/users',      rbac(['admin']), adminCtrl.createUser);
router.put('/portal/admin/users/:id',   rbac(['admin']), adminCtrl.updateUser);
router.delete('/portal/admin/users/:id',rbac(['admin']), adminCtrl.deleteUser);

router.get('/portal/admin/courses',       rbac(['admin']), adminCtrl.getCourses);
router.post('/portal/admin/courses',      rbac(['admin']), adminCtrl.createCourse);
router.put('/portal/admin/courses/:id',   rbac(['admin']), adminCtrl.updateCourse);
router.delete('/portal/admin/courses/:id',rbac(['admin']), adminCtrl.deleteCourse);

// ══════════════════════════════════════════════════════════════════
// TEACHER PORTAL ROUTES (/api/portal/teacher/*)
// ══════════════════════════════════════════════════════════════════
router.get('/portal/teacher/dashboard', rbac(['teacher']), teacherCtrl.getDashboard);
router.get('/portal/teacher/students',  rbac(['teacher']), teacherCtrl.getStudents);
router.get('/portal/teacher/analytics', rbac(['teacher']), teacherCtrl.getGeneralAnalytics);

// MCQ / Session Management
router.get ('/portal/teacher/mcq',                        rbac(['teacher']), teacherCtrl.getMCQBanks);
router.post('/portal/teacher/mcq/upload',                 rbac(['teacher']), upload.single('pdf'), teacherCtrl.uploadMCQ);
router.delete('/portal/teacher/mcq/:id',                  rbac(['teacher']), teacherCtrl.deleteMCQBank);

router.post('/portal/teacher/sessions',                   rbac(['teacher']), teacherCtrl.createSession);
router.get ('/portal/teacher/sessions',                   rbac(['teacher']), teacherCtrl.getSessions);
router.put ('/portal/teacher/sessions/:id',               rbac(['teacher']), teacherCtrl.updateSession);
router.delete('/portal/teacher/sessions/:id',             rbac(['teacher']), teacherCtrl.deleteSession);
router.patch('/portal/teacher/sessions/:sessionId/status', rbac(['teacher']), teacherCtrl.updateSessionStatus);
router.get ('/portal/teacher/sessions/:sessionId/results', rbac(['teacher']), teacherCtrl.getSessionResults);

// ══════════════════════════════════════════════════════════════════
// STUDENT PORTAL ROUTES (/api/portal/student/*)
// ══════════════════════════════════════════════════════════════════
router.get ('/portal/student/dashboard',        rbac(['student']), studentCtrl.getDashboard);
router.get ('/portal/student/exams',            rbac(['student']), studentCtrl.getAvailableExams);
router.get ('/portal/student/exams/:sessionId', rbac(['student']), studentCtrl.getExamQuestions);
router.post('/portal/student/exams/submit',     rbac(['student']), studentCtrl.submitExam);
router.get ('/portal/student/results',          rbac(['student']), studentCtrl.getMyResults);

module.exports = router;