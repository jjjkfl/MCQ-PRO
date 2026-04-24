require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const connectDB = require('./src/config/database');
const authRoutes = require('./src/routes/authRoutes');
const portalRoutes = require('./src/routes/portalRoutes');

const app = express();
connectDB();

app.use(cors());
app.use(express.json());

// Static Files
app.use(express.static(path.join(__dirname, '..', 'frontend', 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// API Routes
app.use('/api/auth', authRoutes);
app.use('/api', portalRoutes); 

// SPA Fallbacks
app.get('/',        (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'login.html')));
app.get('/student', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'index.html')));
app.get('/teacher', (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'teacher.html')));
app.get('/exam',    (req, res) => res.sendFile(path.join(__dirname, '..', 'frontend', 'public', 'exam.html')));

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});