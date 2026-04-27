const CourseMaterial = require('../models/CourseMaterial');
const Announcement = require('../models/Announcement');
const Attendance = require('../models/Attendance');
const ForumThread = require('../models/ForumThread');
const ForumComment = require('../models/ForumComment');
const Session = require('../models/Session');
const blockchain = require('../services/blockchain/blockchainService');
const hashService = require('../services/blockchain/hashService');

// ─── Course Materials ───────────────────────────────────────────────

exports.getMaterials = async (req, res) => {
    try {
        const { courseId } = req.params;
        const materials = await CourseMaterial.find({ courseId }).sort('order');
        res.json({ success: true, data: materials });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.uploadMaterial = async (req, res) => {
    try {
        const { courseId, title, description, type, url } = req.body;
        const material = await CourseMaterial.create({
            courseId, title, description, type, url,
            createdBy: req.user._id
        });
        res.status(201).json({ success: true, data: material });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

exports.deleteMaterial = async (req, res) => {
    try {
        await CourseMaterial.findByIdAndDelete(req.params.id);
        res.json({ success: true, message: 'Material deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─── Announcements ──────────────────────────────────────────────────

exports.getAnnouncements = async (req, res) => {
    try {
        const { courseId } = req.params;
        const announcements = await Announcement.find({ courseId }).sort('-createdAt').populate('authorId', 'name');
        res.json({ success: true, data: announcements });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.createAnnouncement = async (req, res) => {
    try {
        const { courseId, title, content } = req.body;
        const announcement = await Announcement.create({
            courseId, title, content,
            authorId: req.user._id
        });
        res.status(201).json({ success: true, data: announcement });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// ─── Attendance ─────────────────────────────────────────────────────

exports.getAttendance = async (req, res) => {
    try {
        const { sessionId } = req.params;
        const attendance = await Attendance.find({ sessionId }).populate('studentId', 'name email');
        res.json({ success: true, data: attendance });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.markAttendance = async (req, res) => {
    try {
        const { sessionId, studentId, status } = req.body;
        const mongoose = require('mongoose');

        const att = await Attendance.findOneAndUpdate(
            {
                sessionId: new mongoose.Types.ObjectId(sessionId),
                studentId: new mongoose.Types.ObjectId(studentId)
            },
            { status, markedAt: Date.now() },
            { upsert: true, new: true }
        );
        res.json({ success: true, data: att });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

exports.deleteAttendance = async (req, res) => {
    try {
        const { id } = req.params;
        await Attendance.findByIdAndDelete(id);
        res.json({ success: true, message: 'Attendance record deleted' });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

// ─── Forums ─────────────────────────────────────────────────────────

exports.getThreads = async (req, res) => {
    try {
        const { courseId } = req.params;
        const query = courseId ? { courseId } : {};
        const threads = await ForumThread.find(query).sort('-createdAt').populate('authorId', 'name');
        res.json({ success: true, data: threads });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};

exports.createThread = async (req, res) => {
    try {
        const { title, content, courseId } = req.body;
        const thread = await ForumThread.create({
            title, content, courseId,
            authorId: req.user._id
        });
        res.status(201).json({ success: true, data: thread });
    } catch (err) {
        res.status(400).json({ success: false, message: err.message });
    }
};

// ─── Certificates ───────────────────────────────────────────────────

exports.generateCertificate = async (req, res) => {
    try {
        const { courseId } = req.params;
        const student = req.user;

        const Result = require('../models/Result');
        const Course = require('../models/Course');

        const [course, results] = await Promise.all([
            Course.findById(courseId),
            Result.find({ studentId: student._id, courseId })
        ]);

        if (!course) return res.status(404).json({ success: false, message: 'Course not found' });

        const avgScore = results.length > 0
            ? results.reduce((acc, r) => acc + r.score, 0) / results.length
            : 0;

        const certificateId = `CERT-${courseId.toString().slice(-6)}-${student._id.toString().slice(-6)}`.toUpperCase();

        // Blockchain Anchoring
        const certData = { studentName: student.name, courseName: course.courseName, certificateId, date: new Date() };
        const certHash = hashService.computeHMAC(JSON.stringify(certData));

        let txHash = null;
        try {
            const seal = await blockchain.storeResultHash(certHash, certificateId);
            txHash = seal.txHash;
        } catch (bErr) {
            console.warn('Cert blockchain anchoring failed:', bErr.message);
        }

        res.json({
            success: true,
            data: {
                studentName: student.name,
                courseName: course.courseName,
                issueDate: new Date(),
                grade: avgScore >= 90 ? 'A+' : avgScore >= 80 ? 'A' : avgScore >= 70 ? 'B' : 'C',
                certificateId,
                blockchainTx: txHash,
                blockchainHash: certHash
            }
        });
    } catch (err) {
        res.status(500).json({ success: false, message: err.message });
    }
};
