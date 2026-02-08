/**
 * API Routes
 * Defines all API endpoints
 */

const express = require('express');
const openaiService = require('../services/openai');
const { generateToken, requireSignedRequest } = require('../middleware/auth');
const { createSession, getSessionCookieOptions, safeCompare } = require('../middleware/session');
const config = require('../config/env');

const router = express.Router();

/**
 * Health check endpoint
 * GET /api/health
 */
router.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

/**
 * Login endpoint
 * POST /api/login
 */
router.post('/login', (req, res) => {
    const { username, password } = req.body || {};

    if (!config.authUsername || !config.authPassword) {
        return res.status(403).json({ error: { message: 'Admin credentials are not configured. Please use Microsoft sign-in.' } });
    }

    if (!username || !password) {
        return res.status(400).json({ error: { message: 'Username and password are required.' } });
    }

    if (safeCompare(username, config.authUsername) && safeCompare(password, config.authPassword)) {
        const token = createSession();
        res.cookie('session', token, getSessionCookieOptions());
        res.cookie('user_name', 'Admin', { path: '/', maxAge: config.sessionExpiryMs, sameSite: 'lax' });
        return res.json({ success: true });
    }

    return res.status(401).json({ error: { message: 'Invalid username or password.' } });
});

/**
 * Logout endpoint
 * POST /api/logout
 */
router.post('/logout', (req, res) => {
    res.clearCookie('session', { path: '/' });
    res.clearCookie('user_name', { path: '/' });
    res.json({ success: true });
});

/**
 * Issue a signed request token
 * GET /api/token
 */
router.get('/token', (req, res) => {
    const tokenData = generateToken();
    res.json(tokenData);
});

/**
 * Rewrite/Humanize text endpoint (requires signed token)
 * POST /api/rewrite
 */
router.post('/rewrite', requireSignedRequest, async (req, res, next) => {
    try {
        console.log('Received rewrite request');
        console.log('Model:', req.body.model);

        // Call OpenAI service
        const result = await openaiService.humanizeText(req.body);

        res.json(result);
    } catch (error) {
        // Pass error to error handler middleware
        next(error);
    }
});

/**
 * Get API status and configuration
 * GET /api/status
 */
router.get('/status', (req, res) => {
    res.json({
        status: 'operational',
        version: '1.0.0',
        endpoints: {
            health: '/api/health',
            token: '/api/token',
            rewrite: '/api/rewrite',
            status: '/api/status'
        }
    });
});

module.exports = router;
