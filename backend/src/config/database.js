const mongoose = require('mongoose');
const logger = require('../utils/logger');
const seedSecurityLogs = require('./seedSecurityLogs');

const connectDB = async () => {
  try {
    mongoose.set('strictQuery', false);

    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/surgical_exam_db';
    if (!process.env.MONGO_URI) {
      logger.warn('MONGO_URI is not set. Falling back to mongodb://127.0.0.1:27017/surgical_exam_db');
    }

    const conn = await mongoose.connect(mongoUri, {
      bufferCommands: false,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    logger.info(`✅ MongoDB Connected: ${conn.connection.host}`);

    // Seed security logs database
    await seedSecurityLogs();

    return conn;
  } catch (err) {
    logger.error(`❌ MongoDB Connection Error: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;