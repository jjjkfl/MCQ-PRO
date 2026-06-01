const router = require('express').Router();
const authCtrl = require('../controllers/authController');
const { authMiddleware } = require('../middleware/authMiddleware');

router.post('/register', authCtrl.register);
router.post('/login', authCtrl.login);
router.get('/active-schools', async (req, res) => {
  try {
    const School = require('../models/School');
    const schools = await School.find({ is_active: { $ne: false } }, 'name _id');
    res.json(schools);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/my-school', authMiddleware, async (req, res) => {
  try {
    if (!req.user.schoolId) {
      return res.status(400).json({ message: 'No school associated with this user.' });
    }
    const School = require('../models/School');
    const school = await School.findById(req.user.schoolId, 'name branding');
    if (!school) {
      return res.status(404).json({ message: 'School not found.' });
    }
    res.json({
      name: school.name,
      logo: school.branding?.logo || '',
      branding: school.branding
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;