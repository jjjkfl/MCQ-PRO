require('dotenv').config();
const mongoose = require('mongoose');
const connectDB = require('./src/config/database');
const User = require('./src/models/User');
const School = require('./src/models/School');
const SubscriptionPlan = require('./src/models/SubscriptionPlan');

const seedAdminData = async () => {
  await connectDB();
  
  try {
    // 1. Create Super Admin
    let superAdmin = await User.findOne({ role: 'super_admin' });
    if (!superAdmin) {
      superAdmin = await User.create({
        name: 'Platform Super Admin',
        email: 'superadmin@example.com',
        password: 'password123',
        role: 'super_admin'
      });
      console.log('✅ Super Admin created: superadmin@example.com / password123');
    }

    // 2. Create Subscription Plan
    let plan = await SubscriptionPlan.findOne({ name: 'Enterprise' });
    if (!plan) {
      plan = await SubscriptionPlan.create({
        name: 'Enterprise',
        price: 9999,
        features: ['Unlimited Students', 'AI Proctoring', 'Custom Branding'],
        durationDays: 365
      });
      console.log('✅ Enterprise Plan created');
    }

    // 3. Create Schools
    let school = await School.findOne({ name_slug: 'global-academy' });
    if (!school) {
      school = await School.create({
        name: 'Global Academy',
        name_slug: 'global-academy',
        board_type: 'CBSE',
        subscription_plan: 'Enterprise',
        is_active: true,
        state: 'Karnataka',
        district: 'Bengaluru',
        latitude: 12.9716,
        longitude: 77.5946
      });
      console.log('✅ School created: Global Academy');
    } else {
      school.state = 'Karnataka';
      school.district = 'Bengaluru';
      school.latitude = 12.9716;
      school.longitude = 77.5946;
      await school.save();
    }

    let school2 = await School.findOne({ name_slug: 'apex-high-school' });
    if (!school2) {
      school2 = await School.create({
        name: 'Apex High School',
        name_slug: 'apex-high-school',
        board_type: 'ICSE',
        subscription_plan: 'Enterprise',
        is_active: true,
        state: 'Maharashtra',
        district: 'Pune',
        latitude: 18.5204,
        longitude: 73.8567
      });
      console.log('✅ School created: Apex High School (Pune)');
    }

    let school3 = await School.findOne({ name_slug: 'delhi-public-academy' });
    if (!school3) {
      school3 = await School.create({
        name: 'Delhi Public Academy',
        name_slug: 'delhi-public-academy',
        board_type: 'State Board',
        subscription_plan: 'Enterprise',
        is_active: true,
        state: 'Delhi',
        district: 'New Delhi',
        latitude: 28.6139,
        longitude: 77.2090
      });
      console.log('✅ School created: Delhi Public Academy (New Delhi)');
    }

    // 4. Create School Admins
    let schoolAdmin = await User.findOne({ email: 'schooladmin@example.com' });
    if (!schoolAdmin) {
      schoolAdmin = await User.create({
        name: 'John School Admin',
        email: 'schooladmin@example.com',
        password: 'password123',
        role: 'school_admin',
        schoolId: school._id
      });
      
      // Link admin to school
      school.adminId = schoolAdmin._id;
      await school.save();
      
      console.log('✅ School Admin created: schooladmin@example.com / password123');
    }

    let schoolAdmin2 = await User.findOne({ email: 'schooladmin2@example.com' });
    if (!schoolAdmin2) {
      schoolAdmin2 = await User.create({
        name: 'Maharashtra Admin',
        email: 'schooladmin2@example.com',
        password: 'password123',
        role: 'school_admin',
        schoolId: school2._id
      });
      school2.adminId = schoolAdmin2._id;
      await school2.save();
      console.log('✅ School Admin created: schooladmin2@example.com / password123');
    }

    let schoolAdmin3 = await User.findOne({ email: 'schooladmin3@example.com' });
    if (!schoolAdmin3) {
      schoolAdmin3 = await User.create({
        name: 'Delhi Admin',
        email: 'schooladmin3@example.com',
        password: 'password123',
        role: 'school_admin',
        schoolId: school3._id
      });
      school3.adminId = schoolAdmin3._id;
      await school3.save();
      console.log('✅ School Admin created: schooladmin3@example.com / password123');
    }

    // 5. Create some students and teachers
    const studentCount = await User.countDocuments({ role: 'student', schoolId: school._id });
    if (studentCount === 0) {
      await User.create([
        { name: 'Alice Student', email: 'alice@example.com', password: 'password123', role: 'student', schoolId: school._id, division: 'A' },
        { name: 'Bob Student', email: 'bob@example.com', password: 'password123', role: 'student', schoolId: school._id, division: 'A' }
      ]);
      console.log('✅ Students created');
    }

    process.exit();
  } catch (err) {
    console.error('❌ Seeding failed:', err);
    process.exit(1);
  }
};

seedAdminData();
