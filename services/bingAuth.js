'use strict';
require('dotenv').config();
const https = require('https');
const { db } = require('./db');

/**
 * NEXUS Bing Auth — Production token manager
 *
 * Stores OAuth tokens in sys_api_credentials (PostgreSQL) instead of .env.
 * Uses SELECT FOR UPDATE row locking to prevent concurrent refresh races
 * when multiple cron jobs run simultaneously.
 *
 * Flow:
 *   1. Read token from sys_api_credentials WHERE service='bing'
 *   2. If valid (expires_at > NOW() + buffer) → return access_token
 *   3. If expired → acquire row lock → re-check (another process may have
 *      refreshed while we waited) → refresh if still expired → release lock
 *
 * Bootstrap: on first run, seeds credentials from .env into the DB.
 */

const CLIENT_ID     = process.env.BING_CLIENT_ID;
const CLIENT_SECRET = process.env.BING_CLIENT_SECRET;
const TENANT_ID     = 'common'; // Must be 'common' for MSA tokens
const REDIRECT      = 'http://localhost:8765/callback';
const SCOPE         = 'https://ads.microsoft.com/msads.manage offline_access';
const SERVICE       = 'bing';
const LABEL         = 'ads_oauth';
const BUFFER_MS     = 5 * 60 * 1000; // refresh 5 min before expiry

// H5 — In-memory cache so rapid successive calls skip the DB SELECT
let _cache = { token: null, expiresAt: 0 };
function _cacheIsValid() { return _cache.token && Date.now() + BUFFER_MS < _cache.expiresAt; }

// ── Seed DB credentials from .env on first run ────────────────────────────
async function ensureCredentialsSeeded() {
    const existing = await db.get(
        `SELECT id FROM sys_api_credentials WHERE service = $1 AND label = $2 AND is_active = TRUE`,
        [SERVICE, LABEL]
    );
    if (existing) return;

    const refreshToken = process.env.BING_REFRESH_TOKEN;
    if (!refreshToken) {
        throw new Error('[BingAuth] BING_REFRESH_TOKEN not set. Run: npm run bing-auth');
    }

    await db.run(`
        INSERT INTO sys_api_credentials
            (service, label, refresh_token, is_active, auto_refresh_enabled)
        VALUES ($1, $2, $3, TRUE, TRUE)
    `, [SERVICE, LABEL, refreshToken]);

    console.log('[BingAuth] Credentials seeded to sys_api_credentials from .env');
}

// ── Get valid access token (with row-level locking) ───────────────────────
async function getAccessToken() {
    await ensureCredentialsSeeded();

    // Fast path 0: in-memory cache (H5)
    if (_cacheIsValid()) return _cache.token;

    // Fast path 1: check DB without lock
    const cred = await db.get(
        `SELECT access_token, expires_at FROM sys_api_credentials
         WHERE service = $1 AND label = $2 AND is_active = TRUE`,
        [SERVICE, LABEL]
    );

    if (cred?.access_token && cred?.expires_at) {
        const expiresAt = new Date(cred.expires_at).getTime();
        if (Date.now() + BUFFER_MS < expiresAt) {
            return cred.access_token;
        }
    }

    // Slow path: acquire row lock, refresh if still expired
    return await db.transaction(async (client) => {
        const locked = await client.query(
            `SELECT id, access_token, refresh_token, expires_at
             FROM sys_api_credentials
             WHERE service = $1 AND label = $2 AND is_active = TRUE
             FOR UPDATE`,
            [SERVICE, LABEL]
        );

        const row = locked.rows[0];
        if (!row) throw new Error('[BingAuth] No active Bing credentials in sys_api_credentials');

        // Re-check after acquiring lock — another process may have refreshed
        if (row.access_token && row.expires_at) {
            const expiresAt = new Date(row.expires_at).getTime();
            if (Date.now() + BUFFER_MS < expiresAt) {
                return row.access_token;
            }
        }

        // Still expired — perform the refresh
        const json = await _refreshToken(row.refresh_token);

        const newExpiry = new Date(Date.now() + (json.expires_in || 3600) * 1000);

        await client.query(`
            UPDATE sys_api_credentials SET
                access_token          = $1,
                refresh_token         = $2,
                expires_at            = $3,
                last_used_at          = NOW(),
                last_refresh_attempt  = NOW(),
                last_refresh_success  = TRUE,
                last_refresh_error    = NULL,
                last_error            = NULL,
                refresh_failure_count = 0,
                updated_at            = NOW()
            WHERE service = $4 AND label = $5
        `, [
            json.access_token,
            json.refresh_token || row.refresh_token,
            newExpiry.toISOString(),
            SERVICE, LABEL,
        ]);

        const expiresIn = Math.round((json.expires_in || 3600) / 60);
        console.log(`[BingAuth] Token refreshed. Valid for ~${expiresIn} min.`);

        // Populate in-memory cache
        _cache = { token: json.access_token, expiresAt: newExpiry.getTime() };
        return json.access_token;
    });
}

// ── Perform the OAuth token refresh ──────────────────────────────────────
function _refreshToken(refreshToken) {
    return new Promise((resolve, reject) => {
        if (!CLIENT_ID) reject(new Error('[BingAuth] BING_CLIENT_ID not set'));

        const body = new URLSearchParams({
            client_id:     CLIENT_ID,
            grant_type:    'refresh_token',
            refresh_token: refreshToken,
            redirect_uri:  REDIRECT,
            scope:         SCOPE,
            ...(CLIENT_SECRET ? { client_secret: CLIENT_SECRET } : {}),
        }).toString();

        const req = https.request({
            hostname: 'login.microsoftonline.com',
            path:     `/${TENANT_ID}/oauth2/v2.0/token`,
            method:   'POST',
            headers: {
                'Content-Type':   'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
            },
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', async () => {
                try {
                    const json = JSON.parse(data);
                    if (json.error) {
                        // Record failure in DB
                        await db.run(`
                            UPDATE sys_api_credentials SET
                                last_refresh_error    = $1,
                                refresh_failure_count = refresh_failure_count + 1,
                                updated_at            = NOW()
                            WHERE service = $2 AND label = $3
                        `, [`${json.error}: ${json.error_description}`, SERVICE, LABEL]).catch(() => {});
                        reject(new Error(`[BingAuth] Token refresh failed: ${json.error} — ${json.error_description}`));
                    } else {
                        resolve(json);
                    }
                } catch (e) {
                    reject(new Error(`[BingAuth] Failed to parse token response: ${data.slice(0, 200)}`));
                }
            });
        });

        req.on('error', reject);
        req.write(body);
        req.end();
    });
}

function getTokenAge() {
    return db.get(
        `SELECT EXTRACT(EPOCH FROM (NOW() - last_refresh_attempt)) AS age_seconds
         FROM sys_api_credentials WHERE service = $1 AND label = $2`,
        [SERVICE, LABEL]
    ).then(r => r ? Math.round(r.age_seconds) : null).catch(() => null);
}

module.exports = { getAccessToken, getTokenAge };
