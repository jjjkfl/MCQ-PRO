/**
 * src/controllers/authController.js
 * Registration, login, refresh, logout, profile
 */

const jwt    = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');

const User   = require('../models/User');
const logger = require('../utils/logger');

/* ─── Token Helpers ───────────────────────────────────────────────── */
const signAccessToken = (userId, role) =>
  jwt.sign({ id: userId, role }, process.env.JWT_SECRET, {
    expiresIn : process.env.JWT_EXPIRES_IN || '24h',
  });

const signRefreshToken = (userId) =>
  jwt.sign({ id: userId }, process.env.REFRESH_TOKEN_SECRET, { expiresIn: '7d' });

const sendTokenResponse = (user, statusCode, res, message = 'Success') => {
  const accessToken  = signAccessToken(user._id, user.role);
  const refreshToken = signRefreshToken(user._id);

  /* Store hashed refresh token in DB */
  const hashedRefresh = crypto.createHash('sha256').update(refreshToken).digest('hex');
  user.refreshToken   = hashedRefresh;
  user.save({ validateBeforeSave: false });

  const safeUser = {
    _id         : user._id,
    firstName   : user.firstName,
    lastName    : user.lastName,
    fullName    : user.fullName,
    email       : user.email,
    role        : user.role,
    studentId   : user.studentId,
    employeeId  : user.employeeId,
    program     : user.program,
    semester    : user.semester,
    cgpa        : user.cgpa,
    department  : user.department,
    designation : user.designation,
    isVerified  : user.isVerified,
    lastLogin   : user.lastLogin,
    createdAt   : user.createdAt,
  };

  res.status(statusCode).json({
    success      : true,
    message,
    accessToken,
    refreshToken,
    expiresIn    : process.env.JWT_EXPIRES_IN || '24h',
    user         : safeUser,
  });
};

/* ─── REGISTER ───────────────────────────────────────────────────── */
exports.register = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { firstName, lastName, email, password, role, program, semester, department, designation, phone } = req.body;

    /* Validate role */
    const allowedRoles = ['student', 'teacher'];
    if (role && !allowedRoles.includes(role)) {
      return res.status(400).json({ success: false, message: 'Invalid role.' });
    }

    /* Check duplicate */
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Email already registered.' });
    }

    /* Build user */
    const userData = { firstName, lastName, email, password, role: role || 'student' };
    if (phone)       userData.phone = phone;
    if (program)     userData.program = program;
    if (semester)    userData.semester = semester;
    if (department)  userData.department = department;
    if (designation) userData.designation = designation;

    const user = await User.create(userData);
    logger.info(`New user registered: ${user._id} (${user.role})`);

    sendTokenResponse(user, 201, res, 'Registration successful');
  } catch (err) {
    logger.error(`Register error: ${err.message}`);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'Email already in use.' });
    }
    res.status(500).json({ success: false, message: 'Registration failed.' });
  }
};

/* ─── LOGIN ──────────────────────────────────────────────────────── */
exports.login = async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ success: false, errors: errors.array() });
  }

  try {
    const { email, password } = req.body;

    /* Find user and include password */
    const user = await User.findByEmail(email);
    if (!user) {
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    /* Account lock check */
    if (user.isLocked) {
      return res.status(423).json({
        success: false,
        message: `Account locked. Try again after ${new Date(user.lockUntil).toLocaleString()}.`,
      });
    }

    /* Password match */
    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      await user.incLoginAttempts();
      return res.status(401).json({ success: false, message: 'Invalid email or password.' });
    }

    /* Active check */
    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'Account deactivated. Contact admin.' });
    }

    /* Success */
    await user.resetLoginAttempts();
    logger.info(`User logged in: ${user._id} (${user.role})`);
    sendTokenResponse(user, 200, res, 'Login successful');
  } catch (err) {
    logger.error(`Login error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Login failed.' });
  }
};

/* ─── REFRESH TOKEN ──────────────────────────────────────────────── */
exports.refreshToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'Refresh token required.' });
    }

    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
    } catch {
      return res.status(401).json({ success: false, message: 'Invalid or expired refresh token.' });
    }

    const hashedToken = crypto.createHash('sha256').update(refreshToken).digest('hex');
    const user        = await User.findOne({ _id: decoded.id, refreshToken: hashedToken });

    if (!user) {
      return res.status(401).json({ success: false, message: 'Refresh token not recognized.' });
    }

    const newAccessToken = signAccessToken(user._id, user.role);
    res.json({ success: true, accessToken: newAccessToken });
  } catch (err) {
    logger.error(`Refresh token error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Token refresh failed.' });
  }
};

/* ─── LOGOUT ─────────────────────────────────────────────────────── */
exports.logout = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.user._id, { refreshToken: null });
    res.json({ success: true, message: 'Logged out successfully.' });
  } catch (err) {
    logger.error(`Logout error: ${err.message}`);
    res.status(500).json({ success: false, message: 'Logout failed.' });
  }
};

/* ─── GET PROFILE ─────────────────────────────────────────────────── */
exports.getProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Failed to fetch profile.' });
  }
};

/* ─── UPDATE PROFILE ──────────────────────────────────────────────── */
exports.updateProfile = async (req, res) => {
  try {
    const allowed  = ['firstName', 'lastName', 'phone', 'address', 'program', 'semester', 'department'];
    const updates  = {};
    allowed.forEach(field => { if (req.body[field] !== undefined) updates[field] = req.body[field]; });

    const user = await User.findByIdAndUpdate(req.user._id, updates, {
      new              : true,
      runValidators    : true,
    });

    res.json({ success: true, message: 'Profile updated.', user });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Profile update failed.' });
  }
};

/* ─── CHANGE PASSWORD ─────────────────────────────────────────────── */
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect.' });
    }

    user.password = newPassword;
    await user.save();

    logger.info(`Password changed for user: ${user._id}`);
    res.json({ success: true, message: 'Password changed successfully.' });
  } catch (err) {
    res.status(500).json({ success: false, message: 'Password change failed.' });
  }
};