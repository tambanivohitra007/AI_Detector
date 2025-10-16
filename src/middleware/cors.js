/**
 * CORS Middleware Configuration
 */

const cors = require('cors');
const config = require('../config/env');

/**
 * Configure CORS options
 */
const corsOptions = {
    origin: config.allowedOrigins === '*'
        ? '*'
        : config.allowedOrigins.split(',').map(o => o.trim()),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
    maxAge: 86400 // 24 hours
};

/**
 * CORS middleware
 */
module.exports = cors(corsOptions);
