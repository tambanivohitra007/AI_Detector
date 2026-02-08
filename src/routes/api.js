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
        const body = req.body || {};

        // Validate required fields
        if (!body.model || typeof body.model !== 'string') {
            return res.status(400).json({ error: { message: 'Invalid or missing model.' } });
        }
        if (!Array.isArray(body.messages) || body.messages.length === 0) {
            return res.status(400).json({ error: { message: 'Messages must be a non-empty array.' } });
        }
        for (const msg of body.messages) {
            if (!msg || typeof msg.role !== 'string' || typeof msg.content !== 'string') {
                return res.status(400).json({ error: { message: 'Each message must have a string role and content.' } });
            }
        }

        // Build a sanitized payload — only whitelisted fields pass through
        const sanitized = {
            model: body.model,
            messages: body.messages.map(m => ({ role: m.role, content: m.content }))
        };

        const optionalInt = ['max_completion_tokens'];
        const optionalStr = ['reasoning_effort', 'verbosity'];
        const optionalNum = ['temperature', 'top_p', 'frequency_penalty', 'presence_penalty'];

        for (const key of optionalInt) {
            if (body[key] !== undefined) {
                const val = Number(body[key]);
                if (!Number.isInteger(val) || val < 1) continue;
                sanitized[key] = val;
            }
        }
        for (const key of optionalStr) {
            if (typeof body[key] === 'string') sanitized[key] = body[key];
        }
        for (const key of optionalNum) {
            if (typeof body[key] === 'number' && isFinite(body[key])) sanitized[key] = body[key];
        }

        console.log('Received rewrite request');
        console.log('Model:', sanitized.model);

        const result = await openaiService.humanizeText(sanitized);
        res.json(result);
    } catch (error) {
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
