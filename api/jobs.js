'use strict';
const router = require('express').Router();
const { db } = require('../services/db');

// GET /api/jobs — recent job history
router.get('/', async (req, res) => {
    try {
        const { limit = 50, job_type } = req.query;
        const params = [];
        let typeFilter = '';

        if (job_type) {
            params.push(job_type);
            typeFilter = `AND job_type = $1`;
        }

        params.push(parseInt(limit));

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
        res.status(500).json({ success: false, error: err.message });
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
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
