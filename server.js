'use strict';
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { requireApiKey } = require('./middleware/auth');

const app  = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json());

// ── Health check (public — Railway probe hits this) ───────────────────────
app.get('/health', (req, res) => {
    res.json({ status: 'ok', service: 'nexus-cpa-intelligence', ts: new Date().toISOString() });
});

// ── API routes (auth-gated) ───────────────────────────────────────────────
app.use('/api', requireApiKey, require('./api'));

// ── 404 ───────────────────────────────────────────────────────────────────
app.use((req, res) => res.status(404).json({ success: false, error: 'Not found' }));

// ── Error handler ─────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error('[Server] Unhandled error:', err.message);
    res.status(500).json({ success: false, error: 'Internal server error' });
});

app.listen(port, '0.0.0.0', () => {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('  NEXUS CPA Intelligence Engine');
    console.log('═══════════════════════════════════════════════════════════');
    console.log(`  API:      http://localhost:${port}/api`);
    console.log(`  Offers:   http://localhost:${port}/api/offers`);
    console.log(`  Scores:   http://localhost:${port}/api/scores`);
    console.log(`  Keywords: http://localhost:${port}/api/keywords`);
    console.log(`  Reports:  http://localhost:${port}/api/reports`);
    console.log(`  Jobs:     http://localhost:${port}/api/jobs`);
    console.log(`  Sync:     POST http://localhost:${port}/api/sync/full`);
    console.log('═══════════════════════════════════════════════════════════\n');
});
