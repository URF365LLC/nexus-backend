'use strict';
require('dotenv').config();
const axios     = require('axios');
const Anthropic = require('@anthropic-ai/sdk');
const { db }    = require('./db');

/**
 * NEXUS Report Engine
 *
 * Two-stage AI pipeline per offer:
 *   Stage 1 — Perplexity: live web research on the vertical/offer
 *   Stage 2 — Claude:     synthesizes DB data + research into a 10-section
 *                         intelligence report stored in report_intelligence
 *
 * Also writes keyword plan rows to report_keyword_plan.
 */

const anthropic   = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const PPLX_KEY    = process.env.PERPLEXITY_API_KEY;
const PPLX_URL    = 'https://api.perplexity.ai/chat/completions';
const PPLX_MODEL   = 'sonar-pro';
const CLAUDE_MODEL = process.env.REPORT_MODEL || 'claude-opus-4-6';

// ── Stage 1: Perplexity research ─────────────────────────────────────────────
async function researchOffer(offer, score) {
    const vertical   = offer.vertical || 'performance marketing';
    const convType   = offer.conversion_type || 'lead';
    const geos       = offer.geo_list?.join(', ') || 'US';
    const payout     = parseFloat(offer.payout).toFixed(2);

    const query = [
        `Affiliate marketing intelligence report for: "${offer.name}"`,
        `Vertical: ${vertical} | Conversion: ${convType} | Payout: $${payout} | Geo: ${geos}`,
        `Research: (1) Who are the top competing affiliates and what ad angles are they running?`,
        `(2) What search keywords drive conversions in this vertical right now?`,
        `(3) What is the typical CPC range for these keywords on Bing/Google?`,
        `(4) What audience demographics convert best for this offer type?`,
        `(5) Any compliance issues, ad platform restrictions, or brand bidding rules?`,
        `(6) What is the current market trend for this vertical — growing, stable, or declining?`,
        `Focus on actionable affiliate/PPC intelligence, not general information.`,
    ].join(' ');

    console.info(`  [Research] Querying Perplexity for: ${offer.name}`);
    const start = Date.now();

    try {
        const res = await axios.post(PPLX_URL, {
            model:    PPLX_MODEL,
            messages: [
                {
                    role:    'system',
                    content: 'You are an expert CPA affiliate marketing analyst. Provide specific, actionable intelligence for media buyers. Focus on PPC/search traffic strategies, keyword intelligence, competitor analysis, and conversion optimization. Be concise and data-driven.',
                },
                { role: 'user', content: query },
            ],
            max_tokens:  1500,
            temperature: 0.2,
            search_recency_filter: 'month',
        }, {
            headers: {
                'Authorization': `Bearer ${PPLX_KEY}`,
                'Content-Type':  'application/json',
            },
            timeout: 45000,
        });

        const summary     = res.data.choices?.[0]?.message?.content || '';
        const elapsedMs   = Date.now() - start;
        const inputTokens = res.data.usage?.prompt_tokens || 0;
        const outTokens   = res.data.usage?.completion_tokens || 0;

        // Store raw research in report_market_research
        await db.run(`
            INSERT INTO report_market_research
                (offer_id, research_type, api_source, query_used,
                 raw_response, parsed_data, summary, is_valid,
                 expires_at, fetched_at)
            VALUES ($1, 'competitive_intelligence', 'perplexity', $2, $3, $4, $5, TRUE,
                    NOW() + INTERVAL '7 days', NOW())
        `, [
            offer.id,
            query,
            JSON.stringify(res.data),
            JSON.stringify({ model: PPLX_MODEL, input_tokens: inputTokens, output_tokens: outTokens, elapsed_ms: elapsedMs }),
            summary,
        ]);

        console.info(`  [Research] Done (${elapsedMs}ms, ${inputTokens}+${outTokens} tokens)`);
        return summary;

    } catch (err) {
        const msg = err.response?.data?.error?.message || err.message;
        console.error(`  [Research] Perplexity failed: ${msg}`);
        return null; // Non-fatal — Claude can still run without research
    }
}

