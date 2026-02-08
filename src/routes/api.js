/**
 * API Routes
 * Defines all API endpoints
 */

const express = require('express');
const openaiService = require('../services/openai');
const { generateToken, requireSignedRequest } = require('../middleware/auth');

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
