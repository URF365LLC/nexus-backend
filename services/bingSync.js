'use strict';
require('dotenv').config();
const axios          = require('axios');
const Anthropic      = require('@anthropic-ai/sdk');
const { getAccessToken } = require('./bingAuth');
const { db }         = require('./db');

/**
 * NEXUS Bing Sync — Enhanced Keyword Intelligence
 *
 * Strategy to reach 1000+ keywords per offer:
 *   Round 1: Claude Haiku generates 80-100 seeds by intent category
 *            (problem, transactional, commercial, informational)
 *   Round 2: Bing KeywordIdeas on AI seeds → ~400-600 results
 *   Round 3: Re-seed Bing with top low-competition Round 2 results → ~400-600 more
 *   Deduplicate + classify intent + score by opportunity index
 *
 * The intent-organized seeds surface angles competitors miss entirely:
 *   problem queries, question variants, symptom-based, long-tail comparisons.
 *
 * Rate limit: 6 requests/min — enforced via _lastRequestAt.
 */

const DEVELOPER_TOKEN   = process.env.BING_DEVELOPER_TOKEN;
const CUSTOMER_ID       = process.env.BING_CUSTOMER_ID;
const ACCOUNT_ID        = process.env.BING_ACCOUNT_ID;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const KEYWORD_IDEAS_URL = 'https://adinsight.api.bingads.microsoft.com/AdInsight/v13/KeywordIdeas/query';
const REQUESTS_PER_MIN  = 6;
const MIN_DELAY_MS      = Math.ceil(60000 / REQUESTS_PER_MIN); // ~10s

let _lastRequestAt = 0;

// ── Rate-limited Bing API request ─────────────────────────────────────────
async function bingRequest(endpoint, body) {
    const now  = Date.now();
    const wait = Math.max(0, MIN_DELAY_MS - (now - _lastRequestAt));
    if (wait > 0) await new Promise(r => setTimeout(r, wait));

    const token = await getAccessToken();
    _lastRequestAt = Date.now();

    const res = await axios.post(endpoint, body, {
        headers: {
            'Authorization':     `Bearer ${token}`,
            'DeveloperToken':    DEVELOPER_TOKEN,
            'CustomerId':        CUSTOMER_ID,
            'CustomerAccountId': ACCOUNT_ID,
            'Content-Type':      'application/json',
        },
        timeout: 30000,
    });

    await updateRateLimitState(res.status);
    return res.data;
}

// ── Get keyword ideas for a set of seed terms ─────────────────────────────
async function getKeywordIdeas(seeds, language = 'English', country = 'US') {
    const body = {
        SearchParameters: [
            {
                Type:    'QuerySearchParameter',
                Queries: seeds.slice(0, 200),
            },
            {
                Type:      'LanguageSearchParameter',
                Languages: [{ Language: language }],
            },
            {
                Type:      'LocationSearchParameter',
                Locations: [{ LocationId: getCountryId(country) }],
            },
            {
                Type:    'NetworkSearchParameter',
                Network: { Network: 'OwnedAndOperatedAndSyndicatedSearch' },
            },
        ],
        IdeaAttributes: [
            'Keyword',
            'Competition',
            'MonthlySearchCounts',
            'SuggestedBid',
            'AdImpressionShare',
        ],
    };

    try {
        return await bingRequest(KEYWORD_IDEAS_URL, body);
    } catch (err) {
        if (err.response?.status === 429) {
            await handleThrottle(err);
            return null;
        }
        throw err;
    }
}

// ── Parse keyword ideas response into rows ────────────────────────────────
const COMPETITION_MAP = { Low: 0.2, Medium: 0.5, High: 0.85 };

function safeMonthlyAvg(monthlySearchCounts) {
    if (!monthlySearchCounts || !Array.isArray(monthlySearchCounts)) return 0;
    const nums = monthlySearchCounts
        .map(n => (typeof n === 'number' ? n : parseFloat(n)))
        .filter(n => !isNaN(n) && isFinite(n) && n >= 0);
    if (nums.length === 0) return 0;
    return Math.min(
        Math.round(nums.reduce((a, b) => a + b, 0) / nums.length),
        10_000_000 // cap at 10M — any higher is a data anomaly
    );
}

