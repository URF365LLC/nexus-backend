'use strict';
const router = require('express').Router();
const { db } = require('../services/db');
const { syncOfferKeywords, generateSeeds } = require('../services/bingSync');

// GET /api/keywords/summary/:offerId — aggregate kw stats for an offer
router.get('/summary/:offerId', async (req, res) => {
    const offerId = req.params.offerId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(offerId);
    const isInt  = /^\d+$/.test(offerId);
    if (!isUuid && !isInt) {
        return res.status(400).json({ success: false, error: 'Invalid offer ID' });
    }
    try {
        const summary = await db.get(`
            SELECT * FROM v_offer_keyword_summary 
            ${isUuid ? 'WHERE offer_id = $1::uuid' : 'WHERE offer_id = (SELECT id FROM mb_offers WHERE mb_campaign_id = $1)'}
        `, [offerId]);
        res.json({ success: true, data: summary || null });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/keywords/:offerId — all keywords for an offer
router.get('/:offerId', async (req, res) => {
    const offerId = req.params.offerId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(offerId);
    const isInt  = /^\d+$/.test(offerId);
    if (!isUuid && !isInt) {
        return res.status(400).json({ success: false, error: 'Invalid offer ID' });
    }
    try {
        const { intent } = req.query;
        const limit = Math.min(Math.max(parseInt(req.query.limit ?? '100', 10) || 100, 1), 10000);
        const params = [offerId];
        let intentFilter = '';

        if (intent) {
            params.push(intent);
            intentFilter = `AND k.intent = $${params.length}`;
        }

        params.push(limit);

        const keywords = await db.all(`
            SELECT
                k.id, k.keyword, k.keyword_normalized, k.intent,
                k.is_negative, k.is_branded,
                m.avg_monthly_searches, m.competition_level, m.competition_index,
                m.avg_cpc, m.suggested_bid, m.data_month
            FROM kw_keywords k
            LEFT JOIN kw_metrics m ON m.keyword_id = k.id
            ${isUuid ? 'WHERE k.offer_id = $1::uuid' : 'WHERE k.offer_id = (SELECT id FROM mb_offers WHERE mb_campaign_id = $1)'}
              AND k.is_negative = FALSE
              ${intentFilter}
            ORDER BY m.avg_monthly_searches DESC NULLS LAST
            LIMIT $${params.length}
        `, params);

        res.json({ success: true, data: keywords });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});



// POST /api/keywords/:offerId/sync — trigger keyword sync for one offer
router.post('/:offerId/sync', async (req, res) => {
    const offerId = req.params.offerId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(offerId);
    const isInt  = /^\d+$/.test(offerId);
    if (!isUuid && !isInt) {
        return res.status(400).json({ success: false, error: 'Invalid offer ID' });
    }
    try {
        const offerQuery = isUuid
            ? `SELECT id, mb_campaign_id, name, keywords_raw, vertical FROM mb_offers WHERE id = $1::uuid`
            : `SELECT id, mb_campaign_id, name, keywords_raw, vertical FROM mb_offers WHERE mb_campaign_id = $1`;
        const offer = await db.get(offerQuery, [offerId]);
        if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });

        const count = await syncOfferKeywords(offer);
        res.json({ success: true, data: { keywords_stored: count } });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;
