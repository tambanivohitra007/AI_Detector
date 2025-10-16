/**
 * Backend Proxy Server for OpenAI API
 * Handles CORS and keeps API key secure
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// Configuration
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_API_URL = "https://api.openai.com/v1/chat/completions";
const ALLOWED_ORIGINS = process.env.ALLOWED_ORIGINS || '*';

// Validate API key
if (!OPENAI_API_KEY) {
    console.error('ERROR: OPENAI_API_KEY is not set in environment variables!');
    process.exit(1);
}

// Middleware - order matters!
app.use(cors({
    origin: ALLOWED_ORIGINS === '*' ? '*' : ALLOWED_ORIGINS.split(','),
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type']
}));
app.use(express.json({ limit: '10mb' }));

// Logging middleware (only in development)
if (NODE_ENV === 'development') {
    app.use((req, res, next) => {
        console.log(`${req.method} ${req.url}`);
        next();
    });
}

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Proxy endpoint
app.post('/api/rewrite', async (req, res) => {
    console.log('Received rewrite request');
    console.log('Payload model:', req.body.model);
    try {
        const response = await fetch(OPENAI_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            body: JSON.stringify(req.body)
        });

        const data = await response.json();

        if (response.ok) {
            res.json(data);
        } else {
            res.status(response.status).json(data);
        }
    } catch (error) {
        console.error('Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Serve static files AFTER API routes
app.use(express.static('.'));

// Catch-all for undefined routes
app.use((req, res) => {
    console.log('404:', req.method, req.url);
    res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`Network access: http://10.0.1.101:${PORT}`);
    console.log(`API endpoint: http://10.0.1.101:${PORT}/api/rewrite`);
    console.log(`Health check: http://10.0.1.101:${PORT}/api/health`);
});
