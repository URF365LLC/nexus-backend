'use strict';
require('dotenv').config();
const axios        = require('axios');
const { getToken, forceRefresh } = require('./mbAuth');
const { db }       = require('./db');

const MB_BASE_URL    = process.env.MB_BASE_URL || 'https://api.maxbounty.com/affiliates/api';
const CAMPAIGN_LISTS = ['new', 'popular', 'suggested', 'top', 'trending', 'amPicks', 'recentlyApproved'];

// ── Authenticated MB GET — retries once on 401 ────────────────────────────
async function mbGet(path, params = {}) {
    try {
        const token = await getToken();
        return await axios.get(`${MB_BASE_URL}${path}`, {
            headers: { 'x-access-token': token },
            params,
            timeout: 15000,
        });
    } catch (err) {
        if (err.response?.status === 401) {
            console.warn('[MBSync] 401 — force-refreshing token...');
            const token = await forceRefresh();
            return await axios.get(`${MB_BASE_URL}${path}`, {
                headers: { 'x-access-token': token },
                params,
                timeout: 15000,
            });
        }
        throw err;
    }
}

// ── Upsert a single offer into mb_offers ──────────────────────────────────
async function upsertOffer(data) {
    return db.run(`
        INSERT INTO mb_offers (
            mb_campaign_id, name, description, keywords_raw, vertical,
            payout, payout_type, epc,
            conversion_type,
            traffic_search, traffic_social, traffic_native, traffic_display,
            traffic_email, traffic_mobile, traffic_push, traffic_contextual,
            traffic_incentive, traffic_brand_bid,
            desktop_traffic, mobile_traffic,
            search_restriction, email_rules,
            suppression_required,
            os_filtering, os_list,
            geo_filtering,
            daily_cap, has_cap, expiry_date,
            thumbnail_url, landing_page_sample,
            tracking_type,
            status, affiliate_status,
            is_bookmarked, highlight,
            last_synced_at
        ) VALUES (
            $1,$2,$3,$4,$5,
            $6,$7,$8,
            $9,
            $10,$11,$12,$13,$14,$15,$16,$17,$18,$19,
            $20,$21,
            $22,$23,
            $24,
            $25,$26,
            $27,
            $28,$29,$30,
            $31,$32,
            $33,
            $34,$35,
            $36,$37,
            NOW()
        )
        ON CONFLICT ON CONSTRAINT mb_offers_mb_campaign_id_key DO UPDATE SET
            name                = EXCLUDED.name,
            description         = EXCLUDED.description,
            keywords_raw        = EXCLUDED.keywords_raw,
            vertical            = EXCLUDED.vertical,
            payout              = EXCLUDED.payout,
            payout_type         = EXCLUDED.payout_type,
            epc                 = EXCLUDED.epc,
            conversion_type     = EXCLUDED.conversion_type,
            traffic_search      = EXCLUDED.traffic_search,
            traffic_social      = EXCLUDED.traffic_social,
            traffic_native      = EXCLUDED.traffic_native,
            traffic_display     = EXCLUDED.traffic_display,
            traffic_email       = EXCLUDED.traffic_email,
            traffic_mobile      = EXCLUDED.traffic_mobile,
            traffic_push        = EXCLUDED.traffic_push,
            traffic_contextual  = EXCLUDED.traffic_contextual,
            traffic_incentive   = EXCLUDED.traffic_incentive,
            traffic_brand_bid   = EXCLUDED.traffic_brand_bid,
            desktop_traffic     = EXCLUDED.desktop_traffic,
            mobile_traffic      = EXCLUDED.mobile_traffic,
            search_restriction  = EXCLUDED.search_restriction,
            email_rules         = EXCLUDED.email_rules,
            suppression_required = EXCLUDED.suppression_required,
            os_filtering        = EXCLUDED.os_filtering,
            os_list             = EXCLUDED.os_list,
            geo_filtering       = EXCLUDED.geo_filtering,
            daily_cap           = EXCLUDED.daily_cap,
            has_cap             = EXCLUDED.has_cap,
            expiry_date         = EXCLUDED.expiry_date,
            thumbnail_url       = EXCLUDED.thumbnail_url,
            landing_page_sample = EXCLUDED.landing_page_sample,
            tracking_type       = EXCLUDED.tracking_type,
            status              = EXCLUDED.status,
            affiliate_status    = EXCLUDED.affiliate_status,
            is_bookmarked       = EXCLUDED.is_bookmarked,
            highlight           = EXCLUDED.highlight,
            last_synced_at      = NOW()
        RETURNING id, mb_campaign_id
    `, [
        data.mb_campaign_id,
        data.name,
        data.description,
        data.keywords_raw,
        data.vertical,
        data.payout,
        data.payout_type,
        data.epc,
        data.conversion_type,
        data.traffic_search,
        data.traffic_social,
        data.traffic_native,
        data.traffic_display,
        data.traffic_email,
        data.traffic_mobile,
        data.traffic_push,
        data.traffic_contextual,
        data.traffic_incentive,
        data.traffic_brand_bid,
        data.desktop_traffic,
        data.mobile_traffic,
        data.search_restriction,
        data.email_rules,
        data.suppression_required,
        data.os_filtering,
        data.os_list,
        data.geo_filtering,
        data.daily_cap,
        data.has_cap,
        data.expiry_date,
        data.thumbnail_url,
        data.landing_page_sample,
        data.tracking_type,
        data.status,
        data.affiliate_status,
        data.is_bookmarked,
        data.highlight,
    ]);
}

