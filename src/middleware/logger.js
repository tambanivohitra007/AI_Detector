/**
 * Logger Middleware
 * Logs incoming requests
 */

const config = require('../config/env');

/**
 * Request logger middleware
 */
function logger(req, res, next) {
    if (config.nodeEnv === 'development') {
        const timestamp = new Date().toISOString();
        console.log(`[${timestamp}] ${req.method} ${req.url}`);

        // Log request body for POST requests (excluding sensitive data)
        if (req.method === 'POST' && req.url.includes('/api/')) {
            console.log('Request body keys:', Object.keys(req.body));
        }
    }
    next();
}

module.exports = logger;
