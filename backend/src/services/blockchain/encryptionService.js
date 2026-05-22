/**
 * backend/src/services/blockchain/encryptionService.js
 * Advanced Dynamic Encryption System: Key rotation, temporary session keys,
 * split-key derivation, and emergency revocation/isolation.
 */

const crypto = require('crypto');
const logger = require('../../utils/logger');

// Store key rotation state in memory
let currentEncryptionKey = null;
let keyGenerationTime = 0;
const KEY_ROTATION_INTERVAL = 3600 * 1000; // 1 hour key rotation
let isSystemIsolated = false;

/**
 * Derives and returns the active rotated key.
 * Rotates automatically if the interval has passed.
 */
const getActiveKey = () => {
    if (isSystemIsolated) {
        throw new Error('SEC_REVOKED: Encryption system isolated due to high risk levels.');
    }

    const now = Date.now();
    if (!currentEncryptionKey || (now - keyGenerationTime) > KEY_ROTATION_INTERVAL) {
        rotateKey();
    }
    return currentEncryptionKey;
};

/**
 * Performs dynamic cryptographic key rotation.
 * Uses Key Diversification by combining the base master key,
 * a time epoch, and an entropy salt.
 */
const rotateKey = () => {
    try {
        const now = Date.now();
        const masterKey = process.env.AES_SECRET_KEY || 'fallback_key_32_chars!!!!!!!!!';
        
        // Derive key from master key + time epoch + dynamic salt
        const timeEpoch = Math.floor(now / KEY_ROTATION_INTERVAL);
        const salt = crypto.createHmac('sha256', masterKey).update(timeEpoch.toString()).digest('hex');
        
        currentEncryptionKey = crypto.scryptSync(masterKey, salt, 32); // 256-bit key
        keyGenerationTime = now;
        
        logger.info(`🔑 Dynamic Encryption: Key rotated successfully (Epoch: ${timeEpoch}).`);
    } catch (err) {
        logger.error(`Dynamic key rotation failed: ${err.message}`);
    }
};

/**
 * Emergency revocation. Revokes all active session keys instantly and blocks decryption.
 */
const revokeAllKeys = () => {
    isSystemIsolated = true;
    currentEncryptionKey = null;
    logger.error('🚨 DYNAMIC ENCRYPTION: EMERGENCY REVOCATION TRIGGERED! All database keys suspended.');
};

/**
 * Restores system from isolated state and initializes a new clean key.
 */
const restoreEncryptionSystem = () => {
    isSystemIsolated = false;
    rotateKey();
    logger.info('🛡️  DYNAMIC ENCRYPTION: Isolation lifted. Encryption keys restored and rotated.');
};

/**
 * Encrypts payload using the active dynamically-rotated key.
 */
const encryptData = (plainText) => {
    try {
        const key = getActiveKey();
        const iv = crypto.randomBytes(16);
        const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
        let encrypted = cipher.update(plainText, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        
        // Return ciphertext with IV and generation timestamp appended for decryption tracking
        return `${iv.toString('hex')}:${encrypted}:${keyGenerationTime}`;
    } catch (err) {
        logger.error(`Encryption failed: ${err.message}`);
        throw err;
    }
};

/**
 * Decrypts payload using the key matching the block's generation timestamp.
 */
const decryptData = (cipherTextWithMetadata) => {
    try {
        if (isSystemIsolated) {
            throw new Error('Access Denied: Encryption layer is currently isolated.');
        }

        const parts = cipherTextWithMetadata.split(':');
        if (parts.length !== 3) {
            throw new Error('Invalid cipher-packet format');
        }

        const iv = Buffer.from(parts[0], 'hex');
        const encrypted = parts[1];
        const epoch = Number(parts[2]);
        
        // Dynamic derivation of the specific historical key corresponding to the epoch
        const masterKey = process.env.AES_SECRET_KEY || 'fallback_key_32_chars!!!!!!!!!';
        const timeEpoch = Math.floor(epoch / KEY_ROTATION_INTERVAL);
        const salt = crypto.createHmac('sha256', masterKey).update(timeEpoch.toString()).digest('hex');
        const derivedKey = crypto.scryptSync(masterKey, salt, 32);

        const decipher = crypto.createDecipheriv('aes-256-cbc', derivedKey, iv);
        let decrypted = decipher.update(encrypted, 'hex', 'utf8');
        decrypted += decipher.final('utf8');
        
        return decrypted;
    } catch (err) {
        logger.error(`Decryption failed: ${err.message}`);
        return null;
    }
};

module.exports = {
    encryptData,
    decryptData,
    rotateKey,
    revokeAllKeys,
    restoreEncryptionSystem,
    getIsSystemIsolated: () => isSystemIsolated
};
