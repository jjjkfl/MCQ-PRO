require('dotenv').config();
const http = require('http');
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./src/config/database');
const authRoutes = require('./src/routes/authRoutes');
const adminRoutes = require('./src/routes/adminRoutes');
const portalRoutes = require('./src/routes/portalRoutes');
const initSocket = require('./src/config/socket');
const { initAuditPulse } = require('./src/services/blockchain/auditPulse');
const { initChangeStreamGuardian } = require('./src/services/blockchain/changeStreamGuardian');

const app = express();

const startServer = async () => {
  await connectDB();

  app.use(cors());
  app.use(express.json());

  // Static Files
  app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));
  app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

  // API Routes
  app.use('/api/auth', authRoutes);
  app.use('/api/admin', adminRoutes);
  app.use('/api', portalRoutes);

  // Honeypots for Deception Layer (Intrusion Trap)
  const { triggerHoneypot } = require('./src/middleware/securityEngine');
  app.use('/api/admin/debug-database', triggerHoneypot);
  app.use('/api/system/backup-config', triggerHoneypot);

  // JSON 404 for API
  app.use('/api', (req, res) => {
    res.status(404).json({ success: false, message: `API Route ${req.originalUrl} not found` });
  });

  // SPA Fallbacks
  app.get('/', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'login.html')));
  app.get('/login/super', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'login-super.html')));
  app.get('/login/school', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'login-school.html')));
  app.get('/login/teacher', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'login-teacher.html')));
  app.get('/login/student', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'login-student.html')));
  app.get('/student', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'index.html')));
  app.get('/teacher', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'teacher.html')));
  app.get('/exam', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'exam.html')));
  app.get('/super-admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'super-admin.html')));
  app.get('/school-admin', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'school-admin.html')));

  // Initialize Blockchain Audit Pulse (Super-Strength Integrity)
  initAuditPulse(5 * 60 * 1000); // 5 minute pulse

  // Initialize Change Stream Guardian (Self-Healing Immutable Results)
  // Note: Requires MongoDB with replica set (rs) mode for Change Streams
  setTimeout(initChangeStreamGuardian, 3000); // Start after DB is ready

  const PORT = process.env.PORT || 5000;
  const httpServer = http.createServer(app);
  const io = initSocket(httpServer);
  app.set('socketio', io);

  httpServer.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
  });
};

startServer().catch((err) => {
  console.error('Server startup failed:', err);
  process.exit(1);
});