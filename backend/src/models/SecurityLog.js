/**
 * backend/src/models/SecurityLog.js
 * Immutable forensic security log schema with cryptographic hashing chain
 */

const mongoose = require('mongoose');
const crypto = require('crypto');

const securityLogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  eventType: { 
    type: String, 
    enum: ['zero_trust_check', 'waf_block', 'honeypot_trigger', 'blockchain_verification', 'self_healing_revert', 'risk_engine_alert'],
    required: true 
  },
  severity: { type: String, enum: ['low', 'medium', 'high', 'critical'], required: true },
  description: { type: String, required: true },
  requestPath: { type: String },
  ipAddress: { type: String },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  riskScore: { type: Number, default: 0 },
  deviceScore: { type: Number, default: 100 }, // 0 to 100 (100 is fully trusted)
  previousHash: { type: String },
  currentHash: { type: String }
}, { timestamps: true });

// Pre-save hook to calculate cryptographic hash chain
securityLogSchema.pre('save', async function (next) {
  if (this.isNew) {
    try {
      // Find the last log entry to get its currentHash
      const lastLog = await mongoose.model('SecurityLog').findOne().sort({ createdAt: -1 });
      this.previousHash = lastLog ? lastLog.currentHash : '0000000000000000000000000000000000000000000000000000000000000000';
      
      // Calculate current hash using previous hash and current fields
      const dataToHash = this.timestamp.toISOString() + 
                         this.eventType + 
                         this.severity + 
                         this.description + 
                         (this.requestPath || '') + 
                         (this.ipAddress || '') + 
                         (this.userId ? this.userId.toString() : '') + 
                         this.riskScore.toString() + 
                         this.deviceScore.toString() + 
                         this.previousHash;
                         
      this.currentHash = crypto.createHash('sha256').update(dataToHash).digest('hex');
    } catch (err) {
      return next(err);
    }
  }
  next();
});

module.exports = mongoose.model('SecurityLog', securityLogSchema);
