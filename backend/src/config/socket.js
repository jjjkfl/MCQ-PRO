/**
 * src/config/socket.js
 * Socket.io initialization and real-time exam event handling
 */

const { Server }      = require('socket.io');
const jwt             = require('jsonwebtoken');
const logger          = require('../utils/logger');

/* In-memory room state (use Redis for multi-instance production) */
const examRooms  = new Map();   // sessionId → { students, timer, started }
const userSocket = new Map();   // userId    → socketId

const initSocket = (httpServer) => {
  const io = new Server(httpServer, {
    cors: {
      origin      : process.env.ALLOWED_ORIGINS
                      ? process.env.ALLOWED_ORIGINS.split(',')
                      : '*',
      methods     : ['GET', 'POST'],
      credentials : true,
    },
    pingTimeout  : 60000,
    pingInterval : 25000,
  });

  /* ─── Auth Middleware ─────────────────────────────────────────── */
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token
               || socket.handshake.headers?.authorization?.split(' ')[1];

    if (!token) return next(new Error('Authentication error: No token'));

    try {
      const decoded  = jwt.verify(token, process.env.JWT_SECRET);
      socket.user    = decoded;
      next();
    } catch {
      next(new Error('Authentication error: Invalid token'));
    }
  });

  /* ─── Connection Handler ──────────────────────────────────────── */
  io.on('connection', (socket) => {
    const { id: userId, role } = socket.user;
    userSocket.set(userId, socket.id);
    logger.info(`Socket connected: ${socket.id} | user=${userId} | role=${role}`);

    /* ── JOIN EXAM ROOM ──────────────────────────────────────────── */
    socket.on('exam:join', ({ sessionId }) => {
      if (!sessionId) return;
      socket.join(sessionId);

      if (!examRooms.has(sessionId)) {
        examRooms.set(sessionId, {
          students  : new Map(),
          started   : false,
          endTime   : null,
          paused    : false,
        });
      }

      if (role === 'student') {
        examRooms.get(sessionId).students.set(userId, {
          socketId   : socket.id,
          joinedAt   : Date.now(),
          answersGiven : 0,
          tabSwitches  : 0,
          online       : true,
        });
        io.to(sessionId).emit('exam:studentJoined', {
          userId,
          studentCount: examRooms.get(sessionId).students.size,
        });
      }

      /* Send current room state to the joiner */
      const room = examRooms.get(sessionId);
      socket.emit('exam:state', {
        started  : room.started,
        endTime  : room.endTime,
        paused   : room.paused,
      });

      logger.info(`User ${userId} joined exam room ${sessionId}`);
    });

    /* ── TEACHER: START EXAM ─────────────────────────────────────── */
    socket.on('exam:start', ({ sessionId, durationMinutes }) => {
      if (role !== 'teacher') return socket.emit('error', { message: 'Unauthorized' });

      const room    = examRooms.get(sessionId);
      if (!room) return socket.emit('error', { message: 'Room not found' });

      const endTime = Date.now() + durationMinutes * 60 * 1000;
      room.started  = true;
      room.endTime  = endTime;
      room.paused   = false;

      io.to(sessionId).emit('exam:started', { endTime, durationMinutes });
      logger.info(`Exam started in room ${sessionId} — ${durationMinutes}min`);

      /* Auto-end timer */
      setTimeout(() => {
        io.to(sessionId).emit('exam:ended', { reason: 'time_up' });
        examRooms.delete(sessionId);
      }, durationMinutes * 60 * 1000 + 5000);
    });

    /* ── TEACHER: PAUSE / RESUME ─────────────────────────────────── */
    socket.on('exam:pause', ({ sessionId }) => {
      if (role !== 'teacher') return;
      const room = examRooms.get(sessionId);
      if (!room) return;
      room.paused = true;
      io.to(sessionId).emit('exam:paused');
    });

    socket.on('exam:resume', ({ sessionId }) => {
      if (role !== 'teacher') return;
      const room = examRooms.get(sessionId);
      if (!room) return;
      room.paused = false;
      io.to(sessionId).emit('exam:resumed');
    });

    /* ── STUDENT: ANSWER SUBMIT ──────────────────────────────────── */
    socket.on('exam:answer', ({ sessionId, questionIndex, answerId }) => {
      if (role !== 'student') return;
      const room = examRooms.get(sessionId);
      if (!room || !room.started) return;

      const student = room.students.get(userId);
      if (student) {
        student.answersGiven++;
        /* Notify teacher of progress */
        socket.to(sessionId).emit('exam:studentProgress', {
          userId,
          questionIndex,
          answersGiven: student.answersGiven,
        });
      }
    });

    /* ── STUDENT: TAB SWITCH DETECTION ──────────────────────────── */
    socket.on('exam:tabSwitch', ({ sessionId }) => {
      if (role !== 'student') return;
      const room = examRooms.get(sessionId);
      if (!room) return;
      const student = room.students.get(userId);
      if (student) {
        student.tabSwitches++;
        io.to(sessionId).emit('exam:suspiciousActivity', {
          userId,
          tabSwitches : student.tabSwitches,
          timestamp   : new Date().toISOString(),
        });
        logger.warn(`Tab switch detected: user=${userId} session=${sessionId} count=${student.tabSwitches}`);
      }
    });

    /* ── TEACHER: FORCE END EXAM ─────────────────────────────────── */
    socket.on('exam:forceEnd', ({ sessionId }) => {
      if (role !== 'teacher') return;
      io.to(sessionId).emit('exam:ended', { reason: 'teacher_ended' });
      examRooms.delete(sessionId);
      logger.info(`Teacher force-ended exam: ${sessionId}`);
    });

    /* ── TEACHER: GET STUDENTS IN ROOM ───────────────────────────── */
    socket.on('exam:getStudents', ({ sessionId }) => {
      if (role !== 'teacher') return;
      const room = examRooms.get(sessionId);
      if (!room) return socket.emit('exam:studentList', { students: [] });
      const list = Array.from(room.students.entries()).map(([uid, info]) => ({
        userId : uid, ...info,
      }));
      socket.emit('exam:studentList', { students: list });
    });

    /* ── DISCONNECT ──────────────────────────────────────────────── */
    socket.on('disconnect', (reason) => {
      userSocket.delete(userId);
      logger.info(`Socket disconnected: ${socket.id} | reason=${reason}`);

      /* Mark student offline in all rooms they were in */
      for (const [sessionId, room] of examRooms.entries()) {
        if (room.students.has(userId)) {
          room.students.get(userId).online = false;
          io.to(sessionId).emit('exam:studentOffline', { userId });
        }
      }
    });
  });

  return io;
};

module.exports = initSocket;
module.exports.examRooms  = examRooms;
module.exports.userSocket = userSocket;