function parseKeywordIdeas(data) {
    const ideas = data?.KeywordIdeas || data?.value || [];
    return ideas.map(idea => ({
        keyword:           idea.Keyword || idea.keyword,
        avg_monthly:       safeMonthlyAvg(idea.MonthlySearchCounts),
        competition_level: idea.Competition || 'Medium',
        competition_index: COMPETITION_MAP[idea.Competition] ?? 0.5,
        suggested_bid:     parseFloat(idea.SuggestedBid) || null,
        trend_data:        idea.MonthlySearchCounts || null,
    }));
}

// ── Classify keyword intent via regex heuristics ──────────────────────────
function classifyIntent(keyword) {
    const kw = keyword.toLowerCase();

    // Transactional — clear purchase intent
    if (/\b(buy|order|purchase|get|sign up|enroll|start|join|try|subscribe|free trial|apply|book|hire|download|install|activate)\b/.test(kw)) {
        return 'transactional';
    }
    if (/\b(price|cost|cheap|affordable|discount|deal|coupon|promo|offer|pricing|per month|per year|\$)\b/.test(kw)) {
        return 'transactional';
    }

    // Commercial investigation — comparing before buying
    if (/\b(best|top|review|reviews|vs\.?|versus|compare|comparison|alternative|alternatives|worth it|recommend|recommended|rating|ranked|ranking)\b/.test(kw)) {
        return 'commercial';
    }

    // Navigational — brand or specific product lookup
    if (/\b(login|log in|sign in|account|website|official|near me|location|contact|phone|number)\b/.test(kw)) {
        return 'navigational';
    }

    // Informational — research, learning, questions
    return 'informational';
}

// ── Compute opportunity score: high volume + low competition + low bid ────
// Normalized to 0–10000 range. Higher = better untapped opportunity.
function calcOpportunityScore(kw) {
    const volume      = Math.min(kw.avg_monthly || 0, 10000000);
    const competition = kw.competition_index ?? 0.5;
    const bid         = Math.max(kw.suggested_bid || 1, 0.10);
    const raw = (volume * (1 - competition)) / bid;
    // Log-scale compress + cap so it stays within NUMERIC(20,4)
    return Math.min(Math.round(raw), 9999999);
}

// ── AI seed generation using Claude Haiku ─────────────────────────────────
// Returns two tiers:
//   broad    — 10-15 SHORT generic vertical terms (1-3 words) that trigger
//              maximum Bing expansion (e.g. "weight loss", "diet pills")
//   specific — 60-80 offer-specific seeds organized by intent
async function generateAISeeds(offer) {
    if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set');

    const client = new Anthropic({ apiKey: ANTHROPIC_API_KEY });

    const offerContext = [
        `Offer: ${offer.name}`,
        offer.description ? `Description: ${offer.description.slice(0, 400)}` : null,
        offer.vertical    ? `Vertical: ${offer.vertical}` : null,
        offer.keywords_raw ? `Advertiser keywords: ${offer.keywords_raw.slice(0, 300)}` : null,
    ].filter(Boolean).join('\n');

    const prompt = `You are a PPC keyword researcher. Generate keyword seeds for a paid search campaign.

${offerContext}

Return ONLY valid JSON:
{
  "broad": ["10-15 SHORT generic 1-3 word seeds for the VERTICAL (not the offer) — e.g. 'weight loss', 'diet pills', 'lose weight fast'. These seed broad expansion."],
  "transactional": ["15-20 offer-specific buy-intent seeds — price, cost, buy, sign up, free trial, affordable..."],
  "commercial": ["15-20 comparison/evaluation seeds — best, reviews, vs, alternative, worth it, top..."],
  "informational": ["15-20 how/what/why/guide seeds about the problem this offer solves"],
  "problem": ["15-20 problem/symptom phrasing — how the buyer describes their pain before knowing the solution"]
}

Rules: realistic US English search queries, no competitor brand names, mix of phrase lengths.`;

    const response = await client.messages.create({
        model:      'claude-haiku-4-5-20251001',
        max_tokens: 1500,
        messages:   [{ role: 'user', content: prompt }],
    });

    const text = response.content[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`No JSON in AI seed response: ${text.slice(0, 200)}`);

    const parsed = JSON.parse(jsonMatch[0]);
    return {
        broad:         (parsed.broad         || []).filter(s => typeof s === 'string'),
        transactional: (parsed.transactional || []).filter(s => typeof s === 'string'),
        commercial:    (parsed.commercial    || []).filter(s => typeof s === 'string'),
        informational: (parsed.informational || []).filter(s => typeof s === 'string'),
        problem:       (parsed.problem       || []).filter(s => typeof s === 'string'),
    };
}

