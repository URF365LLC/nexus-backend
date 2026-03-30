'use strict';
require('dotenv').config();
const axios = require('axios');

const MB_BASE_URL  = process.env.MB_BASE_URL || 'https://api.maxbounty.com/affiliates/api';
const TOKEN_TTL_MS = 110 * 60 * 1000; // refresh at 110 min (MB expires at 120 min)

let _store = { token: null, issuedAt: null };

function _isValid() {
    if (!_store.token || !_store.issuedAt) return false;
    return (Date.now() - _store.issuedAt) < TOKEN_TTL_MS;
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

    _store.token    = data['mb-api-token'];
    _store.issuedAt = Date.now();

    console.log(`[MBAuth] Token refreshed. Valid for ~${Math.round(TOKEN_TTL_MS / 60000)} min.`);
    return _store.token;
}

async function getToken() {
    return _isValid() ? _store.token : _fetchFresh();
}

async function forceRefresh() {
    _store = { token: null, issuedAt: null };
    return _fetchFresh();
}

function getTokenAge() {
    if (!_store.issuedAt) return null;
    return Math.round((Date.now() - _store.issuedAt) / 1000);
}

module.exports = { getToken, forceRefresh, getTokenAge };
