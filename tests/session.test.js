/**
 * Tests for session middleware: parseCookies, createSession, isValidSession, safeCompare
 */

const { parseCookies, createSession, isValidSession, safeCompare } = require('../src/middleware/session');

describe('parseCookies', () => {
    test('returns empty object for no header', () => {
        expect(parseCookies(undefined)).toEqual({});
        expect(parseCookies(null)).toEqual({});
        expect(parseCookies('')).toEqual({});
    });

    test('parses a single cookie', () => {
        expect(parseCookies('session=abc123')).toEqual({ session: 'abc123' });
    });

    test('parses multiple cookies', () => {
        const result = parseCookies('session=abc; user_name=Admin; _csrf=tok');
        expect(result).toEqual({ session: 'abc', user_name: 'Admin', _csrf: 'tok' });
    });

    test('decodes URI-encoded values', () => {
        expect(parseCookies('name=hello%20world')).toEqual({ name: 'hello world' });
    });

    test('handles cookie with = in value', () => {
        const result = parseCookies('token=abc=def');
        expect(result.token).toBe('abc=def');
    });
});

describe('createSession / isValidSession', () => {
    test('creates a token that is immediately valid', () => {
        const token = createSession();
        expect(typeof token).toBe('string');
        expect(token).toMatch(/^\d+\.[a-f0-9]+$/);
        expect(isValidSession(token)).toBe(true);
    });

    test('rejects null, undefined, empty, and non-string', () => {
        expect(isValidSession(null)).toBe(false);
        expect(isValidSession(undefined)).toBe(false);
        expect(isValidSession('')).toBe(false);
        expect(isValidSession(12345)).toBe(false);
    });

    test('rejects token without a dot', () => {
        expect(isValidSession('nodot')).toBe(false);
    });

    test('rejects token with a tampered signature', () => {
        const token = createSession();
        const [ts] = token.split('.');
        expect(isValidSession(`${ts}.0000000000000000000000000000000000000000000000000000000000000000`)).toBe(false);
    });

    test('rejects token with a tampered timestamp', () => {
        const token = createSession();
        const [, sig] = token.split('.');
        expect(isValidSession(`1.${sig}`)).toBe(false);
    });

    test('rejects expired token', () => {
        // Create a token with a timestamp far in the past
        const crypto = require('crypto');
        const config = require('../src/config/env');
        const oldTs = Date.now() - config.sessionExpiryMs - 1000;
        const sig = crypto
            .createHmac('sha256', config.signingSecret)
            .update(`session:${oldTs}`)
            .digest('hex');
        expect(isValidSession(`${oldTs}.${sig}`)).toBe(false);
    });
});

describe('safeCompare', () => {
    test('returns true for identical strings', () => {
        expect(safeCompare('hello', 'hello')).toBe(true);
    });

    test('returns false for different strings', () => {
        expect(safeCompare('hello', 'world')).toBe(false);
    });

    test('returns false for different lengths', () => {
        expect(safeCompare('short', 'muchlongerstring')).toBe(false);
    });

    test('returns true for empty strings', () => {
        expect(safeCompare('', '')).toBe(true);
    });

    test('handles non-string inputs gracefully', () => {
        expect(safeCompare(123, '123')).toBe(true);
        expect(safeCompare(null, 'null')).toBe(true);
        expect(safeCompare(undefined, 'something')).toBe(false);
    });
});