// ── Programmatic keyword expansion ────────────────────────────────────────
// Applies intent-targeted templates to base keywords to generate long-tail
// variations without additional API calls. These are stored without volume
// data (avg_monthly = 0) but classified by intent for campaign use.
const EXPANSION_TEMPLATES = {
    transactional: [
        kw => `${kw} cost`,
        kw => `${kw} price`,
        kw => `affordable ${kw}`,
        kw => `cheap ${kw}`,
        kw => `${kw} near me`,
        kw => `buy ${kw} online`,
        kw => `${kw} free trial`,
        kw => `${kw} discount`,
        kw => `${kw} coupon`,
        kw => `${kw} without insurance`,
        kw => `how much does ${kw} cost`,
        kw => `${kw} for beginners`,
        kw => `get ${kw} online`,
        kw => `${kw} subscription`,
        kw => `${kw} monthly cost`,
    ],
    commercial: [
        kw => `best ${kw}`,
        kw => `top ${kw}`,
        kw => `${kw} reviews`,
        kw => `${kw} review 2025`,
        kw => `${kw} worth it`,
        kw => `${kw} alternatives`,
        kw => `${kw} vs`,
        kw => `${kw} comparison`,
        kw => `best ${kw} for women`,
        kw => `best ${kw} for men`,
        kw => `${kw} ranked`,
        kw => `is ${kw} legit`,
        kw => `${kw} pros and cons`,
        kw => `${kw} ratings`,
        kw => `${kw} that actually works`,
    ],
    informational: [
        kw => `how does ${kw} work`,
        kw => `what is ${kw}`,
        kw => `${kw} side effects`,
        kw => `${kw} benefits`,
        kw => `${kw} results`,
        kw => `is ${kw} safe`,
        kw => `${kw} guide`,
        kw => `${kw} before and after`,
        kw => `how to use ${kw}`,
        kw => `${kw} explained`,
        kw => `${kw} for weight loss`,
        kw => `${kw} long term effects`,
        kw => `${kw} how long to see results`,
        kw => `${kw} success stories`,
        kw => `${kw} tips`,
    ],
};

function programmaticExpand(baseKeywords) {
    const expanded = [];
    const seen = new Set(baseKeywords.map(k => k.toLowerCase().trim()));

    for (const kw of baseKeywords) {
        const base = kw.toLowerCase().trim();
        // Only expand short base terms (1-3 words) to avoid 8-word monstrosities
        if (base.split(' ').length > 3) continue;

        for (const [intent, templates] of Object.entries(EXPANSION_TEMPLATES)) {
            for (const fn of templates) {
                const variant = fn(base).trim();
                if (!seen.has(variant) && variant.length <= 80) {
                    seen.add(variant);
                    expanded.push({ keyword: variant, intent, programmatic: true });
                }
            }
        }
    }

    return expanded;
}

// ── Fallback: basic seeds from offer fields (no AI) ───────────────────────
function generateBasicSeeds(offer) {
    const seeds = [];
    if (offer.keywords_raw) {
        seeds.push(...offer.keywords_raw.split(/[,;\n]+/).map(s => s.trim()).filter(Boolean).slice(0, 15));
    }
    if (offer.name)     seeds.push(offer.name.toLowerCase());
    if (offer.vertical) seeds.push(offer.vertical.toLowerCase());
    return [...new Set(seeds)].slice(0, 20);
}

// ── Store seed group ───────────────────────────────────────────────────────
async function storeSeedGroup(offerId, aiSeeds, generatedBy = 'claude-haiku') {
    await db.run(`UPDATE kw_seed_groups SET is_active = FALSE WHERE offer_id = $1`, [offerId]);

    const primarySeeds   = [...(aiSeeds.transactional || []), ...(aiSeeds.commercial || [])];
    const longTailSeeds  = [...(aiSeeds.informational || []), ...(aiSeeds.problem    || [])];

    const result = await db.run(`
        INSERT INTO kw_seed_groups
            (offer_id, generated_by, primary_seeds, long_tail_seeds, raw_output, is_active)
        VALUES ($1, $2, $3, $4, $5, TRUE)
        RETURNING id
    `, [
        offerId,
        generatedBy,
        primarySeeds,
        longTailSeeds,
        JSON.stringify(aiSeeds),
    ]);

    return result.rows?.[0]?.id;
}

