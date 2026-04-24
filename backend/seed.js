require('dotenv').config();
const mongoose = require('mongoose');
const User = require('./src/models/User');
const Course = require('./src/models/Course');

const seed = async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('Connected to DB...');

    // Clear existing
    await User.deleteMany({});
    await Course.deleteMany({});

    // Create 10 Teachers and Courses
    const courses = [];
    for (let i = 1; i <= 10; i++) {
      const teacher = await User.create({
        name: `Teacher ${i}`,
        email: `teacher${i}@exam.com`,
        password: 'password123',
        role: 'teacher'
      });

      const course = await Course.create({
        courseName: `Course ${i}`,
        teacherId: teacher._id
      });

      // Update teacher with courseId
      teacher.courseId = course._id;
      await teacher.save();
      courses.push(course);
    }

    // Create 15 Students
    const divisions = ['A', 'B', 'C', 'D'];
    for (let i = 1; i <= 15; i++) {
      const randomCourse = courses[Math.floor(Math.random() * courses.length)];
      const randomDiv = divisions[Math.floor(Math.random() * divisions.length)];

      await User.create({
        name: `Student ${i}`,
        email: `student${i}@exam.com`,
        password: 'password123',
        role: 'student',
        courseId: randomCourse._id,
        division: randomDiv
      });
    }

    console.log('✅ Seeded 10 Teachers, 10 Courses, and 15 Students.');
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

seed();
