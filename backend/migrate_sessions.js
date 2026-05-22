const mongoose = require('mongoose');

async function migrate() {
    await mongoose.connect('mongodb://localhost:27017/surgical_exam_db');
    
    const Session = mongoose.model('Session', new mongoose.Schema({
        courseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Course' },
        schoolId: mongoose.Schema.Types.ObjectId
    }, { strict: false }));
    
    const Course = mongoose.model('Course', new mongoose.Schema({
        teacherIds: [mongoose.Schema.Types.ObjectId]
    }, { strict: false }));
    
    const User = mongoose.model('User', new mongoose.Schema({
        schoolId: mongoose.Schema.Types.ObjectId
    }, { strict: false }));

    const sessions = await Session.find({ schoolId: { $exists: false } });
    console.log(`Found ${sessions.length} sessions to migrate.`);

    for (const session of sessions) {
        if (!session.courseId) {
            console.log(`Skipping session "${session.title}": No courseId`);
            continue;
        }
        
        const course = await Course.findById(session.courseId);
        if (!course) {
            console.log(`Skipping session "${session.title}": Course ${session.courseId} not found`);
            continue;
        }

        if (!course.teacherIds || course.teacherIds.length === 0) {
            console.log(`Skipping session "${session.title}": Course has no teacherIds`);
            continue;
        }

        const teacher = await User.findById(course.teacherIds[0]);
        if (!teacher) {
            console.log(`Skipping session "${session.title}": Teacher ${course.teacherIds[0]} not found`);
            continue;
        }

        if (!teacher.schoolId) {
            console.log(`Skipping session "${session.title}": Teacher ${teacher.name} has no schoolId`);
            continue;
        }

        await Session.updateOne(
            { _id: session._id },
            { $set: { schoolId: teacher.schoolId } }
        );
        console.log(`Updated session "${session.title}" with schoolId: ${teacher.schoolId}`);
    }

    console.log('Migration complete.');
    process.exit();
}

migrate().catch(err => {
    console.error(err);
    process.exit(1);
});
