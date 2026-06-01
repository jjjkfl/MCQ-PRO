const router = require('express').Router();
const superAdminCtrl = require('../controllers/superAdminController');
const schoolAdminCtrl = require('../controllers/schoolAdminController');
const permissionsCtrl = require('../controllers/permissionsController');
const { authorize } = require('../middleware/roleMiddleware');
const multer = require('multer');
const upload = multer({ dest: 'uploads/' });

const { wafGuard, zeroTrustAssessor } = require('../middleware/securityEngine');
router.use(wafGuard);
router.use(zeroTrustAssessor);


// Permissions Routes
router.get('/permissions', authorize('super_admin'), permissionsCtrl.getAllPermissions);
router.put('/permissions', authorize('super_admin'), permissionsCtrl.updatePermissions);
router.get('/my-permissions', authorize(['super_admin','school_admin','teacher','student']), permissionsCtrl.getMyPermissions);

// Super Admin Routes
router.get('/super/schools', authorize('super_admin'), superAdminCtrl.getAllSchools);
router.post('/super/schools', authorize('super_admin'), superAdminCtrl.registerSchool);
router.put('/super/schools/:id', authorize('super_admin'), superAdminCtrl.updateSchool);
router.delete('/super/schools/:id', authorize('super_admin'), superAdminCtrl.deleteSchool);
router.post('/super/schools/:id/approve', authorize('super_admin'), superAdminCtrl.approveSchool);
router.post('/super/schools/:id/suspend', authorize('super_admin'), superAdminCtrl.suspendSchool);
router.get('/super/users', authorize('super_admin'), superAdminCtrl.getAllUsers);
router.post('/super/users', authorize('super_admin'), superAdminCtrl.createUser);
router.put('/super/users/:id', authorize('super_admin'), superAdminCtrl.updateUser);
router.delete('/super/users/:id', authorize('super_admin'), superAdminCtrl.deleteUser);
router.put('/super/users/:id/block', authorize('super_admin'), superAdminCtrl.blockUser);
router.get('/super/analytics', authorize('super_admin'), superAdminCtrl.getAnalytics);
router.get('/super/live-exams', authorize('super_admin'), superAdminCtrl.getGlobalLiveExams);
router.get('/super/schools/:id/teachers', authorize('super_admin'), superAdminCtrl.getSchoolTeachers);
router.get('/super/schools/:id/students', authorize('super_admin'), superAdminCtrl.getSchoolStudents);
router.get('/super/schools/:id/exams', authorize('super_admin'), superAdminCtrl.getSchoolExams);
router.get('/super/plans', authorize('super_admin'), superAdminCtrl.getPlans);
router.post('/super/plans', authorize('super_admin'), superAdminCtrl.createPlan);
router.put('/super/plans/:id', authorize('super_admin'), superAdminCtrl.updatePlan);
router.delete('/super/plans/:id', authorize('super_admin'), superAdminCtrl.deletePlan);

// School Admin Routes
router.get('/school/students', authorize('school_admin'), schoolAdminCtrl.getStudents);
router.post('/school/students', authorize('school_admin'), upload.fields([{ name: 'cameraPhoto', maxCount: 1 }, { name: 'aadharCard', maxCount: 1 }]), schoolAdminCtrl.createStudent);
router.patch('/school/students/:id', authorize('school_admin'), upload.fields([{ name: 'cameraPhoto', maxCount: 1 }, { name: 'aadharCard', maxCount: 1 }]), schoolAdminCtrl.updateUser);
router.get('/school/teachers', authorize('school_admin'), schoolAdminCtrl.getTeachers);
router.post('/school/teachers', authorize('school_admin'), upload.fields([{ name: 'cameraPhoto', maxCount: 1 }, { name: 'aadharCard', maxCount: 1 }]), schoolAdminCtrl.createTeacher);
router.patch('/school/teachers/:id', authorize('school_admin'), upload.fields([{ name: 'cameraPhoto', maxCount: 1 }, { name: 'aadharCard', maxCount: 1 }]), schoolAdminCtrl.updateUser);
router.get('/school/exams', authorize('school_admin'), schoolAdminCtrl.getExams);
router.post('/school/certificates', authorize('school_admin'), schoolAdminCtrl.generateCertificate);
router.get('/school/dashboard', authorize('school_admin'), schoolAdminCtrl.getDashboardStats);
router.get('/school/live-exams', authorize('school_admin'), schoolAdminCtrl.getSchoolLiveExams);
router.get('/school/results', authorize('school_admin'), schoolAdminCtrl.getSchoolResults);
router.get('/school/materials', authorize('school_admin'), schoolAdminCtrl.getSchoolMaterials);
router.delete('/school/materials/:id', authorize('school_admin'), schoolAdminCtrl.deleteSchoolMaterial);

// Broadcasts
router.post('/school/broadcasts', authorize('school_admin'), schoolAdminCtrl.createBroadcast);
router.get('/school/broadcasts', authorize(['school_admin', 'teacher']), schoolAdminCtrl.getBroadcasts);

// Marks Upload
router.post('/school/marks/upload-excel', authorize('school_admin'), upload.single('file'), schoolAdminCtrl.uploadMarksExcel);

// Settings
router.get('/school/settings', authorize('school_admin'), schoolAdminCtrl.getSchoolSettings);
router.put('/school/settings', authorize('school_admin'), upload.single('logo'), schoolAdminCtrl.updateSchoolSettings);

module.exports = router;
