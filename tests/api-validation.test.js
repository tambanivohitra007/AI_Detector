/**
 * Tests for /api/rewrite input validation and /api/login auth logic.
 * Uses a real Express app instance with mocked OpenAI service.
 */

const express = require('express');
const request = require('./helpers/request');

/** Minimal app that mounts only the API router with CSRF disabled */
function createTestApp() {
    // Mock the openai service before requiring api routes
    jest.resetModules();

    // Mock openai to avoid real API calls
    jest.mock('../src/services/openai', () => ({
        humanizeText: jest.fn().mockResolvedValue({
            choices: [{ message: { content: 'humanized text' } }],
            usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 }
        }),
        validatePayload: jest.fn().mockReturnValue({ valid: true })
    }));

    // Mock auth middleware to skip signing verification in tests
    jest.mock('../src/middleware/auth', () => ({
        generateToken: () => ({ token: 'test', timestamp: Date.now(), expiresIn: 900000 }),
        requireSignedRequest: (req, res, next) => next()
    }));

    const apiRoutes = require('../src/routes/api');

    const app = express();
    app.use(express.json());
    app.use('/api', apiRoutes);
    return app;
}

describe('POST /api/rewrite — input validation', () => {
    let app;

    beforeAll(() => {
        app = createTestApp();
    });

    test('rejects missing model', async () => {
        const res = await request(app, 'POST', '/api/rewrite', {
            messages: [{ role: 'user', content: 'hello' }]
        });
        expect(res.status).toBe(400);
        expect(res.body.error.message).toMatch(/model/i);
    });

    test('rejects non-string model', async () => {
        const res = await request(app, 'POST', '/api/rewrite', {
            model: 123,
            messages: [{ role: 'user', content: 'hello' }]
        });
        expect(res.status).toBe(400);
    });

    test('rejects missing messages', async () => {
        const res = await request(app, 'POST', '/api/rewrite', {
            model: 'gpt-5'
        });
        expect(res.status).toBe(400);
        expect(res.body.error.message).toMatch(/messages/i);
    });

    test('rejects empty messages array', async () => {
        const res = await request(app, 'POST', '/api/rewrite', {
            model: 'gpt-5',
            messages: []
        });
        expect(res.status).toBe(400);
    });

    test('rejects messages with missing role', async () => {
        const res = await request(app, 'POST', '/api/rewrite', {
            model: 'gpt-5',
            messages: [{ content: 'hello' }]
        });
        expect(res.status).toBe(400);
        expect(res.body.error.message).toMatch(/role/i);
    });

    test('rejects messages with non-string content', async () => {
        const res = await request(app, 'POST', '/api/rewrite', {
            model: 'gpt-5',
            messages: [{ role: 'user', content: 123 }]
        });
        expect(res.status).toBe(400);
    });

    test('accepts valid payload and returns result', async () => {
        const res = await request(app, 'POST', '/api/rewrite', {
            model: 'gpt-5',
            messages: [{ role: 'user', content: 'hello world' }],
            temperature: 1.2,
            max_completion_tokens: 8192
        });
        expect(res.status).toBe(200);
        expect(res.body.choices).toBeDefined();
    });

    test('strips unknown fields from payload', async () => {
        const openaiService = require('../src/services/openai');
        openaiService.humanizeText.mockClear();

        await request(app, 'POST', '/api/rewrite', {
            model: 'gpt-5',
            messages: [{ role: 'user', content: 'hello' }],
            evil_field: 'should be stripped',
            api_key: 'steal_me'
        });

        const passedPayload = openaiService.humanizeText.mock.calls[0][0];
        expect(passedPayload.evil_field).toBeUndefined();
        expect(passedPayload.api_key).toBeUndefined();
        expect(passedPayload.model).toBe('gpt-5');
    });
});

describe('POST /api/login', () => {
    let app;

    beforeAll(() => {
        app = createTestApp();
    });

    test('rejects empty body', async () => {
        const res = await request(app, 'POST', '/api/login', {});
        expect(res.status).toBeGreaterThanOrEqual(400);
    });

    test('rejects wrong credentials', async () => {
        const res = await request(app, 'POST', '/api/login', {
            username: 'wrong',
            password: 'wrong'
        });
        expect([401, 403]).toContain(res.status);
    });
});
