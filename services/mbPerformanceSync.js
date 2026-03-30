'use strict';
require('dotenv').config();
const { mbGet }   = require('./mbSync');
const { db }      = require('./db');

// ── Sync earnings reports for all active offers ───────────────────────────
async function syncEarnings(periodStart, periodEnd) {
    const start = periodStart || formatDate(daysAgo(30));
    const end   = periodEnd   || formatDate(new Date());

    console.log(`[MBPerfSync] Syncing earnings: ${start} → ${end}`);

    try {
        const res      = await mbGet('/reports/earnings', { startDate: start, endDate: end });
        const records  = res.data?.report || [];
        let   upserted = 0;

        for (const r of records) {
            const offer = await db.get(
                `SELECT id FROM mb_offers WHERE mb_campaign_id = $1`,
                [r.campaign_id]
            );
            if (!offer) continue;

            await db.run(`
                INSERT INTO mb_performance_reports
                    (offer_id, mb_campaign_id, period_start, period_end,
                     clicks, leads, earnings, sales, conversion_rate, epc)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
                ON CONFLICT (mb_campaign_id, period_start, period_end) DO UPDATE SET
                    clicks          = EXCLUDED.clicks,
                    leads           = EXCLUDED.leads,
                    earnings        = EXCLUDED.earnings,
                    sales           = EXCLUDED.sales,
                    conversion_rate = EXCLUDED.conversion_rate,
                    epc             = EXCLUDED.epc,
                    fetched_at      = NOW()
            `, [
                offer.id,
                r.campaign_id,
                start,
                end,
                parseInt(r.clicks)  || 0,
                parseInt(r.leads)   || 0,
                parseFloat(r.earnings) || 0,
                parseInt(r.sales)   || 0,
                parseFloat(r.cvr || r.conversion_rate) || 0,
                parseFloat(r.epc)   || 0,
            ]);
            upserted++;
        }

        console.log(`[MBPerfSync] Earnings: ${upserted} records upserted`);
        await logJob('mb_performance_sync', 'completed', upserted);
        return { upserted };
    } catch (err) {
        console.error('[MBPerfSync] Earnings sync failed:', err.message);
        await logJob('mb_performance_sync', 'failed', 0, err.message);
        throw err;
    }
}

// ── Sync individual conversion events ─────────────────────────────────────
async function syncConversions(periodStart, periodEnd) {
    const start = periodStart || formatDate(daysAgo(7));
    const end   = periodEnd   || formatDate(new Date());

    console.log(`[MBPerfSync] Syncing conversions: ${start} → ${end}`);

    try {
        const res     = await mbGet('/reports/conversions', { startDate: start, endDate: end });
        const records = res.data?.report || [];
        let   saved   = 0;
        let   skipped = 0;

        for (const r of records) {
            const offer = await db.get(
                `SELECT id FROM mb_offers WHERE mb_campaign_id = $1`,
                [r.campaign_id]
            );
            if (!offer) { skipped++; continue; }

            await db.run(`
                INSERT INTO mb_conversion_events
                    (offer_id, mb_campaign_id, mb_key_id, converted_at, earnings,
                     status, subid1, subid2, subid3, subid4, subid5,
                     ip_country, ip_region, ip_city)
                VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
                ON CONFLICT (mb_key_id) DO NOTHING
            `, [
                offer.id,
                r.campaign_id,
                r.key_id || r.mb_key_id || null,
                r.date || r.converted_at || new Date().toISOString(),
                parseFloat(r.earnings) || 0,
                r.status || 'Payable',
                r.subid1 || null,
                r.subid2 || null,
                r.subid3 || null,
                r.subid4 || null,
                r.subid5 || null,
                r.ip_country || null,
                r.ip_region  || null,
                r.ip_city    || null,
            ]);
            saved++;
        }

        // After saving conversions, update own_conversion_count on mb_offers
        await updateOwnConversionCounts();

        console.log(`[MBPerfSync] Conversions: ${saved} saved, ${skipped} skipped (unknown offer)`);
        await logJob('mb_conversion_sync', 'completed', saved);
        return { saved, skipped };
    } catch (err) {
        console.error('[MBPerfSync] Conversion sync failed:', err.message);
        await logJob('mb_conversion_sync', 'failed', 0, err.message);
        throw err;
    }
}

