'use strict';
const router = require('express').Router();
const { db } = require('../services/db');

// GET /api/scores — top scored offers summary
router.get('/', async (req, res) => {
    try {
        const { tier } = req.query;
        const limit = Math.min(Math.max(parseInt(req.query.limit ?? '25', 10) || 25, 1), 200);
        const params = [];
        let tierFilter = '';

        const VALID_TIERS = ['S', 'A', 'B', 'C', 'D', 'F'];
        if (tier && !VALID_TIERS.includes(tier.toUpperCase())) {
            return res.status(400).json({ success: false, error: 'Invalid tier. Must be one of: S, A, B, C, D, F' });
        }

        if (tier) {
            params.push(tier.toUpperCase());
            tierFilter = `AND s.tier = $1`;
        }

        params.push(limit);

        const scores = await db.all(`
            SELECT
                o.id, o.mb_campaign_id, o.name, o.vertical,
                o.payout, o.epc, o.reversal_rate,
                s.score_total, s.tier,
                s.confidence_score, s.data_completeness,
                s.is_bootstrap_mode, s.cvr_source,
                s.expected_profit_per_click,
                s.expected_value_bootstrap, s.expected_value_true,
                s.breakeven_cpc, s.avg_cpc_used,
                s.traffic_adjusted_epc, s.scored_at
            FROM offer_scores s
            JOIN mb_offers o ON o.id = s.offer_id
            WHERE o.status = 'active' AND o.passes_filter = TRUE
            ${tierFilter}
            ORDER BY s.score_total DESC
            LIMIT $${params.length}
        `, params);

        res.json({ success: true, data: scores });
    } catch (err) {
        console.error('[API/scores] GET /:', err.message);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/scores/tiers — count of offers per tier
router.get('/tiers', async (req, res) => {
    try {
        const tiers = await db.all(`
            SELECT s.tier, COUNT(*) AS count,
                   ROUND(AVG(s.score_total), 1) AS avg_score,
                   ROUND(AVG(s.confidence_score), 1) AS avg_confidence
            FROM offer_scores s
            JOIN mb_offers o ON o.id = s.offer_id
            WHERE o.status = 'active' AND o.passes_filter = TRUE
            GROUP BY s.tier
            ORDER BY s.tier
        `);
        res.json({ success: true, data: tiers });
    } catch (err) {
        console.error('[API/scores] GET /tiers:', err.message);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/scores/history/:offerId — score trend for one offer
router.get('/history/:offerId', async (req, res) => {
    try {
        const history = await db.all(`
            SELECT score_total, tier, epc_at_score, cpc_at_score, scored_at
            FROM offer_score_history
            WHERE offer_id = $1
            ORDER BY scored_at DESC
            LIMIT 30
        `, [req.params.offerId]);
        res.json({ success: true, data: history });
    } catch (err) {
        console.error('[API/scores] GET /history/:offerId:', err.message);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;
