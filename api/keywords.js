'use strict';
const router = require('express').Router();
const { db } = require('../services/db');
const { syncOfferKeywords, generateSeeds } = require('../services/bingSync');

// GET /api/keywords/:offerId — all keywords for an offer
router.get('/:offerId', async (req, res) => {
    try {
        const { limit = 100, intent } = req.query;
        const params = [req.params.offerId];
        let intentFilter = '';

        if (intent) {
            params.push(intent);
            intentFilter = `AND k.intent = $${params.length}`;
        }

        params.push(parseInt(limit));

        const keywords = await db.all(`
            SELECT
                k.id, k.keyword, k.keyword_normalized, k.intent,
                k.is_negative, k.is_branded,
                m.avg_monthly_searches, m.competition_level, m.competition_index,
                m.avg_cpc, m.suggested_bid, m.data_month
            FROM kw_keywords k
            LEFT JOIN kw_metrics m ON m.keyword_id = k.id
            WHERE k.offer_id = $1
              AND k.is_negative = FALSE
              ${intentFilter}
            ORDER BY m.avg_monthly_searches DESC NULLS LAST
            LIMIT $${params.length}
        `, params);

        res.json({ success: true, data: keywords });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/keywords/summary/:offerId — aggregate kw stats for an offer
router.get('/summary/:offerId', async (req, res) => {
    try {
        const summary = await db.get(`
            SELECT * FROM v_offer_keyword_summary WHERE offer_id = $1
        `, [req.params.offerId]);
        res.json({ success: true, data: summary || null });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/keywords/:offerId/sync — trigger keyword sync for one offer
router.post('/:offerId/sync', async (req, res) => {
    try {
        const offer = await db.get(
            `SELECT id, mb_campaign_id, name, keywords_raw, vertical
             FROM mb_offers WHERE id = $1`, [req.params.offerId]
        );
        if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });

        const count = await syncOfferKeywords(offer);
        res.json({ success: true, data: { keywords_stored: count } });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
