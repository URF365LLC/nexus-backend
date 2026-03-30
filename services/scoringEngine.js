'use strict';
const { db } = require('./db');

/**
 * NEXUS Scoring Engine
 *
 * Scores every filter-passing offer 0–100 across weighted dimensions.
 * Writes to offer_scores (one row per offer, upserted on each run).
 * The DB trigger trg_compute_ev auto-calculates both EV variants on upsert.
 *
 * Tiers (from score_weights active config):
 *   S ≥ 85 | A ≥ 70 | B ≥ 55 | C ≥ 40 | D ≥ 25 | F < 25
 */

// ── Load active score weights from DB ────────────────────────────────────
async function loadWeights() {
    const w = await db.get(`SELECT * FROM score_weights WHERE is_active = TRUE LIMIT 1`);
    if (!w) throw new Error('[ScoringEngine] No active score_weights row found');
    return w;
}

// ── Component scorers (each returns 0–100 raw before weighting) ──────────

function scoreEpc(epc, minEpc) {
    const e = parseFloat(epc) || 0;
    if (e <= 0)      return 0;
    if (e >= 5.0)    return 100;
    if (e >= 3.0)    return 85;
    if (e >= 1.5)    return 65;
    if (e >= minEpc) return 45;
    return 20;
}

function scorePayout(payout, minPayout) {
    const p = parseFloat(payout) || 0;
    if (p >= 100) return 100;
    if (p >= 50)  return 85;
    if (p >= 30)  return 70;
    if (p >= 15)  return 55;
    if (p >= minPayout) return 40;
    return 15;
}

function scoreSearchVolume(volume, minVolume) {
    const v = parseInt(volume) || 0;
    if (v >= 100000) return 100;
    if (v >= 50000)  return 85;
    if (v >= 10000)  return 70;
    if (v >= 1000)   return 50;
    if (v >= minVolume) return 30;
    return 0;
}

function scoreEpcTrend(epcVelocity) {
    if (epcVelocity === 'rising')  return 100;
    if (epcVelocity === 'stable')  return 60;
    if (epcVelocity === 'falling') return 20;
    return 50; // unknown
}

function scoreCpcEfficiency(epc, avgCpc) {
    const e = parseFloat(epc)    || 0;
    const c = parseFloat(avgCpc) || 0;
    if (c === 0) return 50; // no CPC data yet
    const ratio = e / c;
    if (ratio >= 3.0) return 100;
    if (ratio >= 2.0) return 85;
    if (ratio >= 1.5) return 70;
    if (ratio >= 1.0) return 55;
    if (ratio >= 0.7) return 35;
    return 10;
}

function scoreCompetition(competitionIndex) {
    const c = parseFloat(competitionIndex) || 0.5;
    // Lower competition = better score
    if (c <= 0.2) return 100;
    if (c <= 0.4) return 80;
    if (c <= 0.6) return 55;
    if (c <= 0.8) return 30;
    return 10;
}

function scoreReversalPenalty(reversalRate) {
    const r = parseFloat(reversalRate) || 0;
    if (r === 0)    return 100;
    if (r <= 0.03)  return 90;
    if (r <= 0.06)  return 70;
    if (r <= 0.10)  return 45;
    if (r <= 0.15)  return 15;
    return 0;
}

function scoreGeoMatch(geoFiltering, countries) {
    if (!geoFiltering) return 90; // no restriction = great
    const TIER1 = new Set(['US', 'CA', 'GB', 'AU', 'NZ', 'IE']);
    const c     = Array.isArray(countries) ? countries : [];
    const t1    = c.filter(x => TIER1.has(x)).length;
    if (t1 >= 3) return 100;
    if (t1 >= 2) return 80;
    if (c.includes('US')) return 70;
    if (t1 === 1) return 55;
    return 30;
}

function scoreTrafficCompat(offer) {
    let pts = 0;
    if (offer.traffic_search)     pts += 35;
    if (offer.traffic_social)     pts += 25;
    if (offer.traffic_native)     pts += 20;
    if (offer.traffic_display)    pts += 10;
    if (offer.traffic_email)      pts += 5;
    if (offer.traffic_contextual) pts += 5;
    return Math.min(pts, 100);
}