// ── Sync reversal events ───────────────────────────────────────────────────
async function syncReversals(periodStart, periodEnd) {
    const start = periodStart || formatDate(daysAgo(30));
    const end   = periodEnd   || formatDate(new Date());

    console.log(`[MBPerfSync] Syncing reversals: ${start} → ${end}`);

    try {
        const res     = await mbGet('/reports/reversals', { startDate: start, endDate: end });
        const records = res.data?.report || [];
        let   saved   = 0;

        for (const r of records) {
            const offer = await db.get(
                `SELECT id FROM mb_offers WHERE mb_campaign_id = $1`,
                [r.campaign_id]
            );
            if (!offer) continue;

            await db.run(`
                INSERT INTO mb_reversal_events
                    (offer_id, mb_campaign_id, lead_date, reversal_date,
                     earnings_lost, subid1, subid2)
                VALUES ($1,$2,$3,$4,$5,$6,$7)
            `, [
                offer.id,
                r.campaign_id,
                r.lead_date    || null,
                r.reverse_date || r.reversal_date || null,
                parseFloat(r.earnings) || 0,
                r.subid1 || null,
                r.subid2 || null,
            ]);
            saved++;
        }

        // After saving reversals, refresh reversal_rate on mb_offers
        await updateReversalRates();

        console.log(`[MBPerfSync] Reversals: ${saved} saved`);
        await logJob('mb_reversal_sync', 'completed', saved);
        return { saved };
    } catch (err) {
        console.error('[MBPerfSync] Reversal sync failed:', err.message);
        await logJob('mb_reversal_sync', 'failed', 0, err.message);
        throw err;
    }
}

// ── Recalculate own_conversion_count on mb_offers ─────────────────────────
// Triggers the trg_bootstrap_exit_check trigger automatically on UPDATE.
async function updateOwnConversionCounts() {
    await db.run(`
        UPDATE mb_offers o
        SET own_conversion_count = sub.cnt
        FROM (
            SELECT offer_id, COUNT(*) AS cnt
            FROM mb_conversion_events
            WHERE status = 'Payable'
            GROUP BY offer_id
        ) sub
        WHERE o.id = sub.offer_id
          AND o.own_conversion_count IS DISTINCT FROM sub.cnt
    `);
}

// ── Recalculate reversal_rate on mb_offers (last 30 days) ─────────────────
async function updateReversalRates() {
    await db.run(`
        UPDATE mb_offers o
        SET reversal_rate = COALESCE(
            (
                SELECT ROUND(
                    COUNT(r.id)::NUMERIC /
                    NULLIF(COUNT(c.id), 0),
                4)
                FROM mb_offers x
                LEFT JOIN mb_conversion_events c ON c.offer_id = x.id
                    AND c.converted_at >= NOW() - INTERVAL '30 days'
                LEFT JOIN mb_reversal_events r ON r.offer_id = x.id
                    AND r.reversal_date >= NOW() - INTERVAL '30 days'
                WHERE x.id = o.id
                GROUP BY x.id
            ),
            0
        )
    `);
}

// ── Run all performance syncs ──────────────────────────────────────────────
async function syncAllPerformance() {
    const results = {};
    results.earnings    = await syncEarnings();
    results.conversions = await syncConversions();
    results.reversals   = await syncReversals();
    return results;
}

// ── Helpers ───────────────────────────────────────────────────────────────
function formatDate(d) {
    return d.toISOString().split('T')[0];
}

function daysAgo(n) {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return d;
}

async function logJob(jobType, status, processed = 0, message = '') {
    await db.run(`
        INSERT INTO sys_sync_jobs
            (job_type, job_status, records_processed, error_message, triggered_by, completed_at)
        VALUES ($1, $2, $3, $4, 'scheduler', NOW())
    `, [jobType, status, processed, message || null]);
}

module.exports = {
    syncEarnings,
    syncConversions,
    syncReversals,
    syncAllPerformance,
    updateOwnConversionCounts,
    updateReversalRates,
};
