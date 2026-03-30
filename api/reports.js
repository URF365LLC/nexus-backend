'use strict';
const router = require('express').Router();
const { db } = require('../services/db');

// GET /api/reports — list reports with status
router.get('/', async (req, res) => {
    try {
        const { status, limit = 25 } = req.query;
        const params = [];
        let statusFilter = '';

        if (status) {
            params.push(status);
            statusFilter = `AND r.status = $1`;
        }

        params.push(parseInt(limit));

        const reports = await db.all(`
            SELECT
                r.id, r.offer_id, r.status, r.version,
                r.confidence_score, r.data_completeness,
                r.generated_by, r.generation_time_ms,
                r.generated_at, r.created_at,
                o.name AS offer_name, o.vertical,
                s.score_total, s.tier
            FROM report_intelligence r
            JOIN mb_offers o ON o.id = r.offer_id
            LEFT JOIN offer_scores s ON s.offer_id = r.offer_id
            WHERE 1=1 ${statusFilter}
            ORDER BY r.generated_at DESC NULLS LAST
            LIMIT $${params.length}
        `, params);

        res.json({ success: true, data: reports });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/reports/:offerId — full report for an offer
router.get('/:offerId', async (req, res) => {
    try {
        const report = await db.get(`
            SELECT r.*, o.name AS offer_name, o.vertical, o.payout,
                   s.score_total, s.tier, s.confidence_score
            FROM report_intelligence r
            JOIN mb_offers o ON o.id = r.offer_id
            LEFT JOIN offer_scores s ON s.offer_id = r.offer_id
            WHERE r.offer_id = $1
            ORDER BY r.version DESC LIMIT 1
        `, [req.params.offerId]);

        if (!report) return res.status(404).json({ success: false, error: 'No report found for this offer' });
        res.json({ success: true, data: report });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

// GET /api/reports/pending — offers with high scores but no report yet
router.get('/queue/pending', async (req, res) => {
    try {
        const pending = await db.all(`SELECT * FROM v_top_offers_pending_report LIMIT 20`);
        res.json({ success: true, data: pending });
    } catch (err) {
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
