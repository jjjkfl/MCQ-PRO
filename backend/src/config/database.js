/**
 * src/config/database.js
 * MongoDB connection with Mongoose
 */

const mongoose = require('mongoose');
const logger   = require('../utils/logger');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS : 5000,
      socketTimeoutMS          : 45000,
      maxPoolSize              : 10,
    });

    logger.info(`✅ MongoDB connected: ${conn.connection.host}`);

    mongoose.connection.on('disconnected', () =>
      logger.warn('MongoDB disconnected — attempting reconnect…'));

    mongoose.connection.on('reconnected', () =>
      logger.info('MongoDB reconnected'));

    mongoose.connection.on('error', (err) =>
      logger.error(`MongoDB connection error: ${err.message}`));

  } catch (err) {
    logger.error(`MongoDB connection failed: ${err.message}`);
    process.exit(1);
  }
};

module.exports = connectDB;