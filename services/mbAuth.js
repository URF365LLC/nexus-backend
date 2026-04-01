'use strict';
require('dotenv').config();
const axios = require('axios');
const { db } = require('./db');

const MB_BASE_URL  = process.env.MB_BASE_URL || 'https://api.maxbounty.com/affiliates/api';
const TOKEN_TTL_MS = 110 * 60 * 1000; // refresh at 110 min (MB expires at 120 min)
const SERVICE      = 'maxbounty';
const LABEL        = 'api_token';

// H5 — In-memory cache to avoid a DB round-trip on every MB API call
let _cache = { token: null, issuedAt: null };
function _cacheIsValid() {
    return _cache.token && _cache.issuedAt && (Date.now() - _cache.issuedAt) < TOKEN_TTL_MS;
}

async function _fetchFresh() {
    const email    = process.env.MAXBOUNTY_USERNAME;
    const password = process.env.MAXBOUNTY_PASSWORD;

    if (!email || !password) {
        throw new Error('[MBAuth] MAXBOUNTY_USERNAME or MAXBOUNTY_PASSWORD not set');
    }

    console.log('[MBAuth] Fetching fresh token from MaxBounty...');

    const res = await axios.post(
        `${MB_BASE_URL}/authentication`,
        { email, password },
        { headers: { 'Content-Type': 'application/json' }, timeout: 12000 }
    );

    const data = res.data;
    if (!data.success || !data['mb-api-token']) {
        throw new Error('[MBAuth] Authentication failed — mb-api-token not returned');
    }

    const token    = data['mb-api-token'];
    const issuedAt = Date.now();
    const expiresAt = new Date(issuedAt + TOKEN_TTL_MS);

    // H4 — Persist to DB so token survives process restarts
    await db.run(`
        INSERT INTO sys_api_credentials (service, label, access_token, expires_at, is_active, auto_refresh_enabled)
        VALUES ($1, $2, $3, $4, TRUE, TRUE)
        ON CONFLICT (service, label) DO UPDATE
          SET access_token = EXCLUDED.access_token,
              expires_at   = EXCLUDED.expires_at,
              last_used_at = NOW(),
              updated_at   = NOW()
    `, [SERVICE, LABEL, token, expiresAt.toISOString()]);

    // Update in-memory cache
    _cache = { token, issuedAt };

    console.log(`[MBAuth] Token refreshed and persisted. Valid for ~${Math.round(TOKEN_TTL_MS / 60000)} min.`);
    return token;
}

async function getToken() {
    // 1. In-memory cache (fastest path)
    if (_cacheIsValid()) return _cache.token;

    // 2. Check DB for a still-valid persisted token (survives restarts, H4)
    try {
        const cred = await db.get(
            `SELECT access_token, expires_at FROM sys_api_credentials
             WHERE service = $1 AND label = $2 AND is_active = TRUE`,
            [SERVICE, LABEL]
        );
        if (cred?.access_token && cred?.expires_at) {
            const expiresAt = new Date(cred.expires_at).getTime();
            if (Date.now() < expiresAt) {
                _cache = { token: cred.access_token, issuedAt: expiresAt - TOKEN_TTL_MS };
                return cred.access_token;
            }
        }
    } catch (_) { /* DB unavailable — fall through to fresh fetch */ }

    // 3. Fetch fresh token
    return _fetchFresh();
}

async function forceRefresh() {
    _cache = { token: null, issuedAt: null };
    return _fetchFresh();
}

function getTokenAge() {
    if (!_cache.issuedAt) return null;
    return Math.round((Date.now() - _cache.issuedAt) / 1000);
}

module.exports = { getToken, forceRefresh, getTokenAge };