function scoreCapPenalty(hasCap, dailyCap) {
    if (!hasCap || !dailyCap) return 100;
    const cap = parseInt(dailyCap) || 0;
    if (cap >= 500) return 90;
    if (cap >= 200) return 75;
    if (cap >= 100) return 55;
    if (cap >= 50)  return 35;
    return 15;
}

// ── Compute confidence score (0–100) ─────────────────────────────────────
async function computeConfidence(offer, weights) {
    const sampleWeight     = parseFloat(weights.confidence_min_sample_weight || 0.40);
    const recencyWeight    = parseFloat(weights.confidence_recency_weight    || 0.30);
    const completenessWt   = parseFloat(weights.confidence_completeness_weight || 0.30);

    // Sample size adequacy (0–100)
    const sampleSize = parseInt(offer.own_conversion_count) || 0;
    const sampleScore = sampleSize >= 100 ? 100
                      : sampleSize >= 50  ? 80
                      : sampleSize >= 30  ? 60
                      : sampleSize >= 10  ? 35
                      : 10;

    // Data recency — how recently was the offer synced
    const daysSinceSync = offer.last_synced_at
        ? (Date.now() - new Date(offer.last_synced_at).getTime()) / 86400000
        : 30;
    const recencyScore = daysSinceSync <= 1  ? 100
                       : daysSinceSync <= 3  ? 85
                       : daysSinceSync <= 7  ? 65
                       : daysSinceSync <= 14 ? 40
                       : 15;

    // Data completeness — % of key fields populated
    const fields = [
        offer.epc, offer.payout, offer.reversal_rate,
        offer.traffic_search, offer.conversion_type, offer.vertical,
    ];
    const populated = fields.filter(f => f !== null && f !== undefined && f !== 0).length;
    const completenessScore = Math.round((populated / fields.length) * 100);

    const confidence = Math.round(
        (sampleScore     * sampleWeight)  +
        (recencyScore    * recencyWeight) +
        (completenessScore * completenessWt)
    );

    return {
        confidence_score:  Math.min(confidence, 100),
        data_completeness: completenessScore,
    };
}

// ── Determine tier from score ─────────────────────────────────────────────
function determineTier(score, w) {
    if (score >= (parseFloat(w.tier_s_min) || 85)) return 'S';
    if (score >= (parseFloat(w.tier_a_min) || 70)) return 'A';
    if (score >= (parseFloat(w.tier_b_min) || 55)) return 'B';
    if (score >= (parseFloat(w.tier_c_min) || 40)) return 'C';
    if (score >= (parseFloat(w.tier_d_min) || 25)) return 'D';
    return 'F';
}

