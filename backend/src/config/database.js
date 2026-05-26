const mongoose = require('mongoose');
const logger = require('../utils/logger');
const seedSecurityLogs = require('./seedSecurityLogs');

const connectDB = async () => {
  try {
    mongoose.set('strictQuery', false);

    // Handle asynchronous database connection errors to prevent process crashes
    mongoose.connection.on('error', (err) => {
      logger.error(`❌ MongoDB Connection Event Error: ${err.message}`);
    });

    const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/surgical_exam_db';
    if (!process.env.MONGO_URI) {
      logger.warn('MONGO_URI is not set. Falling back to mongodb://127.0.0.1:27017/surgical_exam_db');
    }

    let conn;
    try {
      conn = await mongoose.connect(mongoUri, {
        bufferCommands: false,
        serverSelectionTimeoutMS: 6000,
        socketTimeoutMS: 45000,
      });
    } catch (atlasErr) {
      if (process.env.MONGO_URI) {
        logger.error(`❌ MongoDB Atlas Connection Error: ${atlasErr.message}`);
        logger.warn('⚠️ Attempting fallback to local MongoDB instance: mongodb://127.0.0.1:27017/surgical_exam_db');
        conn = await mongoose.connect('mongodb://127.0.0.1:27017/surgical_exam_db', {
          bufferCommands: false,
          serverSelectionTimeoutMS: 5000,
          socketTimeoutMS: 45000,
        });
      } else {
        throw atlasErr;
      }
    }

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