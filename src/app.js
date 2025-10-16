/**
 * Express Application Setup
 * Configures Express app with middleware and routes
 */

const express = require('express');
const path = require('path');
const corsMiddleware = require('./middleware/cors');
const logger = require('./middleware/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const apiRoutes = require('./routes/api');
const config = require('./config/env');

/**
 * Create and configure Express application
 */
function createApp() {
    const app = express();

    // Trust proxy (important for deployment behind reverse proxies)
    app.set('trust proxy', 1);

    // Apply middleware in order
    app.use(corsMiddleware);
    app.use(express.json({ limit: config.requestSizeLimit }));
    app.use(express.urlencoded({ extended: true, limit: config.requestSizeLimit }));
    app.use(logger);

    // API Routes
    app.use('/api', apiRoutes);

    // Serve static files from public directory
    const publicPath = path.join(__dirname, '..', 'public');
    app.use(express.static(publicPath));

    // Serve index.html for root route
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