// ── Format keyword section for prompt ────────────────────────────────────────
function formatKeywordSection(kwData) {
    const kws = kwData?.keywords_by_intent || [];
    if (!kws.length) return '- No validated keyword data available yet';
    return kws.map(kw =>
        `  • [${kw.intent}] "${kw.keyword}" — vol:${kw.avg_monthly_searches} comp:${kw.competition_level} bid:$${kw.suggested_bid || '?'}`
    ).join('\n');
}

// ── Build Claude prompt ───────────────────────────────────────────────────────
function buildPrompt(offer, score, kwData, geoList, research) {
    const payout      = parseFloat(offer.payout || 0).toFixed(2);
    const epc         = parseFloat(offer.epc    || 0).toFixed(4);
    const breakevenCpc = score.breakeven_cpc ? parseFloat(score.breakeven_cpc).toFixed(4) : 'unknown';
    const estCvr      = score.estimated_cvr  ? (parseFloat(score.estimated_cvr) * 100).toFixed(2) + '%' : 'unknown';
    const avgCpc      = kwData?.avg_cpc       ? '$' + parseFloat(kwData.avg_cpc).toFixed(2) : 'no data yet';
    const kwVolume    = kwData?.total_volume  ? kwData.total_volume.toLocaleString() : 'no data yet';

    return `You are the NEXUS CPA Intelligence Engine. Generate a comprehensive, actionable affiliate campaign intelligence report.

## OFFER DATA
- **Name**: ${offer.name}
- **Payout**: $${payout} (${offer.payout_type || 'CPA'})
- **Conversion Type**: ${offer.conversion_type || 'unknown'}
- **Vertical**: ${offer.vertical || 'unknown'}
- **EPC (network)**: $${epc}
- **Estimated CVR**: ${estCvr}
- **Breakeven CPC**: $${breakevenCpc}
- **Daily Cap**: ${offer.daily_cap ? offer.daily_cap + ' conversions' : 'Unlimited'}
- **Geo**: ${geoList.join(', ') || 'US'}
- **Traffic Allowed**: Search=${offer.traffic_search}, Social=${offer.traffic_social}, Native=${offer.traffic_native}, Display=${offer.traffic_display}
- **Desktop**: ${offer.desktop_traffic} | **Mobile**: ${offer.mobile_traffic}
- **Search Restriction**: ${offer.search_restriction || 'None'}
- **Suppression Required**: ${offer.suppression_required ? 'Yes' : 'No'}

## SCORE DATA
- **Total Score**: ${score.score_total}/100 (Tier ${score.tier})
- **Confidence**: ${score.confidence_score}%
- **Mode**: ${score.is_bootstrap_mode ? 'Bootstrap (no own data yet)' : 'Own data'}
- EPC score: ${score.score_epc} | Payout score: ${score.score_payout}
- Competition: ${score.score_competition} | Reversal penalty: ${score.score_reversal_penalty}
- Geo match: ${score.score_geo_match} | Traffic compat: ${score.score_traffic_compat}
- Cap penalty: ${score.score_cap_penalty}

## KEYWORD INTELLIGENCE (Bing-Validated, Intent-Weighted)
- Avg CPC: ${avgCpc}
- Total monthly search volume: ${kwVolume}
- Avg competition index: ${kwData?.avg_competition ? (parseFloat(kwData.avg_competition) * 100).toFixed(0) + '%' : 'no data'}
${formatKeywordSection(kwData)}

## LIVE MARKET RESEARCH (Perplexity)
${research || 'Research unavailable — base analysis on offer data only.'}

---

Generate the report in exactly this JSON structure. Be specific, actionable, and concise in each section. Do not pad with generic advice.

\`\`\`json
{
  "section_offer_analysis": "2-3 paragraph analysis of the offer's monetization mechanics, payout structure, and what makes it attractive or risky for a media buyer. Reference the specific payout, CVR, and breakeven CPC.",

  "section_audience_profile": "Specific demographic and psychographic profile of the converting user. Age range, income level, intent signals, device preference, time-of-day patterns. Base on conversion type and vertical.",

  "section_geo_opportunity": "Analysis of the geo targeting. Which countries/states are highest opportunity, estimated traffic volume differences, any geo-specific compliance notes.",

  "section_market_trends": "Is this vertical growing, stable, or declining? Seasonal patterns, recent regulatory changes, market saturation level. Based on research data.",

  "section_traffic_strategy": "Specific search traffic strategy: recommended match types (exact/phrase/broad), bidding strategy (manual CPC vs tCPA), landing page angle recommendations, ad copy hooks that work for this vertical.",

  "section_keyword_plan": "Top 10-15 specific keywords to target (transactional + commercial intent). Include estimated CPC ranges and priority level. Format as a readable list.",

  "section_competitive_pressure": "Who are the main competitors bidding on these keywords? What ad angles are they using? How crowded is the space? Estimated difficulty to enter profitably.",

  "section_compliance_notes": "All restrictions: search terms blocked, brand bidding rules, suppression list requirements, platform-specific rules (Google vs Bing), any legal/regulatory considerations for this vertical.",

  "section_cost_model": "Full cost model for a test campaign: recommended starting daily budget, target CPC, projected clicks/day, projected conversions/day at estimated CVR, projected daily earnings, projected ROI at breakeven. Show the math.",

  "section_positioning": "Recommended ad copy angles and value propositions. 2-3 headline concepts, description line ideas, and landing page CTA recommendations that align with the conversion type.",

  "section_go_no_go": "Final verdict: GO, CAUTION, or NO-GO. One paragraph explaining the recommendation with the key factors. If GO: what to test first. If CAUTION: what conditions must be met. If NO-GO: what would change the verdict.",

  "keywords_top_transactional": ["keyword1", "keyword2"],
  "keywords_top_commercial": ["keyword1", "keyword2"],
  "keywords_long_tail": ["keyword1", "keyword2"],
  "keywords_negative": ["keyword1", "keyword2"],
  "recommended_max_cpc": 0.00,
  "recommended_daily_budget": 0.00
}
\`\`\`

Return only the JSON object. No preamble, no explanation outside the JSON.`;
}

