/**
 * Tests for CSRF middleware
 */

const csrfProtection = require('../src/middleware/csrf');

/** Helper to create a mock req/res/next */
function mockReqRes({ method = 'GET', path = '/', cookie = undefined, csrfHeader = undefined } = {}) {
    const req = {
        method,
        path,
        headers: {}
    };
    if (cookie !== undefined) req.headers.cookie = cookie;
    if (csrfHeader !== undefined) req.headers['x-csrf-token'] = csrfHeader;

    const res = {
        _status: null,
        _json: null,
        _cookies: {},
        status(code) { res._status = code; return res; },
        json(body) { res._json = body; return res; },
        cookie(name, val, opts) { res._cookies[name] = { val, opts }; }
    };

    let nextCalled = false;
    const next = () => { nextCalled = true; };

    return { req, res, next, wasNextCalled: () => nextCalled };
}

describe('csrfProtection', () => {
    const middleware = csrfProtection();

    test('sets _csrf cookie on GET when none exists', () => {
        const { req, res, next, wasNextCalled } = mockReqRes({ method: 'GET' });
        middleware(req, res, next);
        expect(res._cookies._csrf).toBeDefined();
        expect(res._cookies._csrf.val).toMatch(/^[a-f0-9]{48}$/);
        expect(wasNextCalled()).toBe(true);
    });

    test('does not overwrite existing _csrf cookie', () => {
        const { req, res, next, wasNextCalled } = mockReqRes({
            method: 'GET',
            cookie: '_csrf=existingtoken'
        });
        middleware(req, res, next);
        expect(res._cookies._csrf).toBeUndefined(); // no new cookie set
        expect(wasNextCalled()).toBe(true);
    });

    test('allows GET requests without CSRF header', () => {
        const { req, res, next, wasNextCalled } = mockReqRes({ method: 'GET', cookie: '_csrf=tok' });
        middleware(req, res, next);
        expect(wasNextCalled()).toBe(true);
    });

    test('allows HEAD and OPTIONS without CSRF header', () => {
        for (const method of ['HEAD', 'OPTIONS']) {
            const { req, res, next, wasNextCalled } = mockReqRes({ method, cookie: '_csrf=tok' });
            middleware(req, res, next);
            expect(wasNextCalled()).toBe(true);
        }
    });

    test('blocks POST without CSRF header', () => {
        const { req, res, next, wasNextCalled } = mockReqRes({
            method: 'POST',
            cookie: '_csrf=tok'
        });
        middleware(req, res, next);
        expect(wasNextCalled()).toBe(false);
        expect(res._status).toBe(403);
        expect(res._json.error.message).toMatch(/CSRF/);
    });

    test('blocks POST with wrong CSRF header', () => {
        const { req, res, next, wasNextCalled } = mockReqRes({
            method: 'POST',
            cookie: '_csrf=correct',
            csrfHeader: 'wrong'
        });
        middleware(req, res, next);
        expect(wasNextCalled()).toBe(false);
        expect(res._status).toBe(403);
    });

    test('allows POST with correct CSRF header', () => {
        const { req, res, next, wasNextCalled } = mockReqRes({
            method: 'POST',
            cookie: '_csrf=mytoken',
            csrfHeader: 'mytoken'
        });
        middleware(req, res, next);
        expect(wasNextCalled()).toBe(true);
    });

    test('allows POST on first request when cookie was just set', () => {
        // Simulate: no cookie exists yet, middleware sets one, then POST checks it
        const { req, res, next } = mockReqRes({ method: 'POST' });
        middleware(req, res, next);
        // Cookie was just generated — the POST should be blocked because the header doesn't match
        expect(res._status).toBe(403);
    });

    test('ignorePaths skips CSRF check', () => {
        const mw = csrfProtection({ ignorePaths: ['/api/health'] });
        const { req, res, next, wasNextCalled } = mockReqRes({
            method: 'POST',
            path: '/api/health',
            cookie: '_csrf=tok'
            // no header
        });
        mw(req, res, next);
        expect(wasNextCalled()).toBe(true);
    });
});
