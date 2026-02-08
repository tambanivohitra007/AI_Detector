/**
 * CSRF Protection Middleware
 * Double-submit cookie pattern: a readable cookie is set on every response,
 * and state-changing requests must echo it back via X-CSRF-Token header.
 */

const crypto = require('crypto');

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const COOKIE_NAME = '_csrf';
const HEADER_NAME = 'x-csrf-token';

/**
 * Parse a single cookie value from the Cookie header
 */
function getCookieValue(header, name) {
    if (!header) return null;
    const match = header.split(';').find(c => c.trim().startsWith(name + '='));
    return match ? decodeURIComponent(match.split('=')[1].trim()) : null;
}

/**
 * Create CSRF middleware
 * @param {Object} options
 * @param {string[]} options.ignorePaths - paths to skip CSRF checks (e.g. webhooks)
 */
function csrfProtection({ ignorePaths = [] } = {}) {
    return (req, res, next) => {
        // Ensure a CSRF token cookie exists (set on every response if missing)
        const existing = getCookieValue(req.headers.cookie, COOKIE_NAME);
        if (!existing) {
            const token = crypto.randomBytes(24).toString('hex');
            res.cookie(COOKIE_NAME, token, {
                httpOnly: false,  // JS must be able to read it
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'lax',
                path: '/'
            });
            // Also store on req so the check below works on the very first POST
            req._csrfCookie = token;
        } else {
            req._csrfCookie = existing;
        }

        // Safe methods and ignored paths skip the check
        if (SAFE_METHODS.has(req.method) || ignorePaths.includes(req.path)) {
            return next();
        }

        // Verify the header matches the cookie
        const headerVal = req.headers[HEADER_NAME];
        if (!headerVal || headerVal !== req._csrfCookie) {
            return res.status(403).json({ error: { message: 'Invalid or missing CSRF token.' } });
        }

        next();
    };
}

module.exports = csrfProtection;