// ── Stage 2: Claude synthesis ─────────────────────────────────────────────────
async function synthesizeReport(offer, score, kwData, geoList, research) {
    console.info(`  [Synthesis] Calling Claude for: ${offer.name}`);
    const start = Date.now();

    const prompt = buildPrompt(offer, score, kwData, geoList, research);

    const msg = await anthropic.messages.create({
        model:      CLAUDE_MODEL,
        max_tokens: 8000,
        messages:   [{ role: 'user', content: prompt }],
    });

    const elapsedMs    = Date.now() - start;
    const inputTokens  = msg.usage?.input_tokens  || 0;
    const outputTokens = msg.usage?.output_tokens || 0;
    const raw          = msg.content?.[0]?.text   || '';

    // Extract JSON from response — try fenced block first, then bare object
    let parsed;
    // Try fenced block first, then outermost { } span
    const fenced   = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/s);
    const objStart = raw.indexOf('{');
    const objEnd   = raw.lastIndexOf('}');
    const jsonStr  = fenced?.[1] || (objStart !== -1 && objEnd !== -1 ? raw.slice(objStart, objEnd + 1) : null);
    if (!jsonStr) {
        console.error('  [Synthesis] Raw response (first 500 chars):', raw.slice(0, 500));
        throw new Error('No JSON found in Claude response');
    }
    try {
        parsed = JSON.parse(jsonStr);
    } catch (e) {
        console.error('  [Synthesis] JSON parse error:', e.message);
        console.error('  [Synthesis] JSON string (first 500):', jsonStr.slice(0, 500));
        throw new Error('Failed to parse Claude JSON: ' + e.message);
    }
    console.info(`  [Synthesis] Done (${elapsedMs}ms, ${inputTokens}+${outputTokens} tokens)`);

    return { parsed, elapsedMs, inputTokens, outputTokens };
}

