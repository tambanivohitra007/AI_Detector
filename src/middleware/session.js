/**
 * Session Middleware
 * Cookie-based session management with HMAC-signed tokens
 */

const crypto = require('crypto');
const config = require('../config/env');

const PUBLIC_PATHS = ['/api/login', '/api/logout', '/api/health', '/login'];

/**
 * Parse cookies from the Cookie header
 * @param {string} header - Raw Cookie header
 * @returns {Object}
 */
function parseCookies(header) {
    const cookies = {};
    if (!header) return cookies;
    header.split(';').forEach(pair => {
        const idx = pair.indexOf('=');
        if (idx < 0) return;
        const key = pair.substring(0, idx).trim();
        const val = pair.substring(idx + 1).trim();
        cookies[key] = decodeURIComponent(val);
    });
    return cookies;
}

/**
 * Create a signed session token
 * @returns {string} token in format "timestamp.hmac"
 */
function createSession() {
    const ts = Date.now();
    const sig = crypto
        .createHmac('sha256', config.signingSecret)
        .update(`session:${ts}`)
        .digest('hex');
    return `${ts}.${sig}`;
}

/**
 * Verify a session token
 * @param {string} token
 * @returns {boolean}
 */
function isValidSession(token) {
    if (!token || typeof token !== 'string') return false;
    const dot = token.indexOf('.');
    if (dot < 0) return false;

    const ts = parseInt(token.substring(0, dot), 10);
    const sig = token.substring(dot + 1);

    if (isNaN(ts) || Date.now() - ts > config.sessionExpiryMs) return false;

    const expected = crypto
        .createHmac('sha256', config.signingSecret)
        .update(`session:${ts}`)
        .digest('hex');

    try {
        return crypto.timingSafeEqual(
            Buffer.from(sig, 'hex'),
            Buffer.from(expected, 'hex')
        );
    } catch {
        return false;
    }
}

/**
 * Get cookie options for the session cookie
 * @returns {Object}
 */
function getSessionCookieOptions() {
    return {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        maxAge: config.sessionExpiryMs,
        path: '/'
    };
}

/**
 * Timing-safe credential comparison
 * @param {string} a
 * @param {string} b
 * @returns {boolean}
 */
function safeCompare(a, b) {
    const bufA = Buffer.from(String(a));
    const bufB = Buffer.from(String(b));
    if (bufA.length !== bufB.length) {
        crypto.timingSafeEqual(bufA, bufA);
        return false;
    }
    return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Express middleware — require a valid session for protected routes
 */
function requireAuth(req, res, next) {
    if (PUBLIC_PATHS.includes(req.path)) return next();

    // Allow static assets through (CSS, JS, images, fonts)
    if (/\.(css|js|png|jpg|jpeg|gif|svg|ico|woff2?|ttf|eot|map)$/.test(req.path)) {
        return next();
    }

    const cookies = parseCookies(req.headers.cookie);
    if (isValidSession(cookies.session)) return next();

    if (req.path.startsWith('/api/')) {
        return res.status(401).json({ error: { message: 'Authentication required.' } });
    }

    return res.redirect('/login');
}

module.exports = {
    parseCookies,
    createSession,
    isValidSession,
    getSessionCookieOptions,
    safeCompare,
    requireAuth
};