// ── Upsert geo records for an offer ──────────────────────────────────────
async function upsertOfferGeo(offerId, countries) {
    if (!Array.isArray(countries) || countries.length === 0) return;
    for (const code of countries) {
        if (!code || code.length !== 2) continue;
        await db.run(`
            INSERT INTO mb_offer_geo (offer_id, country_code)
            VALUES ($1, $2)
            ON CONFLICT (offer_id, country_code) DO NOTHING
        `, [offerId, code.toUpperCase()]);
    }
}

// ── Upsert landing pages for an offer ────────────────────────────────────
async function upsertLandingPages(offerId, pages) {
    if (!Array.isArray(pages) || pages.length === 0) return;
    await db.run(`DELETE FROM mb_offer_landing_pages WHERE offer_id = $1`, [offerId]);
    for (const lp of pages) {
        await db.run(`
            INSERT INTO mb_offer_landing_pages
                (offer_id, mb_lp_id, name, landing_url, thumbnail_url, is_default)
            VALUES ($1, $2, $3, $4, $5, $6)
        `, [
            offerId,
            lp.landing_page_id,
            lp.name || null,
            lp.full || lp.landing_url || null,
            lp.thumbnail || null,
            lp.default_lp === 'Y',
        ]);
    }
}

// ── Upsert creatives for an offer ─────────────────────────────────────────
async function upsertCreatives(offerId, creatives) {
    if (!Array.isArray(creatives) || creatives.length === 0) return;
    await db.run(`DELETE FROM mb_offer_creatives WHERE offer_id = $1`, [offerId]);
    for (const cr of creatives) {
        await db.run(`
            INSERT INTO mb_offer_creatives
                (offer_id, mb_creative_id, creative_type, width, height)
            VALUES ($1, $2, $3, $4, $5)
        `, [
            offerId,
            cr.creative_id,
            cr.type || null,
            cr.width || null,
            cr.height || null,
        ]);
    }
}

// ── Log a sync job ────────────────────────────────────────────────────────
async function logJob(jobType, status, processed = 0, message = '') {
    await db.run(`
        INSERT INTO sys_sync_jobs
            (job_type, job_status, records_processed, error_message, triggered_by, completed_at)
        VALUES ($1, $2, $3, $4, 'scheduler', NOW())
    `, [jobType, status, processed, message || null]);
}

