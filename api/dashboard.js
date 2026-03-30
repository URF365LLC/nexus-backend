'use strict';
const router = require('express').Router();
const { db } = require('../services/db');

/**
 * GET /api/dashboard
 *
 * Single endpoint for the dashboard UI. Returns everything needed
 * in one roundtrip so the frontend doesn't fan out 6 separate calls.
 *
 * Shape:
 * {
 *   tiers:          { A: { count, avg_score, avg_confidence }, B: ..., C: ... }
 *   top_offers:     [ top 10 by score_total ]
 *   keyword_coverage: { total_offers, offers_with_keywords, total_keywords,
 *                       validated_keywords, avg_keywords_per_offer }
 *   reports:        { total, ready, generating, failed, pending }
 *   jobs:           { last_mb_sync, last_bing_sync, last_score_run,
 *                     last_report_run }
 *   system:         { bootstrap_offers, data_complete_offers, active_offers }
 * }
 */
router.get('/', async (req, res) => {
    try {
        const [
            tierRows,
            topOffers,
            kwCoverage,
            reportCounts,
            jobLastRuns,
            systemStats,
        ] = await Promise.all([

            // Tier distribution
            db.all(`
                SELECT s.tier,
                       COUNT(*)                            AS count,
                       ROUND(AVG(s.score_total), 1)        AS avg_score,
                       ROUND(AVG(s.confidence_score), 1)   AS avg_confidence,
                       ROUND(AVG(s.expected_profit_per_click)::numeric, 4) AS avg_eppc
                FROM offer_scores s
                JOIN mb_offers o ON o.id = s.offer_id
                WHERE o.status = 'active' AND o.passes_filter = TRUE
                GROUP BY s.tier
                ORDER BY s.tier
            `),

            // Top 10 offers
            db.all(`
                SELECT
                    o.id, o.mb_campaign_id, o.name, o.vertical,
                    o.payout, o.epc, o.conversion_type,
                    o.traffic_search, o.traffic_native, o.traffic_social,
                    s.score_total, s.tier, s.confidence_score,
                    s.is_bootstrap_mode, s.expected_profit_per_click,
                    s.breakeven_cpc, s.avg_cpc_used, s.scored_at,
                    (SELECT COUNT(*) FROM kw_keywords k
                     WHERE k.offer_id = o.id AND k.is_negative = FALSE) AS keyword_count,
                    (SELECT COUNT(*) FROM kw_keywords k
                     JOIN kw_metrics m ON m.keyword_id = k.id
                     WHERE k.offer_id = o.id AND k.is_validated = TRUE
                       AND m.avg_monthly_searches > 0) AS validated_kw_count,
                    (SELECT status FROM report_intelligence r
                     WHERE r.offer_id = o.id ORDER BY r.version DESC LIMIT 1) AS report_status
                FROM mb_offers o
                JOIN offer_scores s ON s.offer_id = o.id
                WHERE o.status = 'active' AND o.passes_filter = TRUE
                ORDER BY s.score_total DESC
                LIMIT 10
            `),

            // Keyword coverage stats
            db.get(`
                SELECT
                    COUNT(DISTINCT o.id)                                      AS total_offers,
                    COUNT(DISTINCT k.offer_id)                                AS offers_with_keywords,
                    COUNT(k.id)                                               AS total_keywords,
                    COUNT(k.id) FILTER (WHERE k.is_validated = TRUE)          AS validated_keywords,
                    ROUND(
                        COUNT(k.id)::numeric /
                        NULLIF(COUNT(DISTINCT k.offer_id), 0), 0
                    )                                                          AS avg_keywords_per_offer
                FROM mb_offers o
                LEFT JOIN kw_keywords k ON k.offer_id = o.id AND k.is_negative = FALSE
                WHERE o.status = 'active' AND o.passes_filter = TRUE
            `),

            // Report status counts
            db.get(`
                SELECT
                    COUNT(DISTINCT r.offer_id)                                AS total,
                    COUNT(DISTINCT r.offer_id) FILTER (
                        WHERE r.status = 'completed'
                        AND r.id = (SELECT id FROM report_intelligence r2
                                    WHERE r2.offer_id = r.offer_id
                                    ORDER BY r2.version DESC LIMIT 1)
                    )                                                          AS ready,
                    COUNT(DISTINCT r.offer_id) FILTER (WHERE r.status = 'generating') AS generating,
                    COUNT(DISTINCT r.offer_id) FILTER (WHERE r.status = 'failed')     AS failed,
                    (SELECT COUNT(*) FROM v_top_offers_pending_report)         AS pending
                FROM report_intelligence r
            `),

            // Last successful run per job type
            db.all(`
                SELECT job_type,
                       MAX(completed_at) FILTER (WHERE job_status = 'completed') AS last_success,
                       MAX(queued_at)                                             AS last_attempt
                FROM sys_sync_jobs
                WHERE queued_at >= NOW() - INTERVAL '30 days'
                GROUP BY job_type
                ORDER BY job_type
            `),

            // System health stats
            db.get(`
                SELECT
                    COUNT(*) FILTER (WHERE o.passes_filter = TRUE)             AS active_offers,
                    COUNT(*) FILTER (WHERE s.is_bootstrap_mode = TRUE)         AS bootstrap_offers,
                    COUNT(*) FILTER (WHERE o.has_sufficient_own_data = TRUE)   AS data_complete_offers,
                    COUNT(*) FILTER (WHERE s.tier = 'A')                       AS tier_a,
                    COUNT(*) FILTER (WHERE s.tier = 'B')                       AS tier_b,
                    COUNT(*) FILTER (WHERE s.tier = 'C')                       AS tier_c
                FROM mb_offers o
                LEFT JOIN offer_scores s ON s.offer_id = o.id
                WHERE o.status = 'active'
            `),
        ]);

        // Reshape tier rows into a keyed object
        const tiers = {};
        for (const row of tierRows) {
            tiers[row.tier] = {
                count:          parseInt(row.count),
                avg_score:      parseFloat(row.avg_score),
                avg_confidence: parseFloat(row.avg_confidence),
                avg_eppc:       parseFloat(row.avg_eppc),
            };
        }

        // Reshape job last-run rows
        const jobs = {};
        for (const row of jobLastRuns) {
            jobs[row.job_type] = {
                last_success: row.last_success,
                last_attempt: row.last_attempt,
            };
        }

        res.json({
            success: true,
            data: {
                tiers,
                top_offers:       topOffers,
                keyword_coverage: kwCoverage,
                reports:          reportCounts,
                jobs,
                system:           systemStats,
            },
        });
    } catch (err) {
        console.error('[API/dashboard] GET /:', err.message);
        res.status(500).json({ success: false, error: err.message });
    }
});

module.exports = router;