// ── Store keywords + metrics for an offer ────────────────────────────────
async function storeKeywords(offerId, seedGroupId, keywords) {
    let stored = 0;

    for (const kw of keywords) {
        if (!kw.keyword) continue;

        const normalized = kw.keyword.toLowerCase().trim();
        const intent     = kw.intent || classifyIntent(normalized);
        const oppScore   = kw.opportunity_score ?? calcOpportunityScore(kw);

        // Upsert keyword
        const kwResult = await db.run(`
            INSERT INTO kw_keywords
                (offer_id, seed_group_id, keyword, keyword_normalized, intent, api_source)
            VALUES ($1, $2, $3, $4, $5::keyword_intent, 'bing')
            ON CONFLICT (offer_id, keyword_normalized, match_type) DO UPDATE SET
                intent     = EXCLUDED.intent,
                updated_at = NOW()
            RETURNING id
        `, [offerId, seedGroupId, kw.keyword, normalized, intent]);

        const kwId = kwResult.rows?.[0]?.id;
        if (!kwId) continue;

        // Upsert metrics
        await db.run(`
            INSERT INTO kw_metrics
                (keyword_id, api_source, avg_monthly_searches,
                 competition_level, competition_index,
                 suggested_bid, trend_data, opportunity_score,
                 data_month, fetched_at)
            VALUES ($1, 'bing', $2, $3, $4, $5, $6, $7, DATE_TRUNC('month', NOW()), NOW())
            ON CONFLICT (keyword_id, data_month) DO UPDATE SET
                avg_monthly_searches = EXCLUDED.avg_monthly_searches,
                competition_level    = EXCLUDED.competition_level,
                competition_index    = EXCLUDED.competition_index,
                suggested_bid        = EXCLUDED.suggested_bid,
                trend_data           = EXCLUDED.trend_data,
                opportunity_score    = EXCLUDED.opportunity_score,
                fetched_at           = NOW()
        `, [
            kwId,
            kw.avg_monthly        || 0,
            kw.competition_level  || 'Medium',
            kw.competition_index  ?? null,
            kw.suggested_bid      ?? null,
            kw.trend_data ? JSON.stringify(kw.trend_data) : null,
            oppScore,
        ]);

        stored++;
    }

    return stored;
}

