/**
 * Environment Configuration
 * Loads and validates environment variables
 */

require('dotenv').config();
const crypto = require('crypto');

/**
 * Validate required environment variables
 */
function validateEnv() {
    const required = ['OPENAI_API_KEY', 'AUTH_USERNAME', 'AUTH_PASSWORD'];
    const missing = required.filter(key => !process.env[key]);

    if (missing.length > 0) {
        console.error(`ERROR: Missing required environment variables: ${missing.join(', ')}`);
        process.exit(1);
    }
}

// Validate on module load
validateEnv();

/**
 * Application configuration
 */
const config = {
    // Server
    port: process.env.PORT || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',

    // OpenAI
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiApiUrl: process.env.OPENAI_API_URL || 'https://api.openai.com/v1/chat/completions',

    // CORS
    allowedOrigins: process.env.ALLOWED_ORIGINS || '*',

    // Request limits
    requestSizeLimit: process.env.REQUEST_SIZE_LIMIT || '10mb',
    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT || '60000', 10),

    // Authentication
    authUsername: process.env.AUTH_USERNAME,
    authPassword: process.env.AUTH_PASSWORD,
    sessionExpiryMs: parseInt(process.env.SESSION_EXPIRY_MS || '86400000', 10), // 24 hours

    // Request signing
    signingSecret: process.env.SIGNING_SECRET || crypto.randomBytes(32).toString('hex'),
    tokenExpiryMs: parseInt(process.env.TOKEN_EXPIRY_MS || '900000', 10), // 15 minutes

    // Logging
    logLevel: process.env.LOG_LEVEL || 'info'
};

module.exports = config;
