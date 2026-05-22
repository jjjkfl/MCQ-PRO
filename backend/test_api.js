const mongoose = require('mongoose');

async function test() {
    await mongoose.connect('mongodb://localhost:27017/surgical_exam_db');
    const Session = mongoose.model('Session', new mongoose.Schema({}, { strict: false }));
    const sessions = await Session.find({ status: { $in: ['active', 'pending'] } });
    console.log('Total Active/Pending:', sessions.length);
    console.log('Sample IDs:', sessions.map(s => s._id).slice(0, 5));
    process.exit();
}

test();
