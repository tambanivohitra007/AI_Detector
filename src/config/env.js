/**
 * Environment Configuration
 * Loads and validates environment variables
 */

require('dotenv').config();

/**
 * Validate required environment variables
 */
function validateEnv() {
    const required = ['OPENAI_API_KEY'];
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

    // Logging
    logLevel: process.env.LOG_LEVEL || 'info'
};

module.exports = config;