// ── Sync keyword intelligence for a single offer ──────────────────────────
//
// Three-tier strategy to reach 1000+ keywords:
//
//  Round 1 — BROAD seeds (10-15 generic 1-3 word vertical terms)
//            Bing expands these aggressively → 200-500 results
//
//  Round 2 — SPECIFIC seeds (offer intent: transactional/commercial/problem)
//            Returns offer-relevant clusters with metrics → 100-300 new
//
//  Round 3 — PROGRAMMATIC expansion
//            Applies 24 templates to short base keywords from R1+R2
//            → 400-800 additional long-tail variants (no API call)
//            These get avg_monthly=0 but carry intent classification
//
async function syncOfferKeywords(offer) {
    console.log(`[BingSync] Processing: ${offer.name}`);

    // ── Step 1: Generate AI seeds (broad + specific) ──────────────────────
    let aiSeeds;
    let generatedBy = 'claude-haiku';

    try {
        aiSeeds = await generateAISeeds(offer);
        const total = Object.values(aiSeeds).reduce((n, arr) => n + arr.length, 0);
        console.log(`  [Seeds] AI generated ${total} seeds (broad:${aiSeeds.broad.length} transactional:${aiSeeds.transactional.length} commercial:${aiSeeds.commercial.length} informational:${aiSeeds.informational.length} problem:${aiSeeds.problem.length})`);
    } catch (err) {
        console.warn(`  [Seeds] AI generation failed (${err.message}) — falling back to basic seeds`);
        const basic = generateBasicSeeds(offer);
        aiSeeds     = { broad: basic.slice(0, 10), transactional: basic, commercial: [], informational: [], problem: [] };
        generatedBy = 'nexus-seed-parser';
    }

    const seedGroupId = await storeSeedGroup(offer.id, aiSeeds, generatedBy);
    const seen        = new Set();
    const allKeywords = [];

    function addKeywords(rawList) {
        for (const kw of rawList) {
            if (!kw.keyword) continue;
            const normalized = kw.keyword.toLowerCase().trim();
            if (seen.has(normalized)) continue;
            seen.add(normalized);
            allKeywords.push({
                ...kw,
                intent:            kw.intent || classifyIntent(normalized),
                opportunity_score: kw.programmatic ? 0 : calcOpportunityScore(kw),
            });
        }
    }

    // ── Round 1: BROAD seeds → Bing (maximum expansion) ──────────────────
    if (aiSeeds.broad.length > 0) {
        console.log(`  [Round 1] Broad seeds (${aiSeeds.broad.length}) → Bing...`);
        const r1Data = await getKeywordIdeas(aiSeeds.broad.slice(0, 200));
        const r1Raw  = r1Data ? parseKeywordIdeas(r1Data) : [];
        console.log(`  [Round 1] ${r1Raw.length} results`);
        addKeywords(r1Raw);
    }

    // ── Round 2: SPECIFIC seeds → Bing (offer-intent coverage) ──────────
    const specificSeeds = [
        ...aiSeeds.transactional,
        ...aiSeeds.commercial,
        ...aiSeeds.informational,
        ...aiSeeds.problem,
    ].filter(Boolean);

    if (specificSeeds.length > 0) {
        console.log(`  [Round 2] Specific seeds (${Math.min(specificSeeds.length, 200)}) → Bing...`);
        const r2Data = await getKeywordIdeas(specificSeeds.slice(0, 200));
        const r2Raw  = r2Data ? parseKeywordIdeas(r2Data) : [];
        console.log(`  [Round 2] ${r2Raw.length} results (${seen.size} total unique so far)`);
        addKeywords(r2Raw);
    }

    // ── Round 3: Programmatic long-tail expansion (no API call) ──────────
    // Expand from: (a) short Bing-validated keywords + (b) short AI seeds
    // Both sources together ensure we hit 1000+ total keywords
    const bingBaseTerms = allKeywords
        .filter(kw => kw.avg_monthly > 0 && kw.keyword.split(' ').length <= 3)
        .sort((a, b) => b.avg_monthly - a.avg_monthly)
        .slice(0, 60)
        .map(kw => kw.keyword);

    const aiBaseTerms = [
        ...aiSeeds.broad,
        ...specificSeeds.filter(s => s.split(' ').length <= 3),
    ].filter(Boolean);

    const baseForExpansion = [...new Set([...bingBaseTerms, ...aiBaseTerms])];
    const programmatic = programmaticExpand(baseForExpansion);
    console.log(`  [Round 3] Programmatic expansion: ${programmatic.length} long-tail variants from ${baseForExpansion.length} base terms`);
    addKeywords(programmatic);

    // ── Sort: Bing-validated by opportunity score, programmatic at end ────
    allKeywords.sort((a, b) => {
        if (a.programmatic !== b.programmatic) return a.programmatic ? 1 : -1;
        return b.opportunity_score - a.opportunity_score;
    });

    const bingCount        = allKeywords.filter(k => !k.programmatic).length;
    const programmaticCount = allKeywords.filter(k =>  k.programmatic).length;
    const intentBreakdown  = allKeywords.reduce((acc, kw) => {
        acc[kw.intent] = (acc[kw.intent] || 0) + 1;
        return acc;
    }, {});

    console.log(`  [Total] ${allKeywords.length} keywords — ${bingCount} Bing-validated + ${programmaticCount} programmatic`);
    console.log(`  [Intent] ${JSON.stringify(intentBreakdown)}`);
    if (allKeywords[0]) {
        console.log(`  [Top]   "${allKeywords[0].keyword}" — vol:${allKeywords[0].avg_monthly} comp:${allKeywords[0].competition_level} score:${allKeywords[0].opportunity_score}`);
    }

    // ── Store ─────────────────────────────────────────────────────────────
    const stored = await storeKeywords(offer.id, seedGroupId, allKeywords);
    console.log(`  [Store] ${stored} keywords saved for "${offer.name}"`);
    return stored;
}

