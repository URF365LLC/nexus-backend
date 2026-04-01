'use strict';
const router = require('express').Router();
const { db } = require('../services/db');

// GET /api/jobs — recent job history
router.get('/', async (req, res) => {
    try {
        const { job_type } = req.query;
        const limit = Math.min(Math.max(parseInt(req.query.limit ?? '50', 10) || 50, 1), 200);
        const params = [];
        let typeFilter = '';

        const VALID_JOB_TYPES = ['mb_offer_sync','mb_performance_sync','kw_intelligence','offer_scoring','report_generation','mb_auth_refresh'];
        if (job_type && !VALID_JOB_TYPES.includes(job_type)) {
            return res.status(400).json({ success: false, error: 'Invalid job_type' });
        }

        if (job_type) {
            params.push(job_type);
            typeFilter = `AND job_type = $1`;
        }

        params.push(limit);

        const jobs = await db.all(`
            SELECT id, job_type, job_status, records_processed,
                   records_created, records_updated, records_failed,
                   error_message, triggered_by, queued_at, completed_at
            FROM sys_sync_jobs
            WHERE 1=1 ${typeFilter}
            ORDER BY queued_at DESC
            LIMIT $${params.length}
        `, params);

        res.json({ success: true, data: jobs });
    } catch (err) {
        console.error('[API/jobs] GET /:', err.message);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

// GET /api/jobs/stats — summary counts
router.get('/stats', async (req, res) => {
    try {
        const stats = await db.all(`
            SELECT job_type, job_status, COUNT(*) AS count,
                   MAX(completed_at) AS last_run,
                   SUM(records_processed) AS total_processed
            FROM sys_sync_jobs
            WHERE queued_at >= NOW() - INTERVAL '7 days'
            GROUP BY job_type, job_status
            ORDER BY job_type, job_status
        `);
        res.json({ success: true, data: stats });
    } catch (err) {
        console.error('[API/jobs] GET /stats:', err.message);
        res.status(500).json({ success: false, error: 'Internal server error' });
    }
});

module.exports = router;
