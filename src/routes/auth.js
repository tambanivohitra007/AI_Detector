/**
 * Microsoft OAuth Routes
 * Handles "Sign in with Microsoft" via OAuth 2.0 Authorization Code flow
 */

const express = require('express');
const crypto = require('crypto');
const fetch = require('node-fetch');
const config = require('../config/env');
const { createSession, getSessionCookieOptions } = require('../middleware/session');

const router = express.Router();

/**
 * Decode the payload segment of a JWT (base64url → JSON)
 * Safe because the token was received directly over HTTPS from Microsoft.
 */
function decodeJWT(token) {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid JWT format');
    const payload = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
}

/**
 * Parse cookies from the Cookie header
 */
function parseCookies(header) {
    const cookies = {};
    if (!header) return cookies;
    header.split(';').forEach(pair => {
        const idx = pair.indexOf('=');
        if (idx < 0) return;
        const key = pair.substring(0, idx).trim();
        const val = pair.substring(idx + 1).trim();
        cookies[key] = decodeURIComponent(val);
    });
    return cookies;
}

/**
 * GET /auth/microsoft
 * Start the OAuth flow — redirect to Microsoft authorize endpoint
 */
router.get('/microsoft', (req, res) => {
    if (!config.microsoftClientId) {
        return res.redirect('/login?error=Microsoft+sign-in+is+not+configured');
    }

    const state = crypto.randomBytes(20).toString('hex');

    res.cookie('oauth_state', state, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        maxAge: 10 * 60 * 1000, // 10 minutes
        path: '/'
    });

    const params = new URLSearchParams({
        client_id: config.microsoftClientId,
        response_type: 'code',
        redirect_uri: config.microsoftRedirectUri,
        scope: 'openid email profile',
        response_mode: 'query',
        state
    });

    const authorizeUrl = `https://login.microsoftonline.com/${config.microsoftTenant}/oauth2/v2.0/authorize?${params}`;
    res.redirect(authorizeUrl);
});

/**
 * GET /auth/microsoft/callback
 * Exchange authorization code for tokens, validate email, create session
 */
router.get('/microsoft/callback', async (req, res) => {
    try {
        const { code, state, error: oauthError, error_description } = req.query;

        // Microsoft may return an error directly
        if (oauthError) {
            const msg = error_description || oauthError;
            return res.redirect(`/login?error=${encodeURIComponent(msg)}`);
        }

        if (!code || !state) {
            return res.redirect('/login?error=Missing+authorization+code+or+state');
        }

        // Verify state matches what we stored
        const cookies = parseCookies(req.headers.cookie);
        if (!cookies.oauth_state || cookies.oauth_state !== state) {
            return res.redirect('/login?error=Invalid+OAuth+state.+Please+try+again.');
        }

        // Clear the state cookie
        res.clearCookie('oauth_state', { path: '/' });

        // Exchange code for tokens
        const tokenUrl = `https://login.microsoftonline.com/${config.microsoftTenant}/oauth2/v2.0/token`;
        const tokenRes = await fetch(tokenUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                client_id: config.microsoftClientId,
                client_secret: config.microsoftClientSecret,
                code,
                redirect_uri: config.microsoftRedirectUri,
                grant_type: 'authorization_code'
            })
        });

        const tokenData = await tokenRes.json();

        if (!tokenRes.ok || !tokenData.id_token) {
            const msg = tokenData.error_description || tokenData.error || 'Token exchange failed';
            return res.redirect(`/login?error=${encodeURIComponent(msg)}`);
        }

        // Decode the ID token to get user info
        const claims = decodeJWT(tokenData.id_token);
        const email = (claims.email || claims.preferred_username || '').toLowerCase();

        if (!email) {
            return res.redirect('/login?error=No+email+found+in+Microsoft+account');
        }

        // Validate email domain
        if (config.allowedEmailDomain && !email.endsWith(`@${config.allowedEmailDomain}`)) {
            return res.redirect(`/login?error=${encodeURIComponent(`Only @${config.allowedEmailDomain} accounts are allowed`)}`);
        }

        // Create session and redirect to app
        const displayName = claims.name || email.split('@')[0];
        const token = createSession();
        res.cookie('session', token, getSessionCookieOptions());
        res.cookie('user_name', displayName, { path: '/', maxAge: config.sessionExpiryMs, sameSite: 'lax' });
        res.redirect('/');
    } catch (err) {
        console.error('Microsoft OAuth callback error:', err);
        res.redirect('/login?error=Authentication+failed.+Please+try+again.');
    }
});

module.exports = router;
