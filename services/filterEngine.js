'use strict';
const { db } = require('./db');

/**
 * NEXUS Filter Engine
 *
 * Binary gate — an offer either passes or fails.
 * Failures are logged to offer_filter_log with structured reasons.
 * Passing offers get passes_filter = TRUE and are eligible for scoring.
 *
 * Thresholds are read from sys_config so they can be changed without redeployment.
 */

// ── Load thresholds from sys_config (with hardcoded fallbacks) ────────────
async function loadThresholds() {
    const rows = await db.all(`
        SELECT key, value FROM sys_config
        WHERE key IN (
            'min_epc_threshold',
            'min_payout_threshold',
            'max_reversal_rate',
            'min_volume_threshold'
        )
    `);

    const cfg = Object.fromEntries(rows.map(r => [r.key, r.value]));

    // M10 — Warn when sys_config is empty so operators know thresholds aren't DB-driven
    if (rows.length === 0) {
        console.warn('[FilterEngine] WARNING: sys_config returned 0 threshold rows. Falling back to hardcoded defaults. Check that sys_config is seeded.');
    }

    return {
        minEpc:       parseFloat(cfg.min_epc_threshold)    || 0.50,
        minPayout:    parseFloat(cfg.min_payout_threshold) || 5.00,
        maxReversal:  parseFloat(cfg.max_reversal_rate)    || 0.15,
        minVolume:    parseInt(cfg.min_volume_threshold)   || 100,
    };
}

// ── Evaluate a single offer against filter gates ──────────────────────────
function evaluateOffer(offer, thresholds) {
    const failures = [];

    if ((parseFloat(offer.epc) || 0) < thresholds.minEpc) {
        failures.push('epc_below_threshold');
    }

    if ((parseFloat(offer.payout) || 0) < thresholds.minPayout) {
        failures.push('payout_below_threshold');
    }

    if ((parseFloat(offer.reversal_rate) || 0) > thresholds.maxReversal) {
        failures.push('reversal_rate_too_high');
    }

    if (!offer.traffic_search) {
        failures.push('no_search_traffic');
    }

    if (offer.status !== 'active') {
        failures.push('offer_not_active');
    }

    if (offer.affiliate_status && !['Approved', 'approved'].includes(offer.affiliate_status)) {
        failures.push('not_approved');
    }

    return {
        passed:  failures.length === 0,
        failures,
    };
}

// ── Write filter result to offer_filter_log + update mb_offers ────────────
async function writeFilterResult(offer, passed, failures, jobId = null) {
    // Get previous result to detect state changes
    const prev = await db.get(`
        SELECT passed FROM offer_filter_log
        WHERE offer_id = $1
        ORDER BY evaluated_at DESC LIMIT 1
    `, [offer.id]);

    await db.run(`
        INSERT INTO offer_filter_log (
            offer_id, passed, failure_reasons,
            epc_at_eval, payout_at_eval, reversal_at_eval,
            traffic_search_at_eval, daily_cap_at_eval,
            previous_result, triggered_by, job_id
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    `, [
        offer.id,
        passed,
        failures.length > 0 ? failures : null,
        offer.epc         || null,
        offer.payout      || null,
        offer.reversal_rate || null,
        offer.traffic_search || false,
        offer.daily_cap   || null,
        prev?.passed ?? null,
        'filter_job',
        jobId,
    ]);

    // Update mb_offers
    await db.run(`
        UPDATE mb_offers
        SET passes_filter        = $1,
            filter_failure_reason = $2,
            updated_at           = NOW()
        WHERE id = $3
    `, [
        passed,
        failures.length > 0 ? failures.join(', ') : null,
        offer.id,
    ]);
}

// ── Run filter on all active offers ───────────────────────────────────────
async function runFilter(jobId = null) {
    console.log('[FilterEngine] Starting filter run...');
    const thresholds = await loadThresholds();

    const offers = await db.all(`
        SELECT id, mb_campaign_id, name, epc, payout, reversal_rate,
               traffic_search, status, affiliate_status, daily_cap
        FROM mb_offers
        WHERE status = 'active'
    `);

    let passed  = 0;
    let failed  = 0;
    let changed = 0;

    for (const offer of offers) {
        const prev   = await db.get(
            `SELECT passes_filter FROM mb_offers WHERE id = $1`, [offer.id]
        );
        const { passed: pass, failures } = evaluateOffer(offer, thresholds);

        await writeFilterResult(offer, pass, failures, jobId);

        if (prev?.passes_filter !== pass) changed++;
        if (pass) passed++; else failed++;
    }

    console.log(`[FilterEngine] Done — ${passed} passed, ${failed} failed, ${changed} state changes`);
    return { total: offers.length, passed, failed, changed };
}

// ── Run filter on a single offer (for on-demand re-evaluation) ────────────
async function filterSingleOffer(offerId) {
    const thresholds = await loadThresholds();
    const offer = await db.get(`
        SELECT id, mb_campaign_id, name, epc, payout, reversal_rate,
               traffic_search, status, affiliate_status, daily_cap
        FROM mb_offers WHERE id = $1
    `, [offerId]);

    if (!offer) return null;

    const { passed, failures } = evaluateOffer(offer, thresholds);
    await writeFilterResult(offer, passed, failures, null);
    return { passed, failures };
}

module.exports = { runFilter, filterSingleOffer, evaluateOffer, loadThresholds };