// ── Score a single offer ──────────────────────────────────────────────────
async function scoreOffer(offer, weights, kwData = null) {
    const w = weights;

    // Keyword data augmentation (optional — null during bootstrap)
    const avgCpc          = kwData?.avg_cpc          || null;
    const avgMonthlyVol   = kwData?.total_volume      || 0;
    const competitionIdx  = kwData?.avg_competition   || 0.5;

    // Get geo countries for this offer
    const geoRows  = await db.all(
        `SELECT country_code FROM mb_offer_geo WHERE offer_id = $1`, [offer.id]
    );
    const countries = geoRows.map(r => r.country_code);

    // Component scores (raw 0–100)
    const components = {
        score_epc:              scoreEpc(offer.epc, w.min_epc_threshold),
        score_payout:           scorePayout(offer.payout, w.min_payout_threshold),
        score_search_volume:    scoreSearchVolume(avgMonthlyVol, w.min_volume_threshold),
        score_epc_trend:        scoreEpcTrend(offer.epc_velocity),
        score_cpc_efficiency:   scoreCpcEfficiency(offer.epc, avgCpc),
        score_competition:      scoreCompetition(competitionIdx),
        score_reversal_penalty: scoreReversalPenalty(offer.reversal_rate),
        score_geo_match:        scoreGeoMatch(offer.geo_filtering, countries),
        score_traffic_compat:   scoreTrafficCompat(offer),
        score_cap_penalty:      scoreCapPenalty(offer.has_cap, offer.daily_cap),
    };

    // Weighted total
    const weighted =
        components.score_epc             * parseFloat(w.w_epc)          +
        components.score_payout          * parseFloat(w.w_payout)        +
        components.score_search_volume   * parseFloat(w.w_search_volume) +
        components.score_epc_trend       * parseFloat(w.w_epc_trend)     +
        components.score_cpc_efficiency  * parseFloat(w.w_cpc)           +
        components.score_competition     * parseFloat(w.w_competition)   +
        components.score_reversal_penalty * parseFloat(w.w_reversal_rate) +
        components.score_geo_match       * 0.05 +
        components.score_traffic_compat  * 0.05 +
        components.score_cap_penalty     * 0.05;

    // Normalize: weights sum to ~1.05 (we added 3×0.05), cap at 100
    const score_total = Math.min(Math.round(weighted), 100);
    const tier        = determineTier(score_total, w);

    // Profitability math
    const estimatedCvr = offer.own_cvr
        || (offer.epc > 0 && offer.payout > 0 ? offer.epc / offer.payout : null);
    const breakeven_cpc = estimatedCvr && offer.payout
        ? parseFloat(offer.payout) * estimatedCvr
        : null;
    const traffic_adjusted_epc = offer.traffic_search
        ? parseFloat(offer.epc) * 0.85  // search traffic discount factor
        : parseFloat(offer.epc) || null;

    // Confidence
    const { confidence_score, data_completeness } = await computeConfidence(offer, w);

    // Bootstrap vs own-data mode
    const is_bootstrap_mode = !offer.has_sufficient_own_data;
    const cvr_source        = offer.our_cvr ? 'own_data' : 'bootstrap_epc';

    return {
        ...components,
        score_total,
        tier,
        confidence_score,
        data_completeness,
        is_bootstrap_mode,
        our_cvr:               offer.our_cvr || null,
        conversion_sample_size: parseInt(offer.own_conversion_count) || 0,
        cvr_source,
        estimated_cvr:         estimatedCvr,
        breakeven_cpc,
        traffic_adjusted_epc,
        avg_cpc_used:          avgCpc,
        expected_profit_per_click: estimatedCvr && offer.payout && avgCpc
            ? (estimatedCvr * parseFloat(offer.payout)) - parseFloat(avgCpc)
            : null,
    };
}

