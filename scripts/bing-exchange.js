'use strict';
require('dotenv').config();
const https = require('https');

const CLIENT_ID = process.env.BING_CLIENT_ID;
const REDIRECT  = 'https://login.microsoftonline.com/common/oauth2/nativeclient';
const SCOPE     = 'https://ads.microsoft.com/msads.manage offline_access';

// Paste your code here:
const CODE = process.argv[2];

if (!CODE) {
    console.error('Usage: node scripts/bing-exchange.js <code>');
    process.exit(1);
}

const body = new URLSearchParams({
    client_id:    CLIENT_ID,
    code:         CODE,
    redirect_uri: REDIRECT,
    grant_type:   'authorization_code',
    scope:        SCOPE,
}).toString();

const options = {
    hostname: 'login.microsoftonline.com',
    path:     '/common/oauth2/v2.0/token',
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
        const json = JSON.parse(data);
        if (json.error) {
            console.error(`Error: ${json.error} — ${json.error_description}`);
            process.exit(1);
        }
        console.log('\n═══════════════════════════════════════════════════');
        console.log('  SUCCESS — Add this to your .env:');
        console.log('═══════════════════════════════════════════════════\n');
        console.log(`BING_REFRESH_TOKEN=${json.refresh_token}\n`);
    });
});

req.on('error', e => { console.error(e.message); process.exit(1); });
req.write(body);
req.end();
