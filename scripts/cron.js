'use strict';
require('dotenv').config();
const cron = require('node-cron');

const { syncAllOffers }      = require('../services/mbSync');
const { syncAllPerformance } = require('../services/mbPerformanceSync');
const { runFilter }          = require('../services/filterEngine');
const { scoreAllOffers }     = require('../services/scoringEngine');
const { syncAllKeywords }    = require('../services/bingSync');
const { generateAllReports } = require('../services/reportEngine');

console.log('\n═══════════════════════════════════════════════════════════');
console.log('  NEXUS — Job Scheduler');
console.log('═══════════════════════════════════════════════════════════');

// ── Full pipeline: runs every 8 hours ─────────────────────────────────────
// Offer sync → performance sync → filter → score → keyword intelligence
cron.schedule('0 */8 * * *', async () => {
    console.log('[Cron] Starting full pipeline...');
    try {
        await syncAllOffers();
        await syncAllPerformance();
        await runFilter();
        await scoreAllOffers();
        await syncAllKeywords();
        await generateAllReports();
        console.log('[Cron] Full pipeline complete');
    } catch (err) {
        console.error('[Cron] Pipeline error:', err.message);
    }
}, { timezone: 'America/New_York' });

// ── Offer sync only: every 4 hours (keeps offer data fresh) ──────────────
cron.schedule('0 */4 * * *', async () => {
    console.log('[Cron] Running offer sync...');
    try {
        await syncAllOffers();
        await runFilter();
        await scoreAllOffers();
    } catch (err) {
        console.error('[Cron] Offer sync error:', err.message);
    }
}, { timezone: 'America/New_York' });

// ── Performance sync: every 2 hours (conversions + reversals) ─────────────
cron.schedule('0 */2 * * *', async () => {
    console.log('[Cron] Running performance sync...');
    try {
        await syncAllPerformance();
    } catch (err) {
        console.error('[Cron] Performance sync error:', err.message);
    }
}, { timezone: 'America/New_York' });

// ── Keyword intelligence: once daily at 3am ────────────────────────────────
// Bing's data refreshes monthly — daily is plenty, respects rate limits
cron.schedule('0 3 * * *', async () => {
    console.log('[Cron] Running keyword intelligence sync...');
    try {
        await syncAllKeywords();
    } catch (err) {
        console.error('[Cron] Keyword sync error:', err.message);
    }
}, { timezone: 'America/New_York' });

console.log('  Schedules:');
console.log('    Full pipeline:       every 8 hours');
console.log('    Offer sync + score:  every 4 hours');
console.log('    Performance sync:    every 2 hours');
console.log('    Keyword intelligence: 3am daily');
console.log('═══════════════════════════════════════════════════════════\n');

// ── Run full pipeline immediately on startup ──────────────────────────────
(async () => {
    console.log('[Cron] Running initial pipeline on startup...');
    try {
        await syncAllOffers();
        await syncAllPerformance();
        await runFilter();
        await scoreAllOffers();
        await syncAllKeywords();
        await generateAllReports();
        console.log('[Cron] Initial pipeline complete');
    } catch (err) {
        console.error('[Cron] Initial pipeline error:', err.message);
    }
})();
