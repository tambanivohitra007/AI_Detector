/**
 * Express Application Setup
 * Configures Express app with middleware and routes
 */

const express = require('express');
const path = require('path');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const corsMiddleware = require('./middleware/cors');
const csrfProtection = require('./middleware/csrf');
const logger = require('./middleware/logger');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requireAuth, parseCookies, isValidSession } = require('./middleware/session');
const apiRoutes = require('./routes/api');
const authRoutes = require('./routes/auth');
const documentRoutes = require('./routes/document');
const config = require('./config/env');

/**
 * Create and configure Express application
 */
function createApp() {
    const app = express();
    const publicPath = path.join(__dirname, '..', 'public');

    // Trust proxy (important for deployment behind reverse proxies)
    app.set('trust proxy', 1);

    // Security headers
    app.use(helmet({
        contentSecurityPolicy: {
            directives: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.tailwindcss.com"],
                styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                fontSrc: ["'self'", "https://fonts.gstatic.com"],
                imgSrc: ["'self'", "data:"],
                connectSrc: ["'self'"]
            }
        }
    }));

    // Apply middleware in order
    app.use(corsMiddleware);
    app.use(express.json({ limit: config.requestSizeLimit }));
    app.use(express.urlencoded({ extended: true, limit: config.requestSizeLimit }));
    app.use(logger);
    app.use(csrfProtection({ ignorePaths: ['/api/health'] }));

    // Rate limiters
    const loginLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 10,                   // 10 attempts per window
        message: { error: { message: 'Too many login attempts. Please try again later.' } },
        standardHeaders: true,
        legacyHeaders: false
    });

    const apiLimiter = rateLimit({
        windowMs: 60 * 1000,  // 1 minute
        max: 20,               // 20 requests per minute
        message: { error: { message: 'Too many requests. Please slow down.' } },
        standardHeaders: true,
        legacyHeaders: false
    });

    // Login page (public — redirect to / if already authenticated)
    app.get('/login', (req, res) => {
        const cookies = parseCookies(req.headers.cookie);
        if (isValidSession(cookies.session)) return res.redirect('/');
        res.sendFile(path.join(publicPath, 'login.html'));
    });

    // OAuth routes (public — before auth gate)
    app.use('/auth', authRoutes);

    const documentLimiter = rateLimit({
        windowMs: 60 * 1000,  // 1 minute
        max: 5,                // 5 document humanizations per minute
        message: { error: { message: 'Too many document requests. Please slow down.' } },
        standardHeaders: true,
        legacyHeaders: false
    });

    // Apply rate limiters to specific routes
    app.use('/api/login', loginLimiter);
    app.use('/api/rewrite', apiLimiter);
    app.use('/api/document/humanize', documentLimiter);

    // Auth gate — everything below requires a valid session
    app.use(requireAuth);

    // API Routes (protected)
    app.use('/api', apiRoutes);
    app.use('/api/document', documentRoutes);

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
