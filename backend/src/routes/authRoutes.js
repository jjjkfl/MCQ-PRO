/**
 * src/routes/authRoutes.js
 * Authentication endpoints
 */

const router = require('express').Router();
const { body } = require('express-validator');
const {
  register,
  login,
  refreshToken,
  logout,
  getProfile,
  updateProfile,
  changePassword,
} = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');

/* ─── Validators ──────────────────────────────────────────────────── */
const registerValidators = [
  body('firstName').trim().notEmpty().withMessage('First name is required').isLength({ max: 50 }),
  body('lastName' ).trim().notEmpty().withMessage('Last name is required' ).isLength({ max: 50 }),
  body('email'    ).isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password' ).isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
                   .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
                   .withMessage('Password must contain uppercase, lowercase, and a number'),
  body('role').optional().isIn(['student', 'teacher']).withMessage('Invalid role'),
];

const loginValidators = [
  body('email'   ).isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').notEmpty().withMessage('Password is required'),
];

/* ─── Public Routes ───────────────────────────────────────────────── */
router.post('/register', registerValidators, register);
router.post('/login',    loginValidators,    login);
router.post('/refresh',  refreshToken);

/* ─── Protected Routes ────────────────────────────────────────────── */
router.use(authMiddleware);

router.get ('/profile',         getProfile);
router.put ('/profile',         updateProfile);
router.post('/logout',          logout);
router.post('/change-password',
  [
    body('currentPassword').notEmpty(),
    body('newPassword').isLength({ min: 8 })
                       .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/)
                       .withMessage('New password too weak'),
  ],
  changePassword
);

module.exports = router;