// ── Parse traffic type flags from MB API response ─────────────────────────
function parseTrafficTypes(allowed) {
    if (!allowed || typeof allowed !== 'object') return {};
    return {
        traffic_search:     allowed.search_traffic      === 'Y',
        traffic_social:     allowed.social_media_traffic === 'Y',
        traffic_native:     allowed.native_traffic      === 'Y',
        traffic_display:    allowed.display_traffic     === 'Y',
        traffic_email:      allowed.email_traffic       === 'Y',
        traffic_mobile:     allowed.mobile_traffic      === 'Y',
        traffic_push:       allowed.push_traffic        === 'Y',
        traffic_contextual: allowed.contextual_traffic  === 'Y',
        traffic_incentive:  allowed.incentive_traffic   === 'Y',
        traffic_brand_bid:  allowed.brand_bid_traffic   === 'Y',
    };
}

// ── Normalize conversion type to the Nexus enum ──────────────────────────
function normalizeConversionType(raw) {
    if (!raw) return null;
    const map = {
        'EMAIL_SUBMIT': 'email_submit', 'EMAIL SUBMIT': 'email_submit',
        'SOI':          'email_submit',
        'DOI':          'email_submit',
        'LEAD':         'lead',         'LEAD GEN': 'lead', 'LEAD_GEN': 'lead',
        'SALE':         'sale',         'CPS': 'sale',
        'CALL':         'call',
        'APP_INSTALL':  'app_install',
        'TRIAL':        'trial',        'FREE_TRIAL': 'trial',
        'FREE_SIGNUP':  'free_signup',
        'SURVEY':       'survey',
        'ZIP_SUBMIT':   'zip_submit',
        'CLICK':        'click',
        'CC_SUBMIT':    'sale',         'CC SUBMIT': 'sale',
    };
    return map[String(raw).toUpperCase().trim()] || null;
}

// ── Normalize status to the Nexus enum ───────────────────────────────────
function normalizeStatus(raw) {
    if (!raw) return 'active';
    const s = String(raw).toLowerCase();
    if (s === 'active')  return 'active';
    if (s === 'paused')  return 'paused';
    if (s === 'expired') return 'expired';
    if (s === 'pending') return 'pending';
    return 'active';
}

// ── Normalize Date — handles "No expiry" from MB API ──────────────────────
function normalizeDate(raw) {
    if (!raw) return null;
    const s = String(raw).trim();
    if (s.toLowerCase() === 'no expiry' || s === '0000-00-00' || s === '') {
        return null;
    }
    // Check if it looks like a valid ISO date YYYY-MM-DD
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
        return s;
    }
    return null;
}

// ── Normalize Integer — handles "Unlimited" ──────────────────────────────
function normalizeInt(raw) {
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim().toLowerCase();
    if (s === 'unlimited' || s === 'none' || s === '') {
        return null;
    }
    const n = parseInt(s, 10);
    return isNaN(n) ? null : n;
}

// ── Fetch a paginated campaign list ───────────────────────────────────────
async function fetchList(listType, maxPages = 20) {
    const results = [];
    for (let page = 1; page <= maxPages; page++) {
        try {
            const res       = await mbGet(`/campaigns/${listType}`, { page, limit: 50 });
            const campaigns = res.data?.campaigns || [];
            if (campaigns.length === 0) break;
            results.push(...campaigns);
            if (campaigns.length < 50) break;
            await new Promise(r => setTimeout(r, 300));
        } catch (err) {
            console.error(`[MBSync] Error fetching list "${listType}" page ${page}:`, err.message);
            break;
        }
    }
    return results;
}