// ── Assemble full markdown report ─────────────────────────────────────────────
function buildMarkdownReport(offer, score, parsed) {
    const tier    = score.tier;
    const total   = score.score_total;
    const payout  = parseFloat(offer.payout).toFixed(2);
    const now     = new Date().toISOString().split('T')[0];

    return `# NEXUS Intelligence Report
## ${offer.name}
**Generated:** ${now} | **Score:** ${total}/100 (Tier ${tier}) | **Payout:** $${payout}

---

### 1. Offer Analysis
${parsed.section_offer_analysis}

---

### 2. Audience Profile
${parsed.section_audience_profile}

---

### 3. Geo Opportunity
${parsed.section_geo_opportunity}

---

### 4. Market Trends
${parsed.section_market_trends}

---

### 5. Traffic Strategy
${parsed.section_traffic_strategy}

---

### 6. Keyword Plan
${parsed.section_keyword_plan}

---

### 7. Competitive Pressure
${parsed.section_competitive_pressure}

---

### 8. Compliance Notes
${parsed.section_compliance_notes}

---

### 9. Cost Model
${parsed.section_cost_model}

---

### 10. Positioning & Ad Copy
${parsed.section_positioning}

---

### Go / No-Go Verdict
${parsed.section_go_no_go}

---
*NEXUS CPA Intelligence Engine | Powered by Perplexity + Claude*
`;
}

// ── Store report in DB ────────────────────────────────────────────────────────
async function storeReport(offer, score, parsed, fullMd, elapsedMs, inputTokens, outputTokens, confidence) {
    // Upsert report_intelligence (one active report per offer)
    const result = await db.run(`
        INSERT INTO report_intelligence (
            offer_id, score_id, status, version,
            section_offer_analysis, section_audience_profile,
            section_geo_opportunity, section_market_trends,
            section_traffic_strategy, section_keyword_plan,
            section_competitive_pressure, section_compliance_notes,
            section_cost_model, section_positioning, section_go_no_go,
            full_report_md, confidence_score, data_completeness,
            generated_by, generation_time_ms, input_tokens, output_tokens,
            generated_at
        ) VALUES (
            $1,$2,'completed',$3,
            $4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,
            $15,$16,$17,
            'perplexity+claude-opus-4-6',$18,$19,$20,
            NOW()
        )
        ON CONFLICT ON CONSTRAINT report_intelligence_offer_id_key DO UPDATE SET
            score_id                   = EXCLUDED.score_id,
            status                     = 'completed',
            version                    = report_intelligence.version + 1,
            section_offer_analysis     = EXCLUDED.section_offer_analysis,
            section_audience_profile   = EXCLUDED.section_audience_profile,
            section_geo_opportunity    = EXCLUDED.section_geo_opportunity,
            section_market_trends      = EXCLUDED.section_market_trends,
            section_traffic_strategy   = EXCLUDED.section_traffic_strategy,
            section_keyword_plan       = EXCLUDED.section_keyword_plan,
            section_competitive_pressure = EXCLUDED.section_competitive_pressure,
            section_compliance_notes   = EXCLUDED.section_compliance_notes,
            section_cost_model         = EXCLUDED.section_cost_model,
            section_positioning        = EXCLUDED.section_positioning,
            section_go_no_go           = EXCLUDED.section_go_no_go,
            full_report_md             = EXCLUDED.full_report_md,
            confidence_score           = EXCLUDED.confidence_score,
            data_completeness          = EXCLUDED.data_completeness,
            generated_by               = EXCLUDED.generated_by,
            generation_time_ms         = EXCLUDED.generation_time_ms,
            input_tokens               = EXCLUDED.input_tokens,
            output_tokens              = EXCLUDED.output_tokens,
            generated_at               = NOW(),
            updated_at                 = NOW()
        RETURNING id
    `, [
        offer.id, score.score_id, 1,
        parsed.section_offer_analysis     || '',
        parsed.section_audience_profile   || '',
        parsed.section_geo_opportunity    || '',
        parsed.section_market_trends      || '',
        parsed.section_traffic_strategy   || '',
        parsed.section_keyword_plan       || '',
        parsed.section_competitive_pressure || '',
        parsed.section_compliance_notes   || '',
        parsed.section_cost_model         || '',
        parsed.section_positioning        || '',
        parsed.section_go_no_go           || '',
        fullMd,
        confidence, confidence,
        elapsedMs, inputTokens, outputTokens,
    ]);

    const reportId = result.rows?.[0]?.id;
    if (!reportId) return null;

    // Store keyword plan
    if (parsed.keywords_top_transactional?.length || parsed.keywords_top_commercial?.length) {
        await db.run(`
            INSERT INTO report_keyword_plan
                (offer_id, report_id,
                 keywords_top_transactional, keywords_top_commercial,
                 keywords_long_tail, keywords_negative,
                 recommended_max_cpc, recommended_daily_budget,
                 created_at)
            VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
            ON CONFLICT ON CONSTRAINT report_keyword_plan_offer_id_key DO UPDATE SET
                report_id                  = EXCLUDED.report_id,
                keywords_top_transactional = EXCLUDED.keywords_top_transactional,
                keywords_top_commercial    = EXCLUDED.keywords_top_commercial,
                keywords_long_tail         = EXCLUDED.keywords_long_tail,
                keywords_negative          = EXCLUDED.keywords_negative,
                recommended_max_cpc        = EXCLUDED.recommended_max_cpc,
                recommended_daily_budget   = EXCLUDED.recommended_daily_budget
        `, [
            offer.id, reportId,
            parsed.keywords_top_transactional || [],
            parsed.keywords_top_commercial    || [],
            parsed.keywords_long_tail         || [],
            parsed.keywords_negative          || [],
            parseFloat(parsed.recommended_max_cpc)      || null,
            parseFloat(parsed.recommended_daily_budget) || null,
        ]);
    }

    return reportId;
}

