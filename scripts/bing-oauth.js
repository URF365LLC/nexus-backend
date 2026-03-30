#!/usr/bin/env node
/**
 * NEXUS — One-time Bing OAuth flow (localhost callback)
 *
 * Run: node scripts/bing-oauth.js
 *
 * 1. Script starts a local server on port 8765
 * 2. Opens the Microsoft authorization URL in your browser
 * 3. You sign in and authorize
 * 4. Microsoft redirects to localhost — script captures the code automatically
 * 5. Prints your BING_REFRESH_TOKEN — add it to .env
 */

'use strict';
require('dotenv').config();
const http  = require('http');
const https = require('https');
const fs    = require('fs');
const path  = require('path');

const ENV_PATH = path.resolve(__dirname, '../.env');

const CLIENT_ID     = process.env.BING_CLIENT_ID;
const CLIENT_SECRET = process.env.BING_CLIENT_SECRET;
const TENANT_ID  = 'common';
const PORT       = 8765;
const REDIRECT   = `http://localhost:${PORT}/callback`;
const SCOPE      = 'https://ads.microsoft.com/msads.manage offline_access';

if (!CLIENT_ID) {
    console.error('[BingOAuth] BING_CLIENT_ID not set in .env');
    process.exit(1);
}

const authUrl = [
    `https://login.microsoftonline.com/${TENANT_ID}/oauth2/v2.0/authorize`,
    `?client_id=${CLIENT_ID}`,
    `&response_type=code`,
    `&redirect_uri=${encodeURIComponent(REDIRECT)}`,
    `&scope=${encodeURIComponent(SCOPE)}`,
    `&response_mode=query`,
    `&prompt=login`,
].join('');

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  NEXUS — Bing OAuth Setup (one-time)');
console.log('═══════════════════════════════════════════════════════════\n');
console.log('Starting local callback server on port 8765...');
console.log('Open this URL in your browser:\n');
console.log(authUrl);
console.log('\nWaiting for authorization...\n');

// ── Local server to capture the redirect ─────────────────────────────────
const server = http.createServer(async (req, res) => {
    const url    = new URL(req.url, `http://localhost:${PORT}`);
    const code   = url.searchParams.get('code');
    const error  = url.searchParams.get('error');

    if (error) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`<h2>Authorization failed: ${error}</h2><p>${url.searchParams.get('error_description')}</p>`);
        console.error(`\n[BingOAuth] Authorization failed: ${error}`);
        server.close();
        process.exit(1);
    }

    if (!code) {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<h2>Waiting...</h2>');
        return;
    }

    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<h2>Authorization successful! You can close this tab.</h2><p>Check your terminal for the refresh token.</p>');

    server.close();
    console.log('[BingOAuth] Authorization code received. Exchanging for tokens...');

    await exchangeCode(code);
});

server.listen(PORT);

// ── Exchange auth code for tokens ─────────────────────────────────────────
function exchangeCode(code) {
    return new Promise((resolve) => {
        const params = {
            client_id:    CLIENT_ID,
            code,
            redirect_uri: REDIRECT,
            grant_type:   'authorization_code',
            scope:        SCOPE,
        };
        if (CLIENT_SECRET) params.client_secret = CLIENT_SECRET;
        const body = new URLSearchParams(params).toString();

        const options = {
            hostname: 'login.microsoftonline.com',
            path:     `/${TENANT_ID}/oauth2/v2.0/token`,
            method:   'POST',
            headers: {
                'Content-Type':   'application/x-www-form-urlencoded',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    const json = JSON.parse(data);

                    if (json.error) {
                        console.error('\n[BingOAuth] Token exchange failed:');
                        console.error(`  ${json.error}: ${json.error_description}`);
                        process.exit(1);
                    }

                    // Auto-write refresh token to .env
                    try {
                        const env = fs.readFileSync(ENV_PATH, 'utf8');
                        const updated = env.replace(
                            /^BING_REFRESH_TOKEN=.*/m,
                            `BING_REFRESH_TOKEN=${json.refresh_token}`
                        );
                        fs.writeFileSync(ENV_PATH, updated, 'utf8');
                        console.log('\n═══════════════════════════════════════════════════════════');
                        console.log('  SUCCESS — .env updated automatically');
                        console.log('═══════════════════════════════════════════════════════════\n');
                        console.log('BING_REFRESH_TOKEN has been written to .env. You are done.\n');
                    } catch (writeErr) {
                        console.log('\n═══════════════════════════════════════════════════════════');
                        console.log('  SUCCESS — Add this to your .env file manually:');
                        console.log('═══════════════════════════════════════════════════════════\n');
                        console.log(`BING_REFRESH_TOKEN=${json.refresh_token}\n`);
                    }
                    resolve();
                    process.exit(0);
                } catch (e) {
                    console.error('[BingOAuth] Failed to parse response:', data);
                    process.exit(1);
                }
            });
        });

        req.on('error', (e) => {
            console.error('[BingOAuth] Request error:', e.message);
            process.exit(1);
        });

        req.write(body);
        req.end();
    });
}