// ── Fetch + upsert full campaign detail ───────────────────────────────────
async function syncCampaignDetail(mbCampaignId) {
    try {
        await new Promise(r => setTimeout(r, 200));
        const res  = await mbGet(`/campaign/${mbCampaignId}`);
        const data = res.data;
        if (!data?.success) return null;

        const d           = data.details || {};
        const commissions = Array.isArray(data.commission)
            ? data.commission
            : (data.commission ? [data.commission] : []);
        const defaultComm = commissions.find(c => c.default_rate === 'Y') || commissions[0] || {};

        const rateStr   = defaultComm.rate || '';
        const rateMatch = String(rateStr).match(/[\d.]+/);
        const payout    = rateMatch ? parseFloat(rateMatch[0]) : 0;
        const traffic   = parseTrafficTypes(data.allowed_traffic_types);

        const row = await upsertOffer({
            mb_campaign_id:     mbCampaignId,
            name:               d.name || null,
            description:        d.description || null,
            keywords_raw:       d.keywords || null,
            vertical:           data.category || d.category || null,
            payout,
            payout_type:        defaultComm.rate_type || null,
            epc:                parseFloat(d.epc) || 0,
            conversion_type:    normalizeConversionType(defaultComm.conversion_type),
            ...traffic,
            desktop_traffic:    d.desktop_traffic !== 'N',
            mobile_traffic:     d.mobile_traffic  !== 'N',
            search_restriction: d.search_restriction || null,
            email_rules:        d.email_rules || null,
            suppression_required: d.suppression_required === 'Y',
            os_filtering:       d.os_filtering === 'Y',
            os_list:            data.os_list || [],
            geo_filtering:      d.geo_filtering === 'Y',
            daily_cap:          normalizeInt(d.daily_cap),
            has_cap:            !!normalizeInt(d.daily_cap),
            expiry_date:        normalizeDate(d.expiry_date),
            thumbnail_url:      d.preview_url || data.preview_url || null,
            landing_page_sample: null,
            tracking_type:      d.tracking_type || null,
            status:             normalizeStatus(d.status),
            affiliate_status:   d.affiliate_campaign_status || data.application_status || null,
            is_bookmarked:      !!data.is_bookmarked,
            highlight:          d.highlight === 'Y',
        });

        const offerId = row.rows?.[0]?.id;
        if (!offerId) return null;

        const countries = Array.isArray(data.allowed_countries) ? data.allowed_countries : [];
        await upsertOfferGeo(offerId, countries);
        await upsertLandingPages(offerId, data.landing_pages || []);
        await upsertCreatives(offerId, data.creatives || []);

        return offerId;
    } catch (err) {
        console.error(`[MBSync] Detail sync failed for campaign ${mbCampaignId}:`, err.message);
        return null;
    }
}

// ── Main sync: pull all lists, fetch detail for each ─────────────────────
async function syncAllOffers(lists = CAMPAIGN_LISTS) {
    console.log(`[MBSync] Starting offer sync — lists: ${lists.join(', ')}`);
    const started = Date.now();

    const seen = new Set();
    for (const listType of lists) {
        const campaigns = await fetchList(listType);
        console.log(`[MBSync] "${listType}" → ${campaigns.length} campaigns`);
        for (const c of campaigns) {
            if (c.campaign_id) seen.add(c.campaign_id);
        }
    }

    console.log(`[MBSync] ${seen.size} unique campaigns to sync with full detail...`);
    let synced = 0;
    let failed = 0;

    for (const id of seen) {
        const result = await syncCampaignDetail(id);
        if (result) synced++; else failed++;
        if ((synced + failed) % 25 === 0) {
            console.log(`[MBSync] Progress: ${synced + failed}/${seen.size} (${synced} ok, ${failed} failed)`);
        }
    }

    const elapsed = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[MBSync] Done in ${elapsed}s — ${synced} synced, ${failed} failed`);
    await logJob('mb_offer_sync', synced > 0 ? 'completed' : 'failed', synced,
        `${synced} synced, ${failed} failed in ${elapsed}s`);

    return { synced, failed, total: seen.size };
}

module.exports = { syncAllOffers, syncCampaignDetail, mbGet };