// ── Generate report for one offer ────────────────────────────────────────────
async function generateOfferReport(offer) {
    console.info(`\n[ReportEngine] Processing: ${offer.name}`);

    // Mark as generating so the UI can show in-progress state.
    // The caller's catch block is responsible for flipping to 'failed' on error.
    await db.run(`
        INSERT INTO report_intelligence (offer_id, status, generated_by, generated_at)
        VALUES ($1, 'generating', $2, NOW())
        ON CONFLICT ON CONSTRAINT report_intelligence_offer_id_key
        DO UPDATE SET status = 'generating', updated_at = NOW()
    `, [offer.id, `perplexity+${CLAUDE_MODEL}`]).catch(err =>
        console.error(`  [ReportEngine] Could not set generating status: ${err.message}`)
    );

    // Load score
    const score = await db.get(`
        SELECT s.*, s.id as score_id
        FROM offer_scores s WHERE s.offer_id = $1
    `, [offer.id]);
    if (!score) { console.warn(`  [ReportEngine] No score found for offer ${offer.id} — skipping`); return null; }

    // Load keyword summary (aggregate stats)
    const kwData = await db.get(`
        SELECT avg_cpc, total_monthly_volume AS total_volume, avg_competition
        FROM v_offer_keyword_summary WHERE offer_id = $1
    `, [offer.id]);

    // Load intent-weighted keywords for report context.
    // Transactional first (highest CPA conversion probability), then commercial,
    // then informational. Keywords with search volume data feed the prompt.
    const kwByIntent = await db.all(`
        SELECT kw.keyword, kw.intent,
               m.avg_monthly_searches, m.competition_level,
               m.suggested_bid, m.opportunity_score
        FROM kw_keywords kw
        JOIN kw_metrics m ON m.keyword_id = kw.id
        WHERE kw.offer_id = $1
          AND kw.is_negative = FALSE
          AND m.avg_monthly_searches > 0
        ORDER BY
            CASE kw.intent
                WHEN 'transactional'  THEN 1
                WHEN 'commercial'     THEN 2
                WHEN 'informational'  THEN 3
                WHEN 'navigational'   THEN 4
            END,
            m.opportunity_score DESC NULLS LAST
        LIMIT 30
    `, [offer.id]);

    // Merge keyword data immutably for prompt builder
    const enrichedKwData = kwData ? { ...kwData, keywords_by_intent: kwByIntent } : { keywords_by_intent: kwByIntent };

    // Load geo list
    const geoRows = await db.all(`SELECT country_code FROM mb_offer_geo WHERE offer_id = $1`, [offer.id]);
    const geoList = geoRows.map(r => r.country_code);

    // Stage 1: Perplexity research
    const research = await researchOffer({ ...offer, geo_list: geoList }, score);

    // Stage 2: Claude synthesis
    const { parsed, elapsedMs, inputTokens, outputTokens } =
        await synthesizeReport(offer, score, enrichedKwData, geoList, research);

    // Assemble markdown
    const fullMd = buildMarkdownReport(offer, score, parsed);

    // Store
    const reportId = await storeReport(
        offer, score, parsed, fullMd,
        elapsedMs, inputTokens, outputTokens,
        parseFloat(score.confidence_score) || 50,
    );

    console.info(`  [ReportEngine] Report stored — ID: ${reportId}`);
    return reportId;
}

