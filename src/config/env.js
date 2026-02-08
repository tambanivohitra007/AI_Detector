/**
 * Environment Configuration
 * Loads and validates environment variables
 */

require('dotenv').config();
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

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

    // If any Microsoft OAuth credential is set, all three must be set
    const msKeys = ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET', 'MICROSOFT_REDIRECT_URI'];
    const msSet = msKeys.filter(key => process.env[key]);
    if (msSet.length > 0 && msSet.length < 3) {
        const msMissing = msKeys.filter(key => !process.env[key]);
        console.error(`ERROR: Incomplete Microsoft OAuth config. Missing: ${msMissing.join(', ')}`);
        process.exit(1);
    }

    // Warn if neither auth method is fully configured
    const hasPassword = process.env.AUTH_USERNAME && process.env.AUTH_PASSWORD;
    const hasMicrosoft = msSet.length === 3;
    if (!hasPassword && !hasMicrosoft) {
        console.warn('WARNING: No authentication method configured. Set AUTH_USERNAME/AUTH_PASSWORD or Microsoft OAuth credentials.');
    }
}

// Validate on module load
validateEnv();

/**
 * Read or create a persistent signing secret so sessions survive restarts.
 * Falls back to a random ephemeral secret if the file can't be written.
 */
function getOrCreateSigningSecret() {
    const secretPath = path.join(__dirname, '..', '..', '.signing-secret');
    try {
        return fs.readFileSync(secretPath, 'utf8').trim();
    } catch {
        // File doesn't exist — generate and persist
        const secret = crypto.randomBytes(32).toString('hex');
        try {
            fs.writeFileSync(secretPath, secret, { mode: 0o600 });
            console.log('Generated signing secret and saved to .signing-secret (add this file to .gitignore)');
        } catch {
            console.warn('WARNING: Could not persist signing secret. Sessions will be lost on restart. Set SIGNING_SECRET in .env.');
        }
        return secret;
    }
}

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
    authUsername: process.env.AUTH_USERNAME || '',
    authPassword: process.env.AUTH_PASSWORD || '',
    sessionExpiryMs: parseInt(process.env.SESSION_EXPIRY_MS || '86400000', 10), // 24 hours

    // Microsoft OAuth
    microsoftClientId: process.env.MICROSOFT_CLIENT_ID || '',
    microsoftClientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    microsoftRedirectUri: process.env.MICROSOFT_REDIRECT_URI || '',
    microsoftTenant: process.env.MICROSOFT_TENANT || 'organizations',
    allowedEmailDomain: process.env.ALLOWED_EMAIL_DOMAIN || 'apiu.edu',

    // Request signing
    signingSecret: process.env.SIGNING_SECRET || getOrCreateSigningSecret(),
    tokenExpiryMs: parseInt(process.env.TOKEN_EXPIRY_MS || '900000', 10), // 15 minutes

    // Logging
    logLevel: process.env.LOG_LEVEL || 'info'
};

module.exports = config;
