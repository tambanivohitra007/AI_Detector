/**
 * API Routes
 * Defines all API endpoints
 */

const express = require('express');
const openaiService = require('../services/openai');
const audit = require('../services/audit');
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
        audit.log('login', { user: 'Admin', method: 'password', ip: audit.ip(req) });
        return res.json({ success: true });
    }

    audit.log('login_failed', { user: username, method: 'password', ip: audit.ip(req) });
    return res.status(401).json({ error: { message: 'Invalid username or password.' } });
});

/**
 * Logout endpoint
 * POST /api/logout
 */
router.post('/logout', (req, res) => {
    audit.log('logout', { user: audit.userName(req), ip: audit.ip(req) });
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

        // Streaming mode
        if (body.stream === true) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
            res.flushHeaders();

            const streamRes = await openaiService.makeStreamingRequest(sanitized);
            let usage = null;

            streamRes.body.on('data', (chunk) => {
                const text = chunk.toString();
                res.write(text);

                // Extract usage from the final chunk (stream_options: include_usage)
                const lines = text.split('\n').filter(l => l.startsWith('data: '));
                for (const line of lines) {
                    const data = line.slice(6);
                    if (data === '[DONE]') continue;
                    try {
                        const parsed = JSON.parse(data);
                        if (parsed.usage) usage = parsed.usage;
                    } catch { /* partial JSON, skip */ }
                }
            });

            streamRes.body.on('end', () => {
                audit.log('rewrite', {
                    user: audit.userName(req),
                    ip: audit.ip(req),
                    model: sanitized.model,
                    stream: true,
                    prompt_tokens: usage?.prompt_tokens,
                    completion_tokens: usage?.completion_tokens,
                    total_tokens: usage?.total_tokens
                });
                res.end();
            });

            streamRes.body.on('error', (err) => {
                console.error('Stream error:', err);
                res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
                res.end();
            });

            // Handle client disconnect
            req.on('close', () => {
                streamRes.body.destroy();
            });

            return;
        }

        // Non-streaming mode
        const result = await openaiService.humanizeText(sanitized);

        audit.log('rewrite', {
            user: audit.userName(req),
            ip: audit.ip(req),
            model: sanitized.model,
            prompt_tokens: result.usage?.prompt_tokens,
            completion_tokens: result.usage?.completion_tokens,
            total_tokens: result.usage?.total_tokens
        });

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