// ── Upsert score into offer_scores ────────────────────────────────────────
async function upsertScore(offerId, weightsVersion, scoreData) {
    await db.run(`
        INSERT INTO offer_scores (
            offer_id, weights_version,
            score_epc, score_payout, score_search_volume, score_epc_trend,
            score_cpc_efficiency, score_competition, score_reversal_penalty,
            score_geo_match, score_traffic_compat, score_cap_penalty,
            score_total, tier,
            confidence_score, data_completeness,
            is_bootstrap_mode, our_cvr, conversion_sample_size, cvr_source,
            expected_profit_per_click, estimated_cvr, breakeven_cpc,
            traffic_adjusted_epc, avg_cpc_used,
            scored_at
        ) VALUES (
            $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
            $15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,NOW()
        )
        ON CONFLICT ON CONSTRAINT offer_scores_offer_id_key DO UPDATE SET
            weights_version        = EXCLUDED.weights_version,
            score_epc              = EXCLUDED.score_epc,
            score_payout           = EXCLUDED.score_payout,
            score_search_volume    = EXCLUDED.score_search_volume,
            score_epc_trend        = EXCLUDED.score_epc_trend,
            score_cpc_efficiency   = EXCLUDED.score_cpc_efficiency,
            score_competition      = EXCLUDED.score_competition,
            score_reversal_penalty = EXCLUDED.score_reversal_penalty,
            score_geo_match        = EXCLUDED.score_geo_match,
            score_traffic_compat   = EXCLUDED.score_traffic_compat,
            score_cap_penalty      = EXCLUDED.score_cap_penalty,
            score_total            = EXCLUDED.score_total,
            tier                   = EXCLUDED.tier,
            confidence_score       = EXCLUDED.confidence_score,
            data_completeness      = EXCLUDED.data_completeness,
            is_bootstrap_mode      = EXCLUDED.is_bootstrap_mode,
            our_cvr                = EXCLUDED.our_cvr,
            conversion_sample_size = EXCLUDED.conversion_sample_size,
            cvr_source             = EXCLUDED.cvr_source,
            expected_profit_per_click = EXCLUDED.expected_profit_per_click,
            estimated_cvr          = EXCLUDED.estimated_cvr,
            breakeven_cpc          = EXCLUDED.breakeven_cpc,
            traffic_adjusted_epc   = EXCLUDED.traffic_adjusted_epc,
            avg_cpc_used           = EXCLUDED.avg_cpc_used,
            scored_at              = NOW()
    `, [
        offerId, weightsVersion,
        scoreData.score_epc, scoreData.score_payout, scoreData.score_search_volume,
        scoreData.score_epc_trend, scoreData.score_cpc_efficiency, scoreData.score_competition,
        scoreData.score_reversal_penalty, scoreData.score_geo_match,
        scoreData.score_traffic_compat, scoreData.score_cap_penalty,
        scoreData.score_total, scoreData.tier,
        scoreData.confidence_score, scoreData.data_completeness,
        scoreData.is_bootstrap_mode, scoreData.our_cvr, scoreData.conversion_sample_size,
        scoreData.cvr_source,
        scoreData.expected_profit_per_click, scoreData.estimated_cvr,
        scoreData.breakeven_cpc, scoreData.traffic_adjusted_epc, scoreData.avg_cpc_used,
    ]);
}

// ── Score all filter-passing offers ───────────────────────────────────────
async function scoreAllOffers() {
    console.log('[ScoringEngine] Starting scoring run...');
    const weights = await loadWeights();

    const offers = await db.all(`
        SELECT o.*, os.our_cvr, os.conversion_sample_size
        FROM mb_offers o
        LEFT JOIN offer_scores os ON os.offer_id = o.id
        WHERE o.passes_filter = TRUE
          AND o.status = 'active'
    `);

    console.log(`[ScoringEngine] Scoring ${offers.length} qualified offers...`);
    let scored = 0;

    for (const offer of offers) {
        // Pull latest keyword summary for this offer
        const kwData = await db.get(`
            SELECT avg_cpc, total_monthly_volume AS total_volume, avg_competition
            FROM v_offer_keyword_summary
            WHERE offer_id = $1
        `, [offer.id]);

        const scoreData = await scoreOffer(offer, weights, kwData);
        await upsertScore(offer.id, weights.version, scoreData);
        scored++;
    }

    console.log(`[ScoringEngine] Done — ${scored} offers scored`);

    await db.run(`
        INSERT INTO sys_sync_jobs
            (job_type, job_status, records_processed, triggered_by, completed_at)
        VALUES ('offer_scoring', 'completed', $1, 'scheduler', NOW())
    `, [scored]);

    return { scored };
}

// ── Score a single offer on demand ────────────────────────────────────────
async function scoreSingleOffer(offerId) {
    const weights = await loadWeights();
    const offer   = await db.get(`
        SELECT o.*, os.our_cvr, os.conversion_sample_size
        FROM mb_offers o
        LEFT JOIN offer_scores os ON os.offer_id = o.id
        WHERE o.id = $1
    `, [offerId]);

    if (!offer) return null;

    const kwData    = await db.get(`
        SELECT avg_cpc, total_monthly_volume AS total_volume, avg_competition
        FROM v_offer_keyword_summary WHERE offer_id = $1
    `, [offerId]);

    const scoreData = await scoreOffer(offer, weights, kwData);
    await upsertScore(offerId, weights.version, scoreData);
    return scoreData;
}

module.exports = { scoreAllOffers, scoreSingleOffer, scoreOffer, loadWeights };