// ── Generate reports for all qualifying offers ─────────────────────────────────
async function generateAllReports(options = {}) {
    const { forceRegenerate = false, limit = 50 } = options;

    console.info('[ReportEngine] Starting report generation...');

    // Flip any records stuck in 'generating' for > 15 minutes to 'failed'.
    // These are reports where the process crashed or was killed mid-run.
    const stuck = await db.run(`
        UPDATE report_intelligence
        SET status = 'failed', updated_at = NOW()
        WHERE status = 'generating'
          AND updated_at < NOW() - INTERVAL '15 minutes'
    `).catch(err => console.error('[ReportEngine] Stuck watchdog failed:', err.message));
    if (stuck?.rowCount > 0) {
        console.warn(`[ReportEngine] Flipped ${stuck.rowCount} stuck 'generating' record(s) to 'failed'`);
    }

    const freshCutoff = forceRegenerate
        ? '1970-01-01'
        : new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(); // 24h cache

    const offers = await db.all(`
        SELECT o.*
        FROM mb_offers o
        JOIN offer_scores s ON s.offer_id = o.id
        WHERE o.passes_filter = TRUE
          AND o.status = 'active'
          AND (
              NOT EXISTS (
                  SELECT 1 FROM report_intelligence r
                  WHERE r.offer_id = o.id
                    AND r.status = 'completed'
                    AND r.generated_at > $1
              )
          )
        ORDER BY s.score_total DESC
        LIMIT $2
    `, [freshCutoff, limit]);

    console.info(`[ReportEngine] ${offers.length} offers need reports`);

    let generated = 0;
    let failed    = 0;

    for (const offer of offers) {
        try {
            const id = await generateOfferReport(offer);
            if (id) generated++; else failed++;
        } catch (err) {
            console.error(`  [ReportEngine] Failed for ${offer.name}: ${err.message}`);
            // Mark as failed in DB
            await db.run(`
                INSERT INTO report_intelligence (offer_id, status, generated_by, generated_at)
                VALUES ($1, 'failed', 'perplexity+claude-opus-4-6', NOW())
                ON CONFLICT (offer_id) DO UPDATE SET status = 'failed', updated_at = NOW()
            `, [offer.id]).catch(() => {});
            failed++;
        }

        // Rate limit: Perplexity allows ~5 req/min on sonar-pro
        if (generated + failed < offers.length) {
            await new Promise(r => setTimeout(r, 12000)); // ~5/min
        }
    }

    console.info(`\n[ReportEngine] Done — ${generated} generated, ${failed} failed`);

    await db.run(`
        INSERT INTO sys_sync_jobs
            (job_type, job_status, records_processed, triggered_by, completed_at)
        VALUES ('report_generation', $1, $2, 'scheduler', NOW())
    `, [generated > 0 ? 'completed' : 'failed', generated]);

    return { generated, failed, total: offers.length };
}

// ── Regenerate single offer report on demand ──────────────────────────────────
async function generateSingleReport(offerId) {
    const offer = await db.get(`SELECT * FROM mb_offers WHERE id = $1`, [offerId]);
    if (!offer) return null;
    return generateOfferReport(offer);
}

module.exports = { generateAllReports, generateSingleReport, generateOfferReport };
