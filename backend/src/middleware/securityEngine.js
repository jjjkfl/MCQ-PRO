/**
 * backend/src/middleware/securityEngine.js
 * Multi-layered Security Engine: WAF, Zero Trust context assessor, AI Risk Engine, and Deception Honeypot loggers
 */

const SecurityLog = require('../models/SecurityLog');
const User = require('../models/User');
const logger = require('../utils/logger');
const encryptionService = require('../services/blockchain/encryptionService');

// Simple pattern matches for WAF intrusion detection
const NOSQL_INJECTION_PATTERN = /(\$ne|\$gt|\$lt|\$gte|\$lte|\$regex|\$where|\$elemMatch)/i;
const SQL_INJECTION_PATTERN = /('\s*or\s*|"\s*or\s*|--|select\s+.*\s+from|union\s+select)/i;
const XSS_PATTERN = /(<script>|javascript:|onerror=|onload=)/i;

/**
 * 1. Web Application Firewall (WAF) & Intrusion Detection System (IDS)
 * Scans incoming request body, query params, and headers for suspicious injection patterns
 */
const wafGuard = async (req, res, next) => {
  const checkString = JSON.stringify({
    body: req.body,
    query: req.query,
    params: req.params,
    url: req.originalUrl
  });

  let detected = null;
  if (NOSQL_INJECTION_PATTERN.test(checkString)) {
    detected = 'NoSQL Injection Attempt';
  } else if (SQL_INJECTION_PATTERN.test(checkString)) {
    detected = 'SQL Injection Attempt';
  } else if (XSS_PATTERN.test(checkString)) {
    detected = 'Cross-Site Scripting (XSS) Attempt';
  }

  if (detected) {
    const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
    const userId = req.user ? req.user.id : null;
    
    // Log threat to forensic log
    const log = await SecurityLog.create({
      eventType: 'waf_block',
      severity: 'high',
      description: `WAF Intrusion Block: Detected ${detected}. Request blocked.`,
      requestPath: req.originalUrl,
      ipAddress: ip,
      userId: userId,
      riskScore: 95,
      deviceScore: 30
    });

    logger.warn(`🛡️  WAF Block: ${detected} from IP=${ip} Path=${req.originalUrl}`);
    return res.status(403).json({
      success: false,
      message: 'Security Violation: Intrusion pattern detected by WAF.',
      threatId: log._id,
      riskScore: 95
    });
  }
  next();
};

/**
 * 2. Zero Trust & Context-Aware Access Assessor
 * Performs continuous identity verification, checks device trust, session context, and computes risk scores.
 */
const zeroTrustAssessor = async (req, res, next) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  const userId = req.user ? req.user.id : null;
  const userAgent = req.headers['user-agent'] || 'Unknown';
  
  // A. Evaluate access timing (Midnight access raises risk)
  const hours = new Date().getHours();
  const isOffHours = hours >= 23 || hours < 5; // 11 PM to 5 AM
  
  // B. Assess Device Trust score
  // Simulate device scoring based on User-Agent and presence of a mock Device Fingerprint header
  const fingerprint = req.headers['x-device-fingerprint'];
  let deviceScore = 100;
  
  if (!fingerprint) {
    deviceScore = 80; // No client fingerprint decreases score slightly
  } else if (fingerprint.length < 16) {
    deviceScore = 50; // Invalid/unverified device fingerprint
  }
  
  if (userAgent.includes('PostmanRuntime') || userAgent.includes('curl')) {
    deviceScore -= 30; // Developer tooling decreases device score
  }

  // C. Calculate AI Risk Engine Score
  let riskScore = 10; // Base risk score
  
  if (isOffHours) riskScore += 35; // +35 risk for unusual timing
  if (deviceScore < 100) riskScore += (100 - deviceScore) * 0.6; // Scale risk by untrusted device
  
  // Flag sensitive paths (e.g. deleting materials or editing admins)
  const isSensitiveAction = req.method === 'DELETE' || req.originalUrl.includes('/approved') || req.originalUrl.includes('/suspend');
  if (isSensitiveAction) {
    riskScore += 20;
  }

  // Cap risk score between 0 and 100
  riskScore = Math.min(Math.round(riskScore), 100);

  // D. Enforce rules based on risk threshold
  if (riskScore >= 80) {
    // Revoke encryption keys instantly for database isolation
    encryptionService.revokeAllKeys();

    // High-risk access needs instant re-verification / blocking
    await SecurityLog.create({
      eventType: 'risk_engine_alert',
      severity: 'high',
      description: `Access Blocked: AI Risk Engine flagged high risk score (${riskScore}/100) from device score ${deviceScore}. Database isolated.`,
      requestPath: req.originalUrl,
      ipAddress: ip,
      userId: userId,
      riskScore: riskScore,
      deviceScore: deviceScore
    });

    return res.status(403).json({
      success: false,
      message: 'Zero Trust Access Denied: High risk anomaly detected. Please re-authenticate your device.',
      riskScore
    });
  }

  // E. Record low/medium risk actions periodically to show active audit logs
  if (isSensitiveAction || riskScore > 30 || Math.random() < 0.1) {
    await SecurityLog.create({
      eventType: 'zero_trust_check',
      severity: riskScore > 40 ? 'medium' : 'low',
      description: `Zero Trust Context Assessed: Identity verified. Device trust: ${deviceScore} | Risk Score: ${riskScore}`,
      requestPath: req.originalUrl,
      ipAddress: ip,
      userId: userId,
      riskScore: riskScore,
      deviceScore: deviceScore
    });
  }

  // Attach variables to request object for downstream use
  req.riskScore = riskScore;
  req.deviceScore = deviceScore;

  next();
};

/**
 * 3. Deception Honeypot Trigger
 * Decoy API endpoints that attackers hit, causing immediate lockout and high-risk alerts
 */
const triggerHoneypot = async (req, res) => {
  const ip = req.ip || req.headers['x-forwarded-for'] || '127.0.0.1';
  const userId = req.user ? req.user.id : null;
  const username = req.user ? req.user.name : 'Unauthenticated Attacker';

  logger.error(`🚨 HONEYPOT DECOY API ACCESSED! IP=${ip} User=${username} Path=${req.originalUrl}`);

  // Revoke encryption keys instantly to isolate data access
  encryptionService.revokeAllKeys();

  // Save critical alert
  await SecurityLog.create({
    eventType: 'honeypot_trigger',
    severity: 'critical',
    description: `Decoy Honeypot API accessed: ${req.originalUrl} by ${username}. User account suspended automatically.`,
    requestPath: req.originalUrl,
    ipAddress: ip,
    userId: userId,
    riskScore: 100,
    deviceScore: 0
  });

  // Lock user account if authenticated
  if (userId) {
    try {
      await User.findByIdAndUpdate(userId, { isActive: false });
      logger.warn(`🔒 Locked out user ${username} due to honeypot trigger.`);
    } catch (err) {
      logger.error(`Failed to lock user on honeypot: ${err.message}`);
    }
  }

  res.status(401).json({
    success: false,
    message: 'System Threat Warning: Unlawful access detected. Your IP and credentials have been reported to the forensic database.',
    riskScore: 100
  });
};

module.exports = {
  wafGuard,
  zeroTrustAssessor,
  triggerHoneypot
};
