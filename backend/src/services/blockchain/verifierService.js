/**
 * backend/src/services/blockchain/verifierService.js
 * Cryptographic state verifier: matches database content, snapshot bounds,
 * Merkle roots, and forensic chain signatures.
 */

const Result = require('../../models/Result');
const ResultSnapshot = require('../../models/ResultSnapshot');
const AuditLog = require('../../models/AuditLog');
const SecurityLog = require('../../models/SecurityLog');
const merkleService = require('./merkleService');
const hashService = require('./hashService');
const blockchainService = require('./blockchainService');
const logger = require('../../utils/logger');

/**
 * Validates the integrity of the forensic log chain.
 * Recomputes SHA-256 hashes sequentially to verify zero tampering.
 */
const verifyForensicLogChain = async () => {
    try {
        const logs = await SecurityLog.find().sort({ timestamp: 1 });
        if (logs.length <= 1) return { success: true, count: logs.length };

        let previousHash = logs[0].currentHash;
        for (let i = 1; i < logs.length; i++) {
            const current = logs[i];
            
            // Recompute the chained state hash
            const dataToHash = current.timestamp.toISOString() + 
                               current.eventType + 
                               current.severity + 
                               current.description + 
                               (current.requestPath || '') + 
                               (current.ipAddress || '') + 
                               (current.userId ? current.userId.toString() : '') + 
                               current.riskScore.toString() + 
                               current.deviceScore.toString() + 
                               previousHash;
                               
            const computedHash = require('crypto').createHash('sha256').update(dataToHash).digest('hex');
            
            if (current.previousHash !== previousHash || current.currentHash !== computedHash) {
                logger.error(`🚨 Forensic Log Chain Breach! Verification failed at index ${i}, Log ID=${current._id}`);
                return { success: false, index: i, id: current._id };
            }
            previousHash = current.currentHash;
        }
        return { success: true, count: logs.length };
    } catch (err) {
        logger.error(`Forensic chain verification failed: ${err.message}`);
        return { success: false, error: err.message };
    }
};

/**
 * Compares current collection states against sealed snapshots,
 * re-evaluates Merkle roots, and queries blockchain block heights.
 */
const verifySystemIntegrity = async () => {
    try {
        const results = await Result.find().sort({ _id: 1 });
        const snapshots = await ResultSnapshot.find().lean();
        
        let discrepancies = [];
        
        // 1. Cross-compare Results and Snapshots
        for (const resDoc of results) {
            const snap = snapshots.find(s => s.resultId.toString() === resDoc._id.toString());
            if (!snap) {
                discrepancies.push({
                    id: resDoc._id,
                    error: 'Snapshot Seal Missing: No corresponding trusted record found.'
                });
            } else {
                const scoreChanged = resDoc.score !== snap.score;
                const violationsChanged = resDoc.violationCount !== snap.violationCount;
                
                // Clean answers for exact comparison
                const cleanAns = (ans) => {
                    if (!ans || !Array.isArray(ans)) return [];
                    return ans.map(a => ({
                        questionText: a.questionText || '',
                        selectedAnswer: a.selectedAnswer || '',
                        isCorrect: !!a.isCorrect
                    }));
                };
                const answersChanged = JSON.stringify(cleanAns(resDoc.answers)) !== JSON.stringify(cleanAns(snap.answers));
                
                if (scoreChanged || violationsChanged || answersChanged) {
                    discrepancies.push({
                        id: resDoc._id,
                        error: 'Cryptographic state mismatch',
                        details: {
                            score: { current: resDoc.score, expected: snap.score },
                            violations: { current: resDoc.violationCount, expected: snap.violationCount }
                        }
                    });
                }
            }
        }
        
        // 2. Audit Merkle Roots against Blockchain
        let calculatingRoot = `0x${'0'.repeat(64)}`;
        let rootMatches = true;
        if (results.length > 0) {
            const leafHashes = results.map(r => {
                const computed = hashService.computeResultHash(r);
                return computed.startsWith('0x') ? computed : `0x${computed}`;
            });
            const tree = merkleService.createTree(leafHashes);
            calculatingRoot = tree.root;
            
            // Get last sealed audit root
            const lastAudit = await AuditLog.findOne({ status: 'verified' }).sort({ createdAt: -1 });
            if (lastAudit) {
                rootMatches = lastAudit.merkleRoot === calculatingRoot;
            }
        }
        
        // 3. Verify Forensic Log Chain
        const forensicAudit = await verifyForensicLogChain();
        
        // Fetch Ethereum block height and contract status
        let bcStats = { error: 'Offline' };
        try {
            bcStats = await blockchainService.getBlockchainStats();
        } catch (bcErr) {
            logger.warn(`Verifier Service: Could not fetch blockchain stats: ${bcErr.message}`);
        }
        
        const isHealthy = discrepancies.length === 0 && rootMatches && forensicAudit.success;
        
        return {
            isHealthy,
            verifiedRecords: results.length,
            discrepancies,
            calculatedRoot: calculatingRoot,
            rootMatches,
            forensicLogStatus: forensicAudit,
            blockchain: bcStats
        };
    } catch (err) {
        logger.error(`verifySystemIntegrity error: ${err.message}`);
        throw err;
    }
};

module.exports = {
    verifyForensicLogChain,
    verifySystemIntegrity
};
