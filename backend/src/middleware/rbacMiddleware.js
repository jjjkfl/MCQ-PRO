/**
 * src/middleware/rbacMiddleware.js
 * Role-Based Access Control middleware
 */

const logger = require('../utils/logger');

/**
 * Restrict access to specific roles
 * Usage: rbac('teacher', 'admin')
 */
const rbac = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      logger.warn(
        `RBAC denial: user=${req.user._id} role=${req.user.role} tried to access ${req.method} ${req.originalUrl}`
      );
      return res.status(403).json({
        success : false,
        message : `Access denied. Required role(s): ${allowedRoles.join(', ')}. Your role: ${req.user.role}.`,
        code    : 'INSUFFICIENT_PERMISSIONS',
      });
    }

    next();
  };
};

/**
 * Ownership check — ensures the requesting user owns the resource
 * or has an elevated role
 * Usage: checkOwnership('teacher', 'admin') — teacher/admin bypass ownership
 */
const checkOwnership = (...bypassRoles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'Not authenticated.' });
    }

    /* Bypass roles can access any resource */
    if (bypassRoles.includes(req.user.role)) return next();

    /* For others, ensure they match the target userId param */
    const targetId = req.params.userId || req.params.id;
    if (req.user._id.toString() !== targetId) {
      return res.status(403).json({
        success : false,
        message : 'You can only access your own resources.',
        code    : 'OWNERSHIP_VIOLATION',
      });
    }

    next();
  };
};

/**
 * Self-or-admin — student can access their own, admin/teacher can access all
 */
const selfOrAdmin = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Not authenticated.' });
  const targetId = req.params.userId || req.params.id;
  if (req.user.role === 'admin' || req.user.role === 'teacher') return next();
  if (req.user._id.toString() === targetId) return next();
  return res.status(403).json({ success: false, message: 'Access denied.', code: 'INSUFFICIENT_PERMISSIONS' });
};

module.exports = { rbac, checkOwnership, selfOrAdmin };