// ── Sync all qualified offers ─────────────────────────────────────────────
async function syncAllKeywords() {
    if (!DEVELOPER_TOKEN || !CUSTOMER_ID || !ACCOUNT_ID) {
        throw new Error('[BingSync] BING_DEVELOPER_TOKEN, BING_CUSTOMER_ID, BING_ACCOUNT_ID must be set');
    }

    console.log('[BingSync] Starting keyword intelligence sync (enhanced 3-round expansion)...');

    const maxOffers = parseInt(
        (await db.get(`SELECT value FROM sys_config WHERE key = 'max_offers_per_kw_batch'`))?.value || '10'
    );

    const offers = await db.all(`
        SELECT o.id, o.mb_campaign_id, o.name, o.keywords_raw, o.vertical, o.description
        FROM mb_offers o
        WHERE o.passes_filter = TRUE
          AND o.status = 'active'
          AND NOT EXISTS (
              SELECT 1 FROM kw_seed_groups sg
              WHERE sg.offer_id = o.id
                AND sg.is_active = TRUE
                AND sg.created_at >= NOW() - INTERVAL '30 days'
          )
        ORDER BY (
            SELECT score_total FROM offer_scores WHERE offer_id = o.id
        ) DESC NULLS LAST
        LIMIT $1
    `, [maxOffers]);

    console.log(`[BingSync] ${offers.length} offers need keyword data`);

    let totalKeywords = 0;
    let processed     = 0;

    for (const offer of offers) {
        try {
            const count = await syncOfferKeywords(offer);
            totalKeywords += count;
        } catch (err) {
            console.error(`[BingSync] Failed for "${offer.name}": ${err.message}`);
        }
        processed++;
        console.log(`[BingSync] Progress: ${processed}/${offers.length} — ${totalKeywords} total keywords`);
    }

    console.log(`[BingSync] Done — ${processed} offers, ${totalKeywords} keywords stored`);

    await db.run(`
        INSERT INTO sys_sync_jobs
            (job_type, job_status, records_processed, triggered_by, completed_at)
        VALUES ('kw_intelligence', 'completed', $1, 'scheduler', NOW())
    `, [totalKeywords]);

    return { processed, totalKeywords };
}

// ── Rate limit tracking ───────────────────────────────────────────────────
async function updateRateLimitState(httpStatus) {
    const isThrottled    = httpStatus === 429;
    const throttledUntil = isThrottled
        ? new Date(Date.now() + 60000).toISOString()
        : null;

    await db.run(`
        INSERT INTO sys_api_rate_limits
            (service, endpoint, window_start, requests_made, last_request_at,
             is_throttled, throttled_until, last_http_status)
        VALUES ('bing', 'KeywordIdeas', DATE_TRUNC('hour', NOW()), 1, NOW(), $1, $2, $3)
        ON CONFLICT (service, endpoint, window_start) DO UPDATE SET
            requests_made        = sys_api_rate_limits.requests_made + 1,
            last_request_at      = NOW(),
            is_throttled         = EXCLUDED.is_throttled,
            throttled_until      = EXCLUDED.throttled_until,
            last_http_status     = EXCLUDED.last_http_status,
            throttle_event_count = CASE WHEN EXCLUDED.is_throttled
                THEN sys_api_rate_limits.throttle_event_count + 1
                ELSE sys_api_rate_limits.throttle_event_count
            END
    `, [isThrottled, throttledUntil, httpStatus]);
}

async function handleThrottle(_err) {
    const backoffSecs = parseInt(
        (await db.get(`SELECT value FROM sys_config WHERE key = 'bing_throttle_backoff_seconds'`))?.value || '60'
    );
    console.warn(`[BingSync] 429 — backing off ${backoffSecs}s`);
    await updateRateLimitState(429);
    await new Promise(r => setTimeout(r, backoffSecs * 1000));
}

// ── Country location ID map ───────────────────────────────────────────────
function getCountryId(country) {
    const map = { US: 190, CA: 32, GB: 223, AU: 13, NZ: 153 };
    return map[country] || 190;
}

module.exports = { syncAllKeywords, syncOfferKeywords, generateAISeeds, generateBasicSeeds };
