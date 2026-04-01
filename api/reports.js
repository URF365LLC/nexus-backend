'use strict';
const router = require('express').Router();
const { db } = require('../services/db');

// GET /api/reports — list reports with status
router.get('/', async (req, res) => {
    try {
        const { status } = req.query;
        const limit = Math.min(Math.max(parseInt(req.query.limit ?? '25', 10) || 25, 1), 200);
        const params = [];
        let statusFilter = '';

        const VALID_STATUSES = ['pending', 'generating', 'completed', 'failed'];
        if (status && !VALID_STATUSES.includes(status)) {
            return res.status(400).json({ success: false, error: 'Invalid status. Must be one of: pending, generating, completed, failed' });
        }

        if (status) {
            params.push(status);
            statusFilter = `AND r.status = $1`;
        }

        params.push(limit);

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
        console.error('[API/reports] GET /:', err.message);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/reports/:offerId — full report for an offer
router.get('/:offerId', async (req, res) => {
    const offerId = req.params.offerId;
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(offerId);
    const isInt  = /^\d+$/.test(offerId);
    if (!isUuid && !isInt) {
        return res.status(400).json({ success: false, error: 'Invalid offer ID' });
    }
    try {
        const report = await db.get(`
            SELECT r.*, o.name AS offer_name, o.vertical, o.payout,
                   s.score_total, s.tier, s.confidence_score
            FROM report_intelligence r
            JOIN mb_offers o ON o.id = r.offer_id
            LEFT JOIN offer_scores s ON s.offer_id = r.offer_id
            ${isUuid ? 'WHERE r.offer_id = $1::uuid' : 'WHERE r.offer_id = (SELECT id FROM mb_offers WHERE mb_campaign_id = $1)'}
            ORDER BY r.version DESC LIMIT 1
        `, [offerId]);

        if (!report) return res.status(404).json({ success: false, error: 'No report found for this offer' });
        res.json({ success: true, data: report });
    } catch (err) {
        console.error('[API/reports] GET /:offerId:', err.message);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/reports/queue/pending — offers with high scores but no report yet
router.get('/queue/pending', async (req, res) => {
    try {
        const pending = await db.all(`SELECT * FROM v_top_offers_pending_report LIMIT 20`);
        res.json({ success: true, data: pending });
    } catch (err) {
        console.error('[API/reports] GET /queue/pending:', err.message);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;
