/**
 * Request Signing Middleware
 * HMAC-based token verification to protect API endpoints
 */

const crypto = require('crypto');
const config = require('../config/env');

/**
 * Generate a signed token with timestamp
 * @returns {{ token: string, timestamp: number, expiresIn: number }}
 */
function generateToken() {
    const timestamp = Date.now();
    const payload = `${timestamp}`;
    const token = crypto
        .createHmac('sha256', config.signingSecret)
        .update(payload)
        .digest('hex');

    return {
        token,
        timestamp,
        expiresIn: config.tokenExpiryMs
    };
}

/**
 * Verify an HMAC token against the timestamp
 * @param {string} token - The HMAC token
 * @param {number} timestamp - The timestamp used to generate the token
 * @returns {boolean}
 */
function verifyToken(token, timestamp) {
    if (!token || !timestamp) return false;

    const age = Date.now() - timestamp;
    if (age > config.tokenExpiryMs || age < 0) return false;

    const expected = crypto
        .createHmac('sha256', config.signingSecret)
        .update(`${timestamp}`)
        .digest('hex');

    try {
        return crypto.timingSafeEqual(
            Buffer.from(token, 'hex'),
            Buffer.from(expected, 'hex')
        );
    } catch {
        return false;
    }
}

/**
 * Express middleware to verify signed requests
 */
function requireSignedRequest(req, res, next) {
    const token = req.headers['x-request-token'];
    const timestamp = parseInt(req.headers['x-request-timestamp'], 10);

    if (!verifyToken(token, timestamp)) {
        return res.status(403).json({
            error: { message: 'Invalid or expired request token.' }
        });
    }

    next();
}

module.exports = { generateToken, verifyToken, requireSignedRequest };
