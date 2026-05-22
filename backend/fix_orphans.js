const mongoose = require('mongoose');

async function fix() {
    await mongoose.connect('mongodb://localhost:27017/surgical_exam_db');
    const targetSchoolId = '69ea0c2e807d4e73dda82c0b';
    
    const User = mongoose.model('User', new mongoose.Schema({}, { strict: false }));
    const Session = mongoose.model('Session', new mongoose.Schema({}, { strict: false }));
    const Course = mongoose.model('Course', new mongoose.Schema({}, { strict: false }));

    const userRes = await User.updateMany(
        { role: 'teacher', schoolId: { $exists: false } }, 
        { $set: { schoolId: targetSchoolId } }
    );
    console.log(`Updated ${userRes.modifiedCount} teachers.`);

    const courseRes = await Course.updateMany(
        { schoolId: { $exists: false } }, 
        { $set: { schoolId: targetSchoolId } }
    );
    console.log(`Updated ${courseRes.modifiedCount} courses.`);

    const sessionRes = await Session.updateMany(
        { schoolId: { $exists: false } }, 
        { $set: { schoolId: targetSchoolId } }
    );
    console.log(`Updated ${sessionRes.modifiedCount} sessions.`);

    console.log('Orphaned data linkage complete.');
    process.exit();
}

fix().catch(err => {
    console.error(err);
    process.exit(1);
});
