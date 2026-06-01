require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../src/models/User');

async function queryTeachers() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB successfully!');
    const teachers = await User.find({ role: 'teacher' });
    console.log(`Found ${teachers.length} teachers:`);
    console.log(JSON.stringify(teachers, null, 2));
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

queryTeachers();
