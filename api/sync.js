'use strict';
const router = require('express').Router();
const { syncAllOffers }        = require('../services/mbSync');
const { syncAllPerformance }   = require('../services/mbPerformanceSync');
const { runFilter }            = require('../services/filterEngine');
const { scoreAllOffers }       = require('../services/scoringEngine');
const { syncAllKeywords }      = require('../services/bingSync');

// POST /api/sync/offers — trigger MB offer sync
router.post('/offers', async (req, res) => {
    res.json({ success: true, message: 'Offer sync started' });
    syncAllOffers().catch(err => console.error('[Sync/offers]', err.message));
});

// POST /api/sync/performance — trigger earnings/conversions/reversals sync
router.post('/performance', async (req, res) => {
    res.json({ success: true, message: 'Performance sync started' });
    syncAllPerformance().catch(err => console.error('[Sync/performance]', err.message));
});

// POST /api/sync/filter — run filter gate on all offers
router.post('/filter', async (req, res) => {
    res.json({ success: true, message: 'Filter run started' });
    runFilter().catch(err => console.error('[Sync/filter]', err.message));
});

// POST /api/sync/score — run scoring on all qualified offers
router.post('/score', async (req, res) => {
    res.json({ success: true, message: 'Scoring run started' });
    scoreAllOffers().catch(err => console.error('[Sync/score]', err.message));
});

// POST /api/sync/keywords — run Bing keyword intelligence sync
router.post('/keywords', async (req, res) => {
    res.json({ success: true, message: 'Keyword sync started' });
    syncAllKeywords().catch(err => console.error('[Sync/keywords]', err.message));
});

// POST /api/sync/full — run the full pipeline in sequence
router.post('/full', async (req, res) => {
    res.json({ success: true, message: 'Full pipeline started' });
    (async () => {
        try {
            await syncAllOffers();
            await syncAllPerformance();
            await runFilter();
            await scoreAllOffers();
            await syncAllKeywords();
            console.log('[Sync/full] Pipeline complete');
        } catch (err) {
            console.error('[Sync/full] Pipeline failed:', err.message);
        }
    })();
});

module.exports = router;
