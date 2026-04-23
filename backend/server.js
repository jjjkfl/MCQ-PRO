/**
 * server.js — Entry point for Surgical Exam MERN Application
 * Handles Express setup, Socket.io, middleware, routes
 */

require('dotenv').config();

const express       = require('express');
const http          = require('http');
const path          = require('path');
const cors          = require('cors');
const helmet        = require('helmet');
const compression   = require('compression');
const rateLimit     = require('express-rate-limit');
const mongoSanitize = require('express-mongo-sanitize');
const xssClean      = require('xss-clean');

const connectDB     = require('./src/config/database');
const initSocket    = require('./src/config/socket');
const logger        = require('./src/utils/logger');

const authRoutes    = require('./src/routes/authRoutes');
const portalRoutes  = require('./src/routes/portalRoutes');

/* ─── App & HTTP Server ─────────────────────────────────────────── */
const app    = express();
const server = http.createServer(app);

/* ─── Database ───────────────────────────────────────────────────── */
connectDB();

/* ─── Socket.io ──────────────────────────────────────────────────── */
const io = initSocket(server);
app.set('io', io);                        // expose io to controllers

/* ─── Security Middleware ────────────────────────────────────────── */
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc : ["'self'"],
      scriptSrc  : ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com'],
      styleSrc   : ["'self'", "'unsafe-inline'", 'fonts.googleapis.com', 'cdnjs.cloudflare.com'],
      fontSrc    : ["'self'", 'fonts.gstatic.com'],
      connectSrc : ["'self'", 'ws:', 'wss:'],
      imgSrc     : ["'self'", 'data:', 'blob:'],
    },
  },
}));

app.use(cors({
  origin      : process.env.ALLOWED_ORIGINS
                  ? process.env.ALLOWED_ORIGINS.split(',')
                  : '*',
  credentials : true,
  methods     : ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

/* ─── Rate Limiting ──────────────────────────────────────────────── */
const globalLimiter = rateLimit({
  windowMs : parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max      : parseInt(process.env.RATE_LIMIT_MAX)        || 100,
  message  : { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders  : false,
});

const authLimiter = rateLimit({
  windowMs : 15 * 60 * 1000,   // 15 minutes
  max      : 20,
  message  : { success: false, message: 'Too many auth attempts, try again in 15 minutes.' },
});

app.use('/api/', globalLimiter);
app.use('/api/auth/', authLimiter);

/* ─── Body Parsers & Sanitizers ──────────────────────────────────── */
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(mongoSanitize());
app.use(xssClean());
app.use(compression());

/* ─── Static Files ───────────────────────────────────────────────── */
app.use(express.static(path.join(__dirname, 'public')));

/* ─── Request Logger ─────────────────────────────────────────────── */
app.use((req, _res, next) => {
  logger.info(`${req.method} ${req.originalUrl} — IP: ${req.ip}`);
  next();
});

/* ─── API Routes ─────────────────────────────────────────────────── */
app.use('/api/auth',   authRoutes);
app.use('/api/portal', portalRoutes);

/* ─── Health Check ───────────────────────────────────────────────── */
app.get('/api/health', (_req, res) => {
  res.json({
    success : true,
    status  : 'healthy',
    uptime  : process.uptime(),
    env     : process.env.NODE_ENV,
    ts      : new Date().toISOString(),
  });
});

/* ─── SPA Fallback ───────────────────────────────────────────────── */
app.get('/',          (_req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));
app.get('/student',   (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/teacher',   (_req, res) => res.sendFile(path.join(__dirname, 'public', 'teacher.html')));

/* ─── 404 Handler ────────────────────────────────────────────────── */
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Route not found.' });
});

/* ─── Global Error Handler ───────────────────────────────────────── */
app.use((err, _req, res, _next) => {
  logger.error(`Unhandled error: ${err.message}`, { stack: err.stack });
  const statusCode = err.statusCode || 500;
  res.status(statusCode).json({
    success : false,
    message : process.env.NODE_ENV === 'production'
                ? 'Internal server error'
                : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

/* ─── Start Server ───────────────────────────────────────────────── */
const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  logger.info(`🚀 Server running on http://localhost:${PORT} [${process.env.NODE_ENV}]`);
});

/* ─── Graceful Shutdown ──────────────────────────────────────────── */
process.on('SIGTERM', () => {
  logger.info('SIGTERM received — shutting down gracefully');
  server.close(() => {
    logger.info('Process terminated');
    process.exit(0);
  });
});

process.on('unhandledRejection', (err) => {
  logger.error(`Unhandled Promise Rejection: ${err.message}`);
  server.close(() => process.exit(1));
});

module.exports = { app, server, io };