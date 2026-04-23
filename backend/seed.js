/**
 * backend/seed.js
 * Comprehensive seed script for the full ER-diagram schema.
 * Populates: School, SchoolClass, Section, Subject, User,
 *            TeacherAssignment, MCQChapter, MCQQuestion, Exam,
 *            ExamSecurityLog, MCQBank, Session, Result
 */

require('dotenv').config();
const mongoose = require('mongoose');

/* ─── Models ─────────────────────────────────────────────────────── */
const School            = require('./src/models/School');
const SchoolClass       = require('./src/models/SchoolClass');
const Section           = require('./src/models/Section');
const Subject           = require('./src/models/Subject');
const User              = require('./src/models/User');
const TeacherAssignment = require('./src/models/TeacherAssignment');
const MCQChapter        = require('./src/models/MCQChapter');
const MCQQuestion       = require('./src/models/MCQQuestion');
const Exam              = require('./src/models/Exam');
const ExamSecurityLog   = require('./src/models/ExamSecurityLog');
const MCQBank           = require('./src/models/MCQBank');
const Session           = require('./src/models/Session');
const Result            = require('./src/models/Result');

const mongoURI = process.env.MONGO_URI || 'mongodb://localhost:27017/surgical_exam_db';

const seedData = async () => {
  try {
    await mongoose.connect(mongoURI);
    console.log('✅ Connected to MongoDB for seeding...\n');

    /* ─── 1. Clear all collections ─────────────────────────────── */
    console.log('🗑️  Clearing existing data...');
    await Promise.all([
      School.deleteMany({}),
      SchoolClass.deleteMany({}),
      Section.deleteMany({}),
      Subject.deleteMany({}),
      User.deleteMany({}),
      TeacherAssignment.deleteMany({}),
      MCQChapter.deleteMany({}),
      MCQQuestion.deleteMany({}),
      Exam.deleteMany({}),
      ExamSecurityLog.deleteMany({}),
      MCQBank.deleteMany({}),
      Session.deleteMany({}),
      Result.deleteMany({}),
    ]);
    console.log('   Done.\n');

    /* ─── 2. School ────────────────────────────────────────────── */
    console.log('🏫 Creating School...');
    const school = await School.create({
      name: 'Surgical Academy of Medical Sciences',
      name_slug: 'surgical-academy',
      board_type: 'CBSE',
      subscription_plan: 'Premium',
      max_students_teachers: 500,
      is_active: true,
    });
    console.log(`   School: ${school.name} (${school._id})`);

    /* ─── 3. Classes ───────────────────────────────────────────── */
    console.log('📚 Creating Classes...');
    const class11 = await SchoolClass.create({
      school_id: school._id,
      name: 'Grade 11',
      display_name: 'Class XI',
      order: 1,
      is_active: true,
    });
    const class12 = await SchoolClass.create({
      school_id: school._id,
      name: 'Grade 12',
      display_name: 'Class XII',
      order: 2,
      is_active: true,
    });
    console.log(`   Classes: ${class11.display_name}, ${class12.display_name}`);

    /* ─── 4. Sections ──────────────────────────────────────────── */
    console.log('🔠 Creating Sections...');
    const sec11A = await Section.create({ school_id: school._id, class_id: class11._id, name: 'A', order: 1 });
    const sec11B = await Section.create({ school_id: school._id, class_id: class11._id, name: 'B', order: 2 });
    const sec12A = await Section.create({ school_id: school._id, class_id: class12._id, name: 'A', order: 1 });
    console.log(`   Sections: 11-A, 11-B, 12-A`);

    /* ─── 5. Subjects ──────────────────────────────────────────── */
    console.log('📖 Creating Subjects...');
    const anatomy = await Subject.create({
      school_id: school._id, name: 'Anatomy', code: 'ANAT101',
      subject_type: 'Both', applicable_classes: [class11._id, class12._id],
    });
    const surgery = await Subject.create({
      school_id: school._id, name: 'General Surgery', code: 'SURG201',
      subject_type: 'Both', applicable_classes: [class12._id],
    });
    const biology = await Subject.create({
      school_id: school._id, name: 'Biology & Genetics', code: 'BIO306',
      subject_type: 'Theory', applicable_classes: [class11._id, class12._id],
    });
    const mathematics = await Subject.create({
      school_id: school._id, name: 'Applied Mathematics', code: 'MAT302',
      subject_type: 'Theory', applicable_classes: [class11._id],
    });
    const english = await Subject.create({
      school_id: school._id, name: 'English Literature', code: 'ENG304',
      subject_type: 'Theory', applicable_classes: [class11._id, class12._id],
    });
    const cs = await Subject.create({
      school_id: school._id, name: 'Computer Science', code: 'CS305',
      subject_type: 'Practical', applicable_classes: [class11._id],
    });
    console.log(`   Subjects: Anatomy, Surgery, Biology, Mathematics, English, CS`);

    /* ─── 6. Users (Teacher + Students) ────────────────────────── */
    console.log('👤 Creating Users...');

    const teacher = await User.create({
      name: 'Dr. Sarah Wilson',
      email: 'teacher@surgical.com',
      password: 'password123',
      role: 'teacher',
      school_id: school._id,
      phone: '9876543210',
      enrollment_status: 'active',
    });

    const admin = await User.create({
      name: 'Admin User',
      email: 'admin@surgical.com',
      password: 'admin123',
      role: 'admin',
      school_id: school._id,
      enrollment_status: 'active',
    });

    const student1 = await User.create({
      name: 'Aarav Sharma',
      email: 'aarav@student.com',
      password: 'password123',
      role: 'student',
      school_id: school._id,
      phone: '9988776655',
      roll_number: 'SA-2024-001',
      enrollment_status: 'active',
      category: 'General',
      studentDetails: {
        section: 'Sec 11-A',
        attendance: 83,
        sessionsLogged: 25,
        totalSessions: 30,
        rank: 17,
        totalPeers: 31,
        gpa: 7.8,
      },
      tasks: [
        { title: 'Applied Mathematics', subjectCode: 'MAT302', deadline: new Date('2026-05-01'), priority: 'MED' },
        { title: 'Biology & Genetics', subjectCode: 'BIO306', deadline: new Date('2026-05-02'), priority: 'MED' },
        { title: 'Computer Science', subjectCode: 'CS305', deadline: new Date('2026-05-03'), priority: 'HIGH' },
        { title: 'English Literature', subjectCode: 'ENG304', deadline: new Date('2026-05-04'), priority: 'LOW' },
      ],
      subjectPerformance: [
        { subject: 'English', score: 81 },
        { subject: 'Anatomy', score: 85 },
        { subject: 'Mathematics', score: 80 },
        { subject: 'Biology', score: 80 },
        { subject: 'Surgery', score: 79 },
        { subject: 'Computer Science', score: 88 },
      ],
    });

    const student2 = await User.create({
      name: 'John Doe',
      email: 'john@student.com',
      password: 'password123',
      role: 'student',
      school_id: school._id,
      roll_number: 'SA-2024-002',
      enrollment_status: 'active',
      studentDetails: { gpa: 8.5 },
    });

    console.log(`   Teacher: ${teacher.name}`);
    console.log(`   Admin:   ${admin.name}`);
    console.log(`   Students: ${student1.name}, ${student2.name}`);

    /* ─── 7. Teacher Assignments ───────────────────────────────── */
    console.log('📋 Creating Teacher Assignments...');
    const ta1 = await TeacherAssignment.create({
      school_id: school._id,
      teacher_id: teacher._id,
      class_id: class11._id,
      section_id: sec11A._id,
      subject_id: anatomy._id,
      academic_year: '2025-26',
      assignment_type: 'Regular',
      is_primary_teacher: true,
    });
    const ta2 = await TeacherAssignment.create({
      school_id: school._id,
      teacher_id: teacher._id,
      class_id: class12._id,
      section_id: sec12A._id,
      subject_id: surgery._id,
      academic_year: '2025-26',
      assignment_type: 'Regular',
      is_primary_teacher: true,
    });
    console.log(`   Assignments: ${ta1._id}, ${ta2._id}`);

    /* ─── 8. MCQ Chapters ──────────────────────────────────────── */
    console.log('📂 Creating MCQ Chapters...');
    const ch1 = await MCQChapter.create({
      school_id: school._id,
      assignment_id: ta1._id,
      subject_id: anatomy._id,
      class_id: class11._id,
      name: 'Chapter 1: Introduction to Human Anatomy',
      description: 'Basics of human body systems and organ structures.',
      time_limit: 30,
    });
    const ch2 = await MCQChapter.create({
      school_id: school._id,
      assignment_id: ta2._id,
      subject_id: surgery._id,
      class_id: class12._id,
      name: 'Chapter 1: Surgical Instruments & Sterilization',
      description: 'Identify and classify common surgical instruments.',
      time_limit: 45,
    });
    console.log(`   Chapters: ${ch1.name}, ${ch2.name}`);

    /* ─── 9. MCQ Questions ─────────────────────────────────────── */
    console.log('❓ Creating MCQ Questions...');
    const questions = await MCQQuestion.insertMany([
      {
        chapter_id: ch1._id, school_id: school._id, subject_id: anatomy._id,
        question_text: 'Which is the largest organ in the human body?',
        difficulty: 'easy', marks: 1,
        options: [
          { option_text: 'Heart', option_order: 'a', is_correct: false },
          { option_text: 'Liver', option_order: 'b', is_correct: false },
          { option_text: 'Skin', option_order: 'c', is_correct: true },
          { option_text: 'Lungs', option_order: 'd', is_correct: false },
        ],
      },
      {
        chapter_id: ch1._id, school_id: school._id, subject_id: anatomy._id,
        question_text: 'How many bones are in the adult human body?',
        difficulty: 'easy', marks: 1,
        options: [
          { option_text: '206', option_order: 'a', is_correct: true },
          { option_text: '300', option_order: 'b', is_correct: false },
          { option_text: '180', option_order: 'c', is_correct: false },
          { option_text: '250', option_order: 'd', is_correct: false },
        ],
      },
      {
        chapter_id: ch1._id, school_id: school._id, subject_id: anatomy._id,
        question_text: 'The femur is located in which part of the body?',
        difficulty: 'medium', marks: 2,
        options: [
          { option_text: 'Arm', option_order: 'a', is_correct: false },
          { option_text: 'Thigh', option_order: 'b', is_correct: true },
          { option_text: 'Rib cage', option_order: 'c', is_correct: false },
          { option_text: 'Spine', option_order: 'd', is_correct: false },
        ],
      },
      {
        chapter_id: ch2._id, school_id: school._id, subject_id: surgery._id,
        question_text: 'What is the primary sterilization method for surgical instruments?',
        difficulty: 'easy', marks: 1,
        options: [
          { option_text: 'Dry Heat', option_order: 'a', is_correct: false },
          { option_text: 'Autoclave', option_order: 'b', is_correct: true },
          { option_text: 'UV Light', option_order: 'c', is_correct: false },
          { option_text: 'Gas sterilization', option_order: 'd', is_correct: false },
        ],
      },
      {
        chapter_id: ch2._id, school_id: school._id, subject_id: surgery._id,
        question_text: 'Which instrument is used for cutting sutures?',
        difficulty: 'medium', marks: 1,
        options: [
          { option_text: 'Forceps', option_order: 'a', is_correct: false },
          { option_text: 'Scalpel', option_order: 'b', is_correct: false },
          { option_text: 'Suture scissors', option_order: 'c', is_correct: true },
          { option_text: 'Retractor', option_order: 'd', is_correct: false },
        ],
      },
      {
        chapter_id: ch2._id, school_id: school._id, subject_id: surgery._id,
        question_text: 'Which of the following is a self-retaining retractor?',
        difficulty: 'hard', marks: 3,
        options: [
          { option_text: 'Langenbeck', option_order: 'a', is_correct: false },
          { option_text: 'Balfour', option_order: 'b', is_correct: true },
          { option_text: 'Army-Navy', option_order: 'c', is_correct: false },
          { option_text: 'Deaver', option_order: 'd', is_correct: false },
        ],
      },
    ]);
    console.log(`   Created ${questions.length} questions.`);

    /* ─── 10. Exams ────────────────────────────────────────────── */
    console.log('📝 Creating Exams...');
    const exam1 = await Exam.create({
      school_id: school._id,
      created_by: teacher._id,
      title: 'Anatomy Mid-Term Assessment',
      description: 'Mid-term exam covering Chapters 1-3 of Human Anatomy.',
      status: 'published',
      question_ids: questions.filter(q => q.chapter_id.equals(ch1._id)).map(q => q._id),
      duration: 30,
      is_shuffle: true,
      neg_mark: false,
      scheduled_at: new Date('2026-05-10T09:00:00'),
      expires_at: new Date('2026-05-10T10:00:00'),
    });
    const exam2 = await Exam.create({
      school_id: school._id,
      created_by: teacher._id,
      title: 'Surgical Instruments Quiz',
      description: 'Quick quiz on surgical instruments and sterilization.',
      status: 'draft',
      question_ids: questions.filter(q => q.chapter_id.equals(ch2._id)).map(q => q._id),
      duration: 45,
      is_shuffle: false,
      neg_mark: true,
      scheduled_at: new Date('2026-05-15T10:00:00'),
      expires_at: new Date('2026-05-15T11:00:00'),
    });
    console.log(`   Exams: ${exam1.title}, ${exam2.title}`);

    /* ─── 11. Exam Security Logs (sample) ──────────────────────── */
    console.log('🔒 Creating ExamSecurityLog entries...');
    await ExamSecurityLog.insertMany([
      {
        exam_id: exam1._id,
        chapter_id: ch1._id,
        user_id: student1._id,
        school_id: school._id,
        violation_type: 'tab-switch',
        session_id: 'sess-001',
        ip_address: '192.168.1.10',
        user_agent: 'Mozilla/5.0 Chrome/120',
      },
      {
        exam_id: exam1._id,
        chapter_id: ch1._id,
        user_id: student2._id,
        school_id: school._id,
        violation_type: 'fullscreen-exit',
        session_id: 'sess-002',
        ip_address: '192.168.1.11',
        user_agent: 'Mozilla/5.0 Firefox/119',
      },
    ]);
    console.log('   Created 2 security log entries.');

    /* ─── 12. Legacy MCQBank (backward compat) ─────────────────── */
    console.log('📦 Creating legacy MCQBank...');
    await MCQBank.create({
      title: 'Surgical Foundations',
      subject: 'General Surgery',
      createdBy: teacher._id,
      questions: [
        {
          questionText: 'Primary sterilization method?',
          options: [
            { label: 'A', text: 'Heat' },
            { label: 'B', text: 'Autoclave' },
            { label: 'C', text: 'UV' },
            { label: 'D', text: 'Gas' },
          ],
          correctAnswer: 'B',
        },
      ],
    });

    /* ─── 13. Session ──────────────────────────────────────────── */
    console.log('⏱️  Creating Session...');
    await Session.create({
      examId: 'Anatomy 101',
      startTime: new Date(),
      duration: 60,
      status: 'active',
    });

    /* ─── Done ─────────────────────────────────────────────────── */
    console.log('\n' + '═'.repeat(55));
    console.log('  ✅  DATABASE SEEDED SUCCESSFULLY');
    console.log('═'.repeat(55));
    console.log(`\n  Collections populated:`);
    console.log(`    • School             : 1`);
    console.log(`    • SchoolClass        : 2`);
    console.log(`    • Section            : 3`);
    console.log(`    • Subject            : 6`);
    console.log(`    • User               : 4`);
    console.log(`    • TeacherAssignment  : 2`);
    console.log(`    • MCQChapter         : 2`);
    console.log(`    • MCQQuestion        : ${questions.length}`);
    console.log(`    • Exam               : 2`);
    console.log(`    • ExamSecurityLog    : 2`);
    console.log(`    • MCQBank (legacy)   : 1`);
    console.log(`    • Session            : 1`);
    console.log(`\n  Login credentials:`);
    console.log(`    Teacher : teacher@surgical.com / password123`);
    console.log(`    Admin   : admin@surgical.com   / admin123`);
    console.log(`    Student : aarav@student.com     / password123`);
    console.log(`    Student : john@student.com      / password123\n`);

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Seeding failed:', error);
    process.exit(1);
  }
};

seedData();
