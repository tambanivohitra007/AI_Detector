/**
 * API Routes
 * Defines all API endpoints
 */

const express = require('express');
const openaiService = require('../services/openai');

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
 * Rewrite/Humanize text endpoint
 * POST /api/rewrite
 */
router.post('/rewrite', async (req, res, next) => {
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
            rewrite: '/api/rewrite',
            status: '/api/status'
        }
    });
});

module.exports = router;
