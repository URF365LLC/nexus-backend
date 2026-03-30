'use strict';
const router = require('express').Router();
const { db } = require('../services/db');
const { filterSingleOffer } = require('../services/filterEngine');
const { scoreSingleOffer }  = require('../services/scoringEngine');

// GET /api/offers — list qualified offers with scores
router.get('/', async (req, res) => {
    try {
        const { tier, limit = 50, offset = 0, vertical } = req.query;

        let where = `WHERE o.status = 'active' AND o.passes_filter = TRUE`;
        const params = [];

        if (tier) {
            params.push(tier.toUpperCase());
            where += ` AND s.tier = $${params.length}`;
        }

        if (vertical) {
            params.push(`%${vertical}%`);
            where += ` AND o.vertical ILIKE $${params.length}`;
        }

        params.push(parseInt(limit), parseInt(offset));

        const offers = await db.all(`
            SELECT
                o.id, o.mb_campaign_id, o.name, o.vertical,
                o.payout, o.epc, o.own_epc, o.own_conversion_count,
                o.has_sufficient_own_data, o.conversion_type,
                o.traffic_search, o.traffic_social, o.traffic_native,
                o.reversal_rate, o.epc_velocity, o.daily_cap, o.has_cap,
                o.affiliate_status, o.last_synced_at,
                s.score_total, s.tier, s.confidence_score, s.data_completeness,
                s.is_bootstrap_mode, s.cvr_source,
                s.expected_profit_per_click, s.expected_value_bootstrap,
                s.expected_value_true, s.breakeven_cpc, s.traffic_adjusted_epc,
                s.avg_cpc_used, s.scored_at
            FROM mb_offers o
            LEFT JOIN offer_scores s ON s.offer_id = o.id
            ${where}
            ORDER BY s.score_total DESC NULLS LAST
            LIMIT $${params.length - 1} OFFSET $${params.length}
        `, params);

        const total = await db.get(`
            SELECT COUNT(*) AS cnt
            FROM mb_offers o
            LEFT JOIN offer_scores s ON s.offer_id = o.id
            ${where.replace(`LIMIT $${params.length - 1} OFFSET $${params.length}`, '')}
        `, params.slice(0, -2));

        res.json({
            success: true,
            data:    offers,
            meta:    { total: parseInt(total?.cnt || 0), limit: parseInt(limit), offset: parseInt(offset) },
        });
    } catch (err) {
        console.error('[API/offers] GET /:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/offers/:id — single offer with full detail
router.get('/:id', async (req, res) => {
    try {
        const offer = await db.get(`
            SELECT o.*, s.*
            FROM mb_offers o
            LEFT JOIN offer_scores s ON s.offer_id = o.id
            WHERE o.id = $1 OR o.mb_campaign_id = $1::integer
        `, [req.params.id]);

        if (!offer) return res.status(404).json({ success: false, error: 'Offer not found' });

        const [geo, lps, filterHistory] = await Promise.all([
            db.all(`SELECT country_code FROM mb_offer_geo WHERE offer_id = $1`, [offer.id]),
            db.all(`SELECT * FROM mb_offer_landing_pages WHERE offer_id = $1`, [offer.id]),
            db.all(`
                SELECT passed, failure_reasons, state_changed, evaluated_at, triggered_by
                FROM offer_filter_log WHERE offer_id = $1
                ORDER BY evaluated_at DESC LIMIT 10
            `, [offer.id]),
        ]);

        res.json({
            success: true,
            data:    { ...offer, geo, landing_pages: lps, filter_history: filterHistory },
        });
    } catch (err) {
        console.error('[API/offers] GET /:id:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/offers/:id/filter — re-run filter on a single offer
router.post('/:id/filter', async (req, res) => {
    try {
        const result = await filterSingleOffer(req.params.id);
        if (!result) return res.status(404).json({ success: false, error: 'Offer not found' });
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// POST /api/offers/:id/score — re-score a single offer
router.post('/:id/score', async (req, res) => {
    try {
        const result = await scoreSingleOffer(req.params.id);
        if (!result) return res.status(404).json({ success: false, error: 'Offer not found' });
        res.json({ success: true, data: result });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
