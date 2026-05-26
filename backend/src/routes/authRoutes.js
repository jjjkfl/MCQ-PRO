const router = require('express').Router();
const authCtrl = require('../controllers/authController');

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

module.exports = router;