const User = require('../models/User');
const jwt = require('jsonwebtoken');

exports.register = async (req, res) => {
  try {
    const { name, email, password, role, courseId, division } = req.body;
    const user = await User.create({ name, email, password, role, courseId, division });
    
    const accessToken = jwt.sign({ id: user._id, role: user.role, schoolId: user.schoolId }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.status(201).json({ 
      success: true, 
      accessToken, 
      user: { id: user._id, name: user.name, role: user.role } 
    });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(400).json({ success: false, message: 'This email address is already registered.' });
    }
    res.status(400).json({ success: false, message: err.message });
  }
};

exports.login = async (req, res) => {
  try {
    const { email, password, requiredRole, schoolId } = req.body;
    const user = await User.findOne({ email });
    if (!user || !(await user.comparePassword(password))) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (requiredRole && user.role !== requiredRole) {
      return res.status(403).json({ 
        success: false, 
        message: 'Unauthorized access: You do not have the required role to log in through this portal.' 
      });
    }

    // Strict account active check
    if (user.isActive === false) {
      return res.status(403).json({
        success: false,
        message: 'Your account is suspended. Please contact the administrator.'
      });
    }

    // Enforce strict school validations for non-super admins
    if (user.role !== 'super_admin') {
      if (!user.schoolId) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Your account is not associated with any school.'
        });
      }

      const School = require('../models/School');
      const school = await School.findById(user.schoolId);
      if (!school || school.is_active === false) {
        return res.status(403).json({
          success: false,
          message: 'Access denied: Your institution is currently suspended or inactive.'
        });
      }

      // If logging in through school admin portal, verify selected school matches
      if (user.role === 'school_admin') {
        if (!schoolId) {
          return res.status(400).json({
            success: false,
            message: 'Institution selection is required.'
          });
        }
        if (String(user.schoolId) !== String(schoolId)) {
          return res.status(403).json({
            success: false,
            message: 'Access denied: Your credentials do not belong to the selected institution.'
          });
        }
      }
    }

    const accessToken = jwt.sign({ 
      id: user._id, 
      role: user.role,
      schoolId: user.schoolId,
      courseId: user.courseId,
      courseIds: user.courseIds,
      division: user.division
    }, process.env.JWT_SECRET, { expiresIn: '1d' });
    res.json({ 
      success: true, 
      accessToken, 
      user: { id: user._id, name: user.name, role: user.role } 
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};