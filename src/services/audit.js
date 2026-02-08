/**
 * Audit Logger
 * Writes JSON-lines to logs/audit.log for tracking user actions.
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', '..', 'logs');
const LOG_FILE = path.join(LOG_DIR, 'audit.log');

// Ensure logs directory exists
try { fs.mkdirSync(LOG_DIR, { recursive: true }); } catch { /* ignore */ }

/**
 * Append a JSON line to the audit log (non-blocking).
 * @param {string} event - Event type (login, login_failed, logout, rewrite, oauth_login, oauth_denied)
 * @param {Object} details - Event-specific data
 */
function log(event, details = {}) {
    const entry = {
        ts: new Date().toISOString(),
        event,
        ...details
    };

    const line = JSON.stringify(entry) + '\n';

    fs.appendFile(LOG_FILE, line, (err) => {
        if (err) console.error('Audit log write failed:', err.message);
    });
}

/**
 * Read the client IP from the request, respecting trust proxy.
 * @param {import('express').Request} req
 * @returns {string}
 */
function ip(req) {
    return req.ip || req.connection?.remoteAddress || 'unknown';
}

/**
 * Read the display name from the user_name cookie.
 * @param {import('express').Request} req
 * @returns {string}
 */
function userName(req) {
    const header = req.headers.cookie || '';
    const match = header.split(';').find(c => c.trim().startsWith('user_name='));
    return match ? decodeURIComponent(match.split('=')[1].trim()) : 'unknown';
}

module.exports = { log, ip, userName };
