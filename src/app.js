/**
 * Express Application Setup
 * Configures Express app with middleware and routes
 */

const express = require('express');
const path = require('path');
const corsMiddleware = require('./middleware/cors');
const logger = require('./middleware/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requireAuth, parseCookies, isValidSession } = require('./middleware/session');
const apiRoutes = require('./routes/api');
const config = require('./config/env');

/**
 * Create and configure Express application
 */
function createApp() {
    const app = express();
    const publicPath = path.join(__dirname, '..', 'public');

    // Trust proxy (important for deployment behind reverse proxies)
    app.set('trust proxy', 1);

    // Apply middleware in order
    app.use(corsMiddleware);
    app.use(express.json({ limit: config.requestSizeLimit }));
    app.use(express.urlencoded({ extended: true, limit: config.requestSizeLimit }));
    app.use(logger);

    // Login page (public — redirect to / if already authenticated)
    app.get('/login', (req, res) => {
        const cookies = parseCookies(req.headers.cookie);
        if (isValidSession(cookies.session)) return res.redirect('/');
        res.sendFile(path.join(publicPath, 'login.html'));
    });

    // Auth gate — everything below requires a valid session
    app.use(requireAuth);

    // API Routes (protected)
    app.use('/api', apiRoutes);

    // Serve static files from public directory (protected)
    app.use(express.static(publicPath));

    // Serve index.html for root route (protected)
    app.get('/', (req, res) => {
        res.sendFile(path.join(publicPath, 'index.html'));
    });

    // 404 handler for undefined routes
    app.use(notFoundHandler);

    // Global error handler (must be last)
    app.use(errorHandler);

    return app;
}

module.exports = createApp;
