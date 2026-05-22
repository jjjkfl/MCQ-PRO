/**
 * backend/src/config/seedSecurityLogs.js
 * Automatic seeding function to populate forensic security log database
 */

const SecurityLog = require('../models/SecurityLog');
const logger = require('../utils/logger');

const seedSecurityLogs = async () => {
  try {
    const count = await SecurityLog.countDocuments();
    if (count > 0) {
      logger.info('Security Logs: Forensic logs database already initialized.');
      return;
    }

    logger.info('Security Logs: Seeding initial forensic audit logs...');

    // We will save logs sequentially to build the hash chain
    const logs = [
      {
        eventType: 'zero_trust_check',
        severity: 'low',
        description: 'Zero Trust context evaluation: Authorized Principal logon. Device trust score 98% (Fully Trustworthy). Location: school-campus-wifi.',
        ipAddress: '192.168.1.42',
        riskScore: 12,
        deviceScore: 98
      },
      {
        eventType: 'blockchain_verification',
        severity: 'low',
        description: 'Automated Integrity Check: Canonical results Merkle Root verified against Ethereum contract state seal. Block Height: 104231.',
        ipAddress: '127.0.0.1',
        riskScore: 10,
        deviceScore: 100
      },
      {
        eventType: 'waf_block',
        severity: 'high',
        description: 'WAF Intrusion Block: SQL Injection attempt detected in student ID query string ("UNION SELECT user_password"). Request blocked.',
        ipAddress: '203.0.113.88',
        riskScore: 95,
        deviceScore: 40
      },
      {
        eventType: 'zero_trust_check',
        severity: 'low',
        description: 'Zero Trust context evaluation: Authorized Teacher upload (Class 10th Study Materials). Device trust score 90%.',
        ipAddress: '192.168.1.115',
        riskScore: 15,
        deviceScore: 90
      },
      {
        eventType: 'risk_engine_alert',
        severity: 'medium',
        description: 'AI Risk Engine flag: Access attempt during off-hours (2:45 AM) from a new device fingerprint. Continuous challenge re-authentication requested.',
        ipAddress: '198.51.100.22',
        riskScore: 60,
        deviceScore: 70
      },
      {
        eventType: 'self_healing_revert',
        severity: 'medium',
        description: 'Guardian Self-Healing: Reverted unauthorized score modification in MongoDB for Result ID: 69ec7a5aaa196372e2003d16 (Restored: 40, Attempted: 95).',
        ipAddress: '127.0.0.1',
        riskScore: 30,
        deviceScore: 100
      },
      {
        eventType: 'honeypot_trigger',
        severity: 'critical',
        description: 'Deception Trap Tripped: Unauthorized attempt to scan directory "/api/admin/debug-database" (Decoy Honeypot API). Attacker IP flagged.',
        ipAddress: '185.220.101.44',
        riskScore: 100,
        deviceScore: 10
      }
    ];

    // Create logs sequentially so pre-save hook chains hashes correctly
    for (const logData of logs) {
      await SecurityLog.create(logData);
    }

    logger.info('✅ Security Logs: Forensic audit logs seeded successfully.');
  } catch (err) {
    logger.error(`Security Logs seeding failed: ${err.message}`);
  }
};

module.exports = seedSecurityLogs;
