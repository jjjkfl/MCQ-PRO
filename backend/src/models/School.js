/**
 * backend/src/models/School.js
 * Model for Schools/Tenants
 */

const mongoose = require('mongoose');

const schoolSchema = new mongoose.Schema({
  name: { type: String, required: true },
  name_slug: { type: String, required: true, unique: true },
  board_type: { type: String, enum: ['CBSE', 'ICSE', 'State', 'IB', 'State Board', 'Other'], default: 'CBSE' },
  subscription_plan: { type: String, default: 'Basic' },
  max_students_teachers: { type: Number, default: 100 },
  is_active: { type: Boolean, default: true },
  adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  branding: {
    logo: { type: String },
    primary_color: { type: String, default: '#0071e3' },
    secondary_color: { type: String, default: '#1d1d1f' }
  },
  state: { type: String, default: 'Karnataka' },
  district: { type: String, default: 'Bengaluru' },
  latitude: { type: Number, default: 12.9716 },
  longitude: { type: Number, default: 77.5946 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('School', schoolSchema);
