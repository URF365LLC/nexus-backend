-- ============================================================================
-- NEXUS CPA INTELLIGENCE ENGINE — PRODUCTION DATABASE SCHEMA
-- Database: PostgreSQL 15+ (Supabase)
-- Version: 1.0.0
-- 
-- LAYER MAP:
--   Layer 1 — MaxBounty Data         (mb_*)
--   Layer 2 — Keyword Intelligence   (kw_*)
--   Layer 3 — Scoring Engine         (score_*)
--   Layer 4 — Intelligence Reports   (report_*)
--   Layer 5 — System / Operations    (sys_*)
-- ============================================================================

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";     -- fuzzy text search
CREATE EXTENSION IF NOT EXISTS "btree_gin";   -- composite GIN indexes

-- ============================================================================
-- ENUMS — Define all categorical types upfront
-- ============================================================================

CREATE TYPE traffic_type AS ENUM (
  'search', 'social', 'native', 'display', 'email',
  'mobile', 'push', 'contextual', 'incentive', 'brand_bid'
);

CREATE TYPE conversion_type AS ENUM (
  'email_submit', 'lead', 'sale', 'call', 'app_install',
  'trial', 'free_signup', 'survey', 'zip_submit', 'click'
);

CREATE TYPE offer_status AS ENUM (
  'active', 'paused', 'expired', 'pending', 'rejected'
);

CREATE TYPE job_status AS ENUM (
  'queued', 'running', 'completed', 'failed', 'retrying', 'cancelled'
);

CREATE TYPE score_tier AS ENUM (
  'S', 'A', 'B', 'C', 'D', 'F'
);

CREATE TYPE report_status AS ENUM (
  'pending', 'generating', 'completed', 'failed'
);

CREATE TYPE keyword_intent AS ENUM (
  'transactional', 'commercial', 'informational', 'navigational'
);

CREATE TYPE api_source AS ENUM (
  'maxbounty', 'bing', 'google', 'perplexity', 'openai',
  'anthropic', 'semrush', 'dataforseo'
);


-- ============================================================================
-- LAYER 1 — MAXBOUNTY DATA LAYER
-- ============================================================================

-- ----------------------------------------------------------------------------
-- mb_offers — Core offer record. The foundation of everything.
-- Every other table in the system traces back to this.
-- ----------------------------------------------------------------------------
CREATE TABLE mb_offers (
  id                    UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mb_campaign_id        INTEGER UNIQUE NOT NULL,      -- MaxBounty's own campaign ID
  name                  TEXT NOT NULL,
  description           TEXT,
  keywords_raw          TEXT,                          -- raw keyword string from MB
  vertical              TEXT,                          -- normalized vertical category
  
  -- Financials
  payout                NUMERIC(10,4) NOT NULL DEFAULT 0,
  payout_type           TEXT,                          -- '$ per lead', '% of sale', etc.
  epc                   NUMERIC(10,4) DEFAULT 0,       -- network-wide EPC at time of fetch
  epc_percentile        NUMERIC(5,2),                  -- where this EPC ranks vs all offers
  default_rate          NUMERIC(10,4),                 -- default commission rate from /campaigns/list
  
  -- Conversion
  conversion_type       conversion_type,
  conversion_description TEXT,
  
  -- Traffic eligibility flags (from allowed_traffic_types)
  traffic_search        BOOLEAN DEFAULT FALSE,
  traffic_social        BOOLEAN DEFAULT FALSE,
  traffic_native        BOOLEAN DEFAULT FALSE,
  traffic_display       BOOLEAN DEFAULT FALSE,
  traffic_email         BOOLEAN DEFAULT FALSE,
  traffic_mobile        BOOLEAN DEFAULT FALSE,
  traffic_push          BOOLEAN DEFAULT FALSE,
  traffic_contextual    BOOLEAN DEFAULT FALSE,
  traffic_incentive     BOOLEAN DEFAULT FALSE,
  traffic_brand_bid     BOOLEAN DEFAULT FALSE,
  
  -- Device targeting
  desktop_traffic       BOOLEAN DEFAULT TRUE,
  mobile_traffic        BOOLEAN DEFAULT TRUE,
  
  -- Restrictions (text fields for compliance parsing)
  search_restriction    TEXT,                          -- e.g., "No bidding on brand terms"
  email_rules           TEXT,
  email_subject_lines   TEXT,
  email_from_lines      TEXT,
  suppression_required  BOOLEAN DEFAULT FALSE,
  
  -- OS / Platform
  os_filtering          BOOLEAN DEFAULT FALSE,
  os_list               TEXT[],                        -- ['ios','android']
  
  -- Geo
  geo_filtering         BOOLEAN DEFAULT FALSE,
  
  -- Caps and scheduling
  daily_cap             INTEGER,                       -- NULL = no cap
  has_cap               BOOLEAN DEFAULT FALSE,
  expiry_date           DATE,
  
  -- Assets
  thumbnail_url         TEXT,
  landing_page_sample   TEXT,
  
  -- Tracking
  tracking_type         CHAR(1),                       -- S=server, J=pixel, I=iframe
  
  -- Status
  status                offer_status DEFAULT 'active',
  affiliate_status      TEXT,                          -- Approved / Pending / Rejected
  is_bookmarked         BOOLEAN DEFAULT FALSE,
  highlight             BOOLEAN DEFAULT FALSE,
  
  -- Quality signals (computed, updated by scoring job)
  reversal_rate         NUMERIC(5,4) DEFAULT 0,        -- fraction: 0.05 = 5% reversal rate
  epc_trend_7d          NUMERIC(6,4),                  -- EPC delta over last 7 days
  epc_trend_30d         NUMERIC(6,4),                  -- EPC delta over last 30 days
  epc_velocity          TEXT,                          -- 'rising','falling','stable'
  
  -- Normalization flags (set by normalization job)
  is_normalized         BOOLEAN DEFAULT FALSE,
  normalization_version INTEGER DEFAULT 0,
  
  -- Qualification (set by rule-based filter)
  passes_filter         BOOLEAN,                       -- NULL = not yet evaluated
  filter_failure_reason TEXT,
  
  -- Timestamps
  mb_created_at         TIMESTAMPTZ,                   -- when offer launched on MB
  first_seen_at         TIMESTAMPTZ DEFAULT NOW(),
  last_synced_at        TIMESTAMPTZ DEFAULT NOW(),
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mb_offers_campaign_id    ON mb_offers(mb_campaign_id);
CREATE INDEX idx_mb_offers_status         ON mb_offers(status);
CREATE INDEX idx_mb_offers_passes_filter  ON mb_offers(passes_filter);
CREATE INDEX idx_mb_offers_epc            ON mb_offers(epc DESC);
CREATE INDEX idx_mb_offers_payout         ON mb_offers(payout DESC);
CREATE INDEX idx_mb_offers_vertical       ON mb_offers(vertical);
CREATE INDEX idx_mb_offers_traffic_search ON mb_offers(traffic_search) WHERE traffic_search = TRUE;
CREATE INDEX idx_mb_offers_updated        ON mb_offers(updated_at DESC);
CREATE INDEX idx_mb_offers_name_trgm      ON mb_offers USING GIN(name gin_trgm_ops);


-- ----------------------------------------------------------------------------
-- mb_offer_geo — Countries allowed per offer (normalized from allowed_countries)
-- ----------------------------------------------------------------------------
CREATE TABLE mb_offer_geo (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id    UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  country_code CHAR(2) NOT NULL,                       -- ISO 3166-1 alpha-2
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_mb_offer_geo_unique ON mb_offer_geo(offer_id, country_code);
CREATE INDEX idx_mb_offer_geo_offer_id      ON mb_offer_geo(offer_id);
CREATE INDEX idx_mb_offer_geo_country       ON mb_offer_geo(country_code);


-- ----------------------------------------------------------------------------
-- mb_offer_landing_pages — All LP variants per offer
-- ----------------------------------------------------------------------------
CREATE TABLE mb_offer_landing_pages (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id        UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  mb_lp_id        INTEGER NOT NULL,
  name            TEXT,
  landing_url     TEXT,
  thumbnail_url   TEXT,
  is_default      BOOLEAN DEFAULT FALSE,
  
  -- Performance (populated from /reports/landingPages)
  clicks          INTEGER DEFAULT 0,
  leads           INTEGER DEFAULT 0,
  earnings        NUMERIC(12,4) DEFAULT 0,
  conversion_rate NUMERIC(8,6) DEFAULT 0,
  epc             NUMERIC(10,4) DEFAULT 0,
  
  last_perf_sync  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mb_lp_offer_id ON mb_offer_landing_pages(offer_id);
CREATE INDEX idx_mb_lp_mb_id    ON mb_offer_landing_pages(mb_lp_id);


-- ----------------------------------------------------------------------------
-- mb_offer_creatives — Banner/creative assets per offer
-- ----------------------------------------------------------------------------
CREATE TABLE mb_offer_creatives (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id        UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  mb_creative_id  INTEGER NOT NULL,
  creative_type   TEXT,                                -- 'Banner', 'Text', 'Email', etc.
  width           INTEGER,
  height          INTEGER,
  
  -- Performance (from /reports/creatives)
  clicks          INTEGER DEFAULT 0,
  leads           INTEGER DEFAULT 0,
  earnings        NUMERIC(12,4) DEFAULT 0,
  conversion_rate NUMERIC(8,6) DEFAULT 0,
  epc             NUMERIC(10,4) DEFAULT 0,
  
  last_perf_sync  TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mb_creatives_offer_id ON mb_offer_creatives(offer_id);


-- ----------------------------------------------------------------------------
-- mb_offer_metrics_history — EPC + payout snapshots over time
-- This is the trend data. The heartbeat of offer health.
-- ----------------------------------------------------------------------------
CREATE TABLE mb_offer_metrics_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id    UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  
  epc         NUMERIC(10,4),
  payout      NUMERIC(10,4),
  daily_cap   INTEGER,
  status      offer_status,
  
  -- Snapshot context
  snapshot_source TEXT DEFAULT 'sync_job',            -- what triggered this snapshot
  captured_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mb_metrics_offer_id   ON mb_offer_metrics_history(offer_id);
CREATE INDEX idx_mb_metrics_captured   ON mb_offer_metrics_history(captured_at DESC);
CREATE INDEX idx_mb_metrics_offer_time ON mb_offer_metrics_history(offer_id, captured_at DESC);


-- ----------------------------------------------------------------------------
-- mb_performance_reports — Campaign-level earnings data (/reports/earnings)
-- Aggregated by campaign per reporting window
-- ----------------------------------------------------------------------------
CREATE TABLE mb_performance_reports (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id        UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  mb_campaign_id  INTEGER NOT NULL,
  
  -- Report window
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  
  -- Metrics
  clicks          INTEGER DEFAULT 0,
  leads           INTEGER DEFAULT 0,
  earnings        NUMERIC(12,4) DEFAULT 0,
  sales           INTEGER DEFAULT 0,
  conversion_rate NUMERIC(8,6) DEFAULT 0,
  epc             NUMERIC(10,4) DEFAULT 0,
  
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(mb_campaign_id, period_start, period_end)
);

CREATE INDEX idx_mb_perf_offer_id   ON mb_performance_reports(offer_id);
CREATE INDEX idx_mb_perf_period     ON mb_performance_reports(period_start DESC);


-- ----------------------------------------------------------------------------
-- mb_conversion_events — Individual conversion records (/reports/conversions)
-- Granular truth. Used to compute YOUR actual CVR, not MB's network average.
-- ----------------------------------------------------------------------------
CREATE TABLE mb_conversion_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id        UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  mb_campaign_id  INTEGER NOT NULL,
  mb_key_id       TEXT,                                -- MB's unique conversion ID
  
  converted_at    TIMESTAMPTZ NOT NULL,
  earnings        NUMERIC(10,4),
  status          TEXT,                                -- 'Payable', 'Pending', 'Reversal'
  
  -- Attribution
  subid1          TEXT,                                -- traffic source
  subid2          TEXT,                                -- ad group / creative
  subid3          TEXT,                                -- keyword
  subid4          TEXT,                                -- landing page variant
  subid5          TEXT,                                -- custom tracking
  
  -- Geo
  ip_country      TEXT,
  ip_region       TEXT,
  ip_city         TEXT,
  
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mb_conv_offer_id    ON mb_conversion_events(offer_id);
CREATE INDEX idx_mb_conv_converted   ON mb_conversion_events(converted_at DESC);
CREATE INDEX idx_mb_conv_status      ON mb_conversion_events(status);
CREATE INDEX idx_mb_conv_subid1      ON mb_conversion_events(subid1);
CREATE INDEX idx_mb_conv_key_id      ON mb_conversion_events(mb_key_id);


-- ----------------------------------------------------------------------------
-- mb_reversal_events — Clawback tracking (/reports/reversals)
-- HIGH PRIORITY SIGNAL. High reversal rate = avoid offer.
-- ----------------------------------------------------------------------------
CREATE TABLE mb_reversal_events (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id        UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  mb_campaign_id  INTEGER NOT NULL,
  
  lead_date       TIMESTAMPTZ,
  reversal_date   TIMESTAMPTZ,
  earnings_lost   NUMERIC(10,4),
  
  subid1          TEXT,
  subid2          TEXT,
  ip_address      TEXT,
  
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_mb_reversal_offer_id ON mb_reversal_events(offer_id);
CREATE INDEX idx_mb_reversal_date     ON mb_reversal_events(reversal_date DESC);


-- ----------------------------------------------------------------------------
-- mb_subid_performance — Source-level attribution (/reports/subid)
-- Tells you which traffic source is actually profitable per offer
-- ----------------------------------------------------------------------------
CREATE TABLE mb_subid_performance (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id        UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  mb_campaign_id  INTEGER NOT NULL,
  
  subid1          TEXT NOT NULL,
  period_start    DATE NOT NULL,
  period_end      DATE NOT NULL,
  
  clicks          INTEGER DEFAULT 0,
  leads           INTEGER DEFAULT 0,
  earnings        NUMERIC(12,4) DEFAULT 0,
  conversion_rate NUMERIC(8,6) DEFAULT 0,
  epc             NUMERIC(10,4) DEFAULT 0,
  
  fetched_at      TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(mb_campaign_id, subid1, period_start, period_end)
);

CREATE INDEX idx_mb_subid_offer_id ON mb_subid_performance(offer_id);
CREATE INDEX idx_mb_subid_value    ON mb_subid_performance(subid1);


-- ----------------------------------------------------------------------------
-- mb_tracking_links — Generated tracking links per offer/creative combo
-- Stores generated links so we don't regenerate on every request
-- ----------------------------------------------------------------------------
CREATE TABLE mb_tracking_links (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id        UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  mb_campaign_id  INTEGER NOT NULL,
  creative_id     INTEGER,
  
  subid1          TEXT,
  subid2          TEXT,
  subid3          TEXT,
  subid4          TEXT,
  subid5          TEXT,
  
  tracking_url    TEXT NOT NULL,
  
  generated_at    TIMESTAMPTZ DEFAULT NOW(),
  expires_at      TIMESTAMPTZ,                         -- NULL = no expiry
  
  UNIQUE(mb_campaign_id, creative_id, subid1, subid2, subid3)
);

CREATE INDEX idx_mb_tracking_offer_id ON mb_tracking_links(offer_id);


-- ============================================================================
-- LAYER 2 — KEYWORD INTELLIGENCE LAYER (Bing + Google)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- kw_seed_groups — AI-generated keyword seeds from offer analysis
-- One group per offer. Seeds feed into Bing API queries.
-- ----------------------------------------------------------------------------
CREATE TABLE kw_seed_groups (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id        UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  
  -- Generation metadata
  generated_by    TEXT DEFAULT 'openai-gpt4o',        -- which AI generated these
  generation_prompt TEXT,                              -- the prompt used
  raw_output      JSONB,                               -- full AI response
  
  -- Seed arrays
  primary_seeds   TEXT[],                              -- top 5-10 core keywords
  long_tail_seeds TEXT[],                              -- expanded long-tail
  negative_seeds  TEXT[],                              -- terms to exclude
  
  -- Context passed to AI
  offer_context   JSONB,                               -- snapshot of offer data used
  
  version         INTEGER DEFAULT 1,
  is_active       BOOLEAN DEFAULT TRUE,
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kw_seeds_offer_id ON kw_seed_groups(offer_id);
CREATE UNIQUE INDEX idx_kw_seeds_offer_active ON kw_seed_groups(offer_id) WHERE is_active = TRUE;


-- ----------------------------------------------------------------------------
-- kw_keywords — Individual keywords discovered via Bing Ad Insight API
-- One row per unique keyword per offer
-- ----------------------------------------------------------------------------
CREATE TABLE kw_keywords (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id        UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  seed_group_id   UUID REFERENCES kw_seed_groups(id),
  
  keyword         TEXT NOT NULL,
  keyword_normalized TEXT NOT NULL,                   -- lowercased, trimmed
  
  -- Classification
  intent          keyword_intent,
  match_type      TEXT,                               -- 'broad','phrase','exact'
  cluster_id      UUID,                               -- FK set after clustering
  
  -- Source
  api_source      api_source DEFAULT 'bing',
  
  is_negative     BOOLEAN DEFAULT FALSE,
  is_branded      BOOLEAN DEFAULT FALSE,              -- brand-bid restricted?
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(offer_id, keyword_normalized, match_type)
);

CREATE INDEX idx_kw_keywords_offer_id   ON kw_keywords(offer_id);
CREATE INDEX idx_kw_keywords_cluster    ON kw_keywords(cluster_id);
CREATE INDEX idx_kw_keywords_intent     ON kw_keywords(intent);
CREATE INDEX idx_kw_keywords_trgm       ON kw_keywords USING GIN(keyword gin_trgm_ops);


-- ----------------------------------------------------------------------------
-- kw_metrics — Historical performance metrics per keyword (Bing)
-- Refreshed monthly per Bing's data refresh cycle. Always append, never overwrite.
-- ----------------------------------------------------------------------------
CREATE TABLE kw_metrics (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword_id        UUID NOT NULL REFERENCES kw_keywords(id) ON DELETE CASCADE,
  
  api_source        api_source DEFAULT 'bing',
  
  -- Core demand metrics
  avg_monthly_searches  INTEGER,
  competition_level     TEXT,                         -- 'Low','Medium','High'
  competition_index     NUMERIC(5,4),                 -- 0.0 to 1.0
  
  -- Cost metrics
  avg_cpc               NUMERIC(10,4),                -- average cost per click
  min_cpc               NUMERIC(10,4),
  max_cpc               NUMERIC(10,4),
  suggested_bid         NUMERIC(10,4),
  
  -- Position estimates
  top_of_page_bid_low   NUMERIC(10,4),
  top_of_page_bid_high  NUMERIC(10,4),
  
  -- Trend
  trend_data            JSONB,                        -- monthly search vol array [{month, searches}]
  yoy_change            NUMERIC(6,4),                 -- year-over-year % change
  
  -- Context
  geo_scope             TEXT DEFAULT 'US',            -- country queried
  language              TEXT DEFAULT 'en',
  device_type           TEXT DEFAULT 'all',
  
  data_month            DATE,                         -- which month this data represents
  fetched_at            TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kw_metrics_keyword_id ON kw_metrics(keyword_id);
CREATE INDEX idx_kw_metrics_fetched    ON kw_metrics(fetched_at DESC);
CREATE INDEX idx_kw_metrics_kw_month   ON kw_metrics(keyword_id, data_month DESC);


-- ----------------------------------------------------------------------------
-- kw_demographics — Age/gender/device breakdown per keyword (Bing only)
-- This is the unfair advantage. Google doesn't give this at keyword level.
-- ----------------------------------------------------------------------------
CREATE TABLE kw_demographics (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword_id      UUID NOT NULL REFERENCES kw_keywords(id) ON DELETE CASCADE,
  
  -- Dimension
  dimension_type  TEXT NOT NULL,                      -- 'age_gender' | 'device'
  segment_value   TEXT NOT NULL,                      -- '18-24_M' | 'mobile' | '25-34_F'
  
  age_group       TEXT,                               -- '18-24','25-34','35-49','50-64','65+'
  gender          TEXT,                               -- 'M','F','Unknown'
  device_type     TEXT,                               -- 'mobile','desktop','tablet'
  
  -- Share of searches
  impression_share  NUMERIC(6,4),                     -- % of impressions from this segment
  click_share       NUMERIC(6,4),
  
  geo_scope         TEXT DEFAULT 'US',
  fetched_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kw_demo_keyword_id ON kw_demographics(keyword_id);
CREATE UNIQUE INDEX idx_kw_demo_unique ON kw_demographics(keyword_id, dimension_type, segment_value);


-- ----------------------------------------------------------------------------
-- kw_geo_demand — Geographic search distribution per keyword (Bing)
-- City/state/country level demand mapping
-- ----------------------------------------------------------------------------
CREATE TABLE kw_geo_demand (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword_id      UUID NOT NULL REFERENCES kw_keywords(id) ON DELETE CASCADE,
  
  -- Location
  location_type   TEXT NOT NULL,                      -- 'country','state','metro','city'
  location_name   TEXT NOT NULL,
  location_code   TEXT,                               -- state code, country code, etc.
  
  -- Demand
  search_share    NUMERIC(6,4),                       -- fraction of total searches
  search_volume   INTEGER,                            -- absolute volume if available
  
  -- Cost in this geo
  avg_cpc_geo     NUMERIC(10,4),
  
  device_type     TEXT DEFAULT 'all',
  fetched_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kw_geo_keyword_id    ON kw_geo_demand(keyword_id);
CREATE INDEX idx_kw_geo_location      ON kw_geo_demand(location_code);
CREATE INDEX idx_kw_geo_search_share  ON kw_geo_demand(search_share DESC);


-- ----------------------------------------------------------------------------
-- kw_bid_landscape — Bid curve data per keyword (Bing GetBidLandscape)
-- Multiple bid points showing clicks/impressions/cost at each price level.
-- Powers the profitability simulation curves.
-- ----------------------------------------------------------------------------
CREATE TABLE kw_bid_landscape (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  keyword_id      UUID NOT NULL REFERENCES kw_keywords(id) ON DELETE CASCADE,
  
  -- Bid point
  bid_amount      NUMERIC(10,4) NOT NULL,
  est_clicks      INTEGER,
  est_impressions INTEGER,
  est_cost        NUMERIC(12,4),
  est_ctr         NUMERIC(8,6),
  est_avg_cpc     NUMERIC(10,4),
  est_position    NUMERIC(4,2),                       -- avg ad position (1.0 = top)
  
  geo_scope       TEXT DEFAULT 'US',
  fetched_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kw_bid_landscape_kw   ON kw_bid_landscape(keyword_id);
CREATE INDEX idx_kw_bid_landscape_bid  ON kw_bid_landscape(keyword_id, bid_amount);


-- ----------------------------------------------------------------------------
-- kw_clusters — Keyword clusters by topic/intent
-- Groups related keywords for campaign structure and ad group planning
-- ----------------------------------------------------------------------------
CREATE TABLE kw_clusters (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id        UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  
  cluster_name    TEXT NOT NULL,
  cluster_theme   TEXT,                               -- e.g., "debt consolidation"
  intent_dominant keyword_intent,
  
  -- Aggregate stats (computed from member keywords)
  keyword_count   INTEGER DEFAULT 0,
  avg_cpc         NUMERIC(10,4),
  total_volume    INTEGER,
  competition_avg NUMERIC(5,4),
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_kw_clusters_offer_id ON kw_clusters(offer_id);

-- Now we can set the FK on kw_keywords
ALTER TABLE kw_keywords ADD CONSTRAINT fk_kw_cluster
  FOREIGN KEY (cluster_id) REFERENCES kw_clusters(id);


-- ============================================================================
-- LAYER 3 — SCORING ENGINE
-- ============================================================================

-- ----------------------------------------------------------------------------
-- score_weights — Configurable scoring parameters
-- Change weights here, all scores recalculate on next run. Never hardcode.
-- ----------------------------------------------------------------------------
CREATE TABLE score_weights (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  version         INTEGER UNIQUE NOT NULL,
  is_active       BOOLEAN DEFAULT FALSE,
  label           TEXT,
  
  -- Revenue signals (positive)
  w_epc                   NUMERIC(6,4) DEFAULT 0.25,
  w_payout                NUMERIC(6,4) DEFAULT 0.20,
  w_search_volume         NUMERIC(6,4) DEFAULT 0.15,
  w_epc_trend             NUMERIC(6,4) DEFAULT 0.10,
  
  -- Cost/risk signals (negative)
  w_cpc                   NUMERIC(6,4) DEFAULT 0.20,
  w_competition           NUMERIC(6,4) DEFAULT 0.05,
  w_reversal_rate         NUMERIC(6,4) DEFAULT 0.05,
  
  -- Thresholds (filter gates — binary)
  min_epc_threshold       NUMERIC(10,4) DEFAULT 0.50,
  min_payout_threshold    NUMERIC(10,4) DEFAULT 5.00,
  max_reversal_threshold  NUMERIC(5,4) DEFAULT 0.15,   -- 15% reversal = auto-reject
  min_volume_threshold    INTEGER DEFAULT 100,          -- min monthly searches
  
  -- Tier cutoffs
  tier_s_min              NUMERIC(6,2) DEFAULT 85,
  tier_a_min              NUMERIC(6,2) DEFAULT 70,
  tier_b_min              NUMERIC(6,2) DEFAULT 55,
  tier_c_min              NUMERIC(6,2) DEFAULT 40,
  tier_d_min              NUMERIC(6,2) DEFAULT 25,
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed initial weights
INSERT INTO score_weights (version, is_active, label)
VALUES (1, TRUE, 'v1.0 Initial Weights');


-- ----------------------------------------------------------------------------
-- offer_scores — Computed score per offer. Latest score = current assessment.
-- ----------------------------------------------------------------------------
CREATE TABLE offer_scores (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id        UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  weights_version INTEGER NOT NULL REFERENCES score_weights(version),
  
  -- Raw component scores (0-100 each before weighting)
  score_epc               NUMERIC(6,2),
  score_payout            NUMERIC(6,2),
  score_search_volume     NUMERIC(6,2),
  score_epc_trend         NUMERIC(6,2),
  score_cpc_efficiency    NUMERIC(6,2),               -- EPC/CPC ratio score
  score_competition       NUMERIC(6,2),
  score_reversal_penalty  NUMERIC(6,2),
  score_geo_match         NUMERIC(6,2),
  score_traffic_compat    NUMERIC(6,2),
  score_cap_penalty       NUMERIC(6,2),               -- heavy cap = penalty
  
  -- Composite
  score_total             NUMERIC(6,2) NOT NULL,
  tier                    score_tier NOT NULL,
  
  -- Profitability math
  expected_profit_per_click  NUMERIC(10,4),           -- (CVR × payout) - CPC
  estimated_cvr              NUMERIC(8,6),            -- estimated conversion rate
  breakeven_cpc              NUMERIC(10,4),           -- payout × CVR = max CPC
  traffic_adjusted_epc       NUMERIC(10,4),           -- EPC discounted for search traffic
  
  -- Metadata
  scored_at       TIMESTAMPTZ DEFAULT NOW(),
  data_snapshot   JSONB                               -- full input data used for score
);

CREATE UNIQUE INDEX idx_offer_scores_offer_id ON offer_scores(offer_id);
CREATE INDEX idx_offer_scores_tier            ON offer_scores(tier);
CREATE INDEX idx_offer_scores_total           ON offer_scores(score_total DESC);
CREATE INDEX idx_offer_scores_scored_at       ON offer_scores(scored_at DESC);


-- ----------------------------------------------------------------------------
-- offer_score_history — Score snapshots over time
-- Lets you track whether an offer is improving or declining
-- ----------------------------------------------------------------------------
CREATE TABLE offer_score_history (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id        UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  
  score_total     NUMERIC(6,2) NOT NULL,
  tier            score_tier NOT NULL,
  
  -- Key metrics at time of scoring
  epc_at_score    NUMERIC(10,4),
  cpc_at_score    NUMERIC(10,4),
  volume_at_score INTEGER,
  reversal_at_score NUMERIC(5,4),
  
  scored_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_score_history_offer_id ON offer_score_history(offer_id);
CREATE INDEX idx_score_history_scored   ON offer_score_history(scored_at DESC);
CREATE INDEX idx_score_history_offer_time ON offer_score_history(offer_id, scored_at DESC);


-- ============================================================================
-- LAYER 4 — INTELLIGENCE REPORTS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- report_market_research — Perplexity/AI web research results per offer
-- Cached raw research data before synthesis
-- ----------------------------------------------------------------------------
CREATE TABLE report_market_research (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id        UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  
  research_type   TEXT NOT NULL,                      -- 'trends','demographics','competition','seasonal'
  api_source      api_source NOT NULL,                -- 'perplexity','openai', etc.
  
  query_used      TEXT,
  raw_response    JSONB,
  parsed_data     JSONB,                              -- structured extraction from raw
  
  -- Key findings (text)
  summary         TEXT,
  
  is_valid        BOOLEAN DEFAULT TRUE,
  expires_at      TIMESTAMPTZ,                        -- when to refresh this research
  
  fetched_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_report_research_offer_id ON report_market_research(offer_id);
CREATE INDEX idx_report_research_type     ON report_market_research(research_type);
CREATE INDEX idx_report_research_expires  ON report_market_research(expires_at);


-- ----------------------------------------------------------------------------
-- report_intelligence — Full AI-synthesized intelligence reports
-- The final output of the system. 1-2 page strategic breakdown per offer.
-- ----------------------------------------------------------------------------
CREATE TABLE report_intelligence (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id        UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  score_id        UUID REFERENCES offer_scores(id),
  
  status          report_status DEFAULT 'pending',
  version         INTEGER DEFAULT 1,
  
  -- Report sections (structured)
  section_offer_analysis      TEXT,                   -- offer mechanics, advertiser quality
  section_audience_profile    TEXT,                   -- demographics, psychographics
  section_geo_opportunity     TEXT,                   -- best geos, demand map
  section_market_trends       TEXT,                   -- trend, seasonal, viral signals
  section_traffic_strategy    TEXT,                   -- which sources, why, how
  section_keyword_plan        TEXT,                   -- top keywords, clusters, negatives
  section_competitive_pressure TEXT,                  -- competition level, market saturation
  section_compliance_notes    TEXT,                   -- what's allowed, what's restricted
  section_cost_model          TEXT,                   -- CPC ranges, budget scenarios
  section_positioning         TEXT,                   -- angle, hooks, messaging direction
  section_go_no_go            TEXT,                   -- final recommendation with rationale
  
  -- Full report (assembled from sections)
  full_report_md  TEXT,                               -- full markdown report
  full_report_html TEXT,                              -- rendered HTML version
  
  -- Quality
  confidence_score NUMERIC(5,2),                      -- 0-100 how confident the system is
  data_completeness NUMERIC(5,2),                     -- % of desired data points populated
  
  -- Generation metadata
  generated_by    TEXT,                               -- model(s) used
  generation_time_ms INTEGER,
  input_tokens    INTEGER,
  output_tokens   INTEGER,
  
  generated_at    TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_report_intel_offer_id ON report_intelligence(offer_id);
CREATE INDEX idx_report_intel_status          ON report_intelligence(status);
CREATE INDEX idx_report_intel_tier            ON report_intelligence(offer_id, status);


-- ----------------------------------------------------------------------------
-- report_keyword_plan — Structured keyword plan output per offer
-- The actionable keyword list ready for campaign buildout
-- ----------------------------------------------------------------------------
CREATE TABLE report_keyword_plan (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id        UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  report_id       UUID REFERENCES report_intelligence(id),
  
  -- Keyword lists (arrays for quick access)
  keywords_top_transactional  TEXT[],
  keywords_top_commercial     TEXT[],
  keywords_long_tail          TEXT[],
  keywords_negative           TEXT[],
  keywords_branded_blocked    TEXT[],
  
  -- Campaign structure suggestion
  suggested_ad_groups         JSONB,                  -- [{name, keywords[], theme}]
  
  -- Bid recommendations
  recommended_max_cpc         NUMERIC(10,4),
  recommended_daily_budget    NUMERIC(10,4),
  
  -- SEO opportunities
  seo_low_competition         TEXT[],
  
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_report_kw_plan_offer_id ON report_keyword_plan(offer_id);


-- ============================================================================
-- LAYER 5 — SYSTEM / OPERATIONS
-- ============================================================================

-- ----------------------------------------------------------------------------
-- sys_sync_jobs — Job queue tracking for all scheduled tasks
-- Every ingestion, scoring, and research run is tracked here
-- ----------------------------------------------------------------------------
CREATE TABLE sys_sync_jobs (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  job_type        TEXT NOT NULL,                      -- 'mb_offer_sync','mb_performance_sync',
                                                      -- 'kw_intelligence','offer_scoring',
                                                      -- 'report_generation','mb_auth_refresh'
  job_status      job_status DEFAULT 'queued',
  
  -- Target
  entity_type     TEXT,                               -- 'offer','keyword','report'
  entity_id       UUID,                               -- specific record being processed
  
  -- Execution
  attempts        INTEGER DEFAULT 0,
  max_attempts    INTEGER DEFAULT 3,
  
  -- Timing
  queued_at       TIMESTAMPTZ DEFAULT NOW(),
  started_at      TIMESTAMPTZ,
  completed_at    TIMESTAMPTZ,
  next_retry_at   TIMESTAMPTZ,
  
  -- Results
  records_processed INTEGER DEFAULT 0,
  records_created   INTEGER DEFAULT 0,
  records_updated   INTEGER DEFAULT 0,
  records_failed    INTEGER DEFAULT 0,
  
  -- Error handling
  error_message   TEXT,
  error_detail    JSONB,
  
  -- Metadata
  triggered_by    TEXT DEFAULT 'scheduler',           -- 'scheduler','manual','webhook'
  job_metadata    JSONB
);

CREATE INDEX idx_sys_jobs_status     ON sys_sync_jobs(job_status);
CREATE INDEX idx_sys_jobs_type       ON sys_sync_jobs(job_type);
CREATE INDEX idx_sys_jobs_queued     ON sys_sync_jobs(queued_at DESC);
CREATE INDEX idx_sys_jobs_entity     ON sys_sync_jobs(entity_type, entity_id);


-- ----------------------------------------------------------------------------
-- sys_api_credentials — Encrypted credential store
-- Store tokens here. NEVER in .env only — rotate without redeployment.
-- ----------------------------------------------------------------------------
CREATE TABLE sys_api_credentials (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service         api_source NOT NULL,
  label           TEXT,                               -- 'maxbounty_main', 'bing_prod', etc.
  
  -- Tokens (encrypt at application layer before storing)
  access_token    TEXT,
  refresh_token   TEXT,
  api_key         TEXT,
  token_extra     JSONB,                              -- any extra fields (mb-app-token etc.)
  
  -- Expiry
  expires_at      TIMESTAMPTZ,
  refresh_before  TIMESTAMPTZ,                        -- when to proactively refresh
  
  -- Status
  is_active       BOOLEAN DEFAULT TRUE,
  last_used_at    TIMESTAMPTZ,
  last_error      TEXT,
  error_count     INTEGER DEFAULT 0,
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_sys_creds_service ON sys_api_credentials(service, is_active)
  WHERE is_active = TRUE;


-- ----------------------------------------------------------------------------
-- sys_api_rate_limits — Track API usage against limits
-- Prevent rate limit violations. Bing KP is especially tight.
-- ----------------------------------------------------------------------------
CREATE TABLE sys_api_rate_limits (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  service         api_source NOT NULL,
  endpoint        TEXT NOT NULL,                      -- specific endpoint path
  
  -- Window tracking
  window_start    TIMESTAMPTZ NOT NULL,
  window_duration_minutes INTEGER DEFAULT 60,
  
  requests_made   INTEGER DEFAULT 0,
  requests_limit  INTEGER,
  tokens_used     INTEGER DEFAULT 0,                  -- for LLM APIs
  tokens_limit    INTEGER,
  
  last_request_at TIMESTAMPTZ,
  
  UNIQUE(service, endpoint, window_start)
);

CREATE INDEX idx_sys_rate_limits_service  ON sys_api_rate_limits(service, endpoint);
CREATE INDEX idx_sys_rate_limits_window   ON sys_api_rate_limits(window_start DESC);


-- ----------------------------------------------------------------------------
-- sys_config — Key-value system configuration
-- Runtime config that can change without redeployment
-- ----------------------------------------------------------------------------
CREATE TABLE sys_config (
  key             TEXT PRIMARY KEY,
  value           TEXT NOT NULL,
  value_type      TEXT DEFAULT 'string',              -- 'string','integer','boolean','json'
  description     TEXT,
  is_sensitive    BOOLEAN DEFAULT FALSE,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Seed default config values
INSERT INTO sys_config (key, value, value_type, description) VALUES
  ('mb_sync_interval_hours',    '8',     'integer', 'How often to sync MaxBounty offers'),
  ('kw_cache_days',             '30',    'integer', 'How long to cache keyword data before refresh'),
  ('min_epc_threshold',         '0.50',  'float',   'Minimum EPC to qualify offer for keyword research'),
  ('min_payout_threshold',      '5.00',  'float',   'Minimum payout to qualify offer'),
  ('max_reversal_rate',         '0.15',  'float',   'Maximum reversal rate before auto-reject'),
  ('score_tier_s_min',          '85',    'integer', 'Minimum score for S tier'),
  ('max_offers_per_kw_batch',   '10',    'integer', 'Max offers to process per keyword intelligence batch'),
  ('report_auto_generate_tier', 'A',     'string',  'Auto-generate reports for offers at or above this tier'),
  ('bing_requests_per_minute',  '6',     'integer', 'Bing KP API rate limit per minute'),
  ('kw_seeds_per_offer',        '15',    'integer', 'Number of keyword seeds to generate per offer');


-- ----------------------------------------------------------------------------
-- sys_audit_log — Immutable audit trail for key system events
-- ----------------------------------------------------------------------------
CREATE TABLE sys_audit_log (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  
  event_type      TEXT NOT NULL,                      -- 'offer_scored','report_generated', etc.
  entity_type     TEXT,
  entity_id       UUID,
  
  actor           TEXT DEFAULT 'system',              -- 'system','scheduler','api','user'
  
  -- Before/after for mutations
  old_values      JSONB,
  new_values      JSONB,
  
  -- Context
  job_id          UUID REFERENCES sys_sync_jobs(id),
  ip_address      INET,
  
  occurred_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_sys_audit_entity     ON sys_audit_log(entity_type, entity_id);
CREATE INDEX idx_sys_audit_event      ON sys_audit_log(event_type);
CREATE INDEX idx_sys_audit_occurred   ON sys_audit_log(occurred_at DESC);


-- ============================================================================
-- VIEWS — Pre-built query surfaces for common access patterns
-- ============================================================================

-- Qualified offers with their current score
CREATE VIEW v_qualified_offers AS
SELECT
  o.id,
  o.mb_campaign_id,
  o.name,
  o.vertical,
  o.payout,
  o.epc,
  o.conversion_type,
  o.traffic_search,
  o.traffic_social,
  o.traffic_native,
  o.traffic_email,
  o.daily_cap,
  o.has_cap,
  o.reversal_rate,
  o.epc_velocity,
  o.status,
  s.score_total,
  s.tier,
  s.expected_profit_per_click,
  s.breakeven_cpc,
  s.traffic_adjusted_epc,
  s.scored_at,
  o.last_synced_at
FROM mb_offers o
LEFT JOIN offer_scores s ON s.offer_id = o.id
WHERE o.status = 'active'
  AND o.passes_filter = TRUE;

-- Top scoring offers ready for report generation
CREATE VIEW v_top_offers_pending_report AS
SELECT
  o.id AS offer_id,
  o.name,
  s.score_total,
  s.tier,
  r.status AS report_status
FROM mb_offers o
JOIN offer_scores s ON s.offer_id = o.id
LEFT JOIN report_intelligence r ON r.offer_id = o.id
WHERE o.status = 'active'
  AND s.tier IN ('S','A','B')
  AND (r.id IS NULL OR r.status = 'failed')
ORDER BY s.score_total DESC;

-- Keyword intelligence summary per offer
CREATE VIEW v_offer_keyword_summary AS
SELECT
  o.id AS offer_id,
  o.name AS offer_name,
  COUNT(DISTINCT k.id) AS total_keywords,
  COUNT(DISTINCT k.cluster_id) AS total_clusters,
  AVG(m.avg_cpc) AS avg_cpc,
  SUM(m.avg_monthly_searches) AS total_monthly_volume,
  AVG(m.competition_index) AS avg_competition
FROM mb_offers o
JOIN kw_keywords k ON k.offer_id = o.id
LEFT JOIN kw_metrics m ON m.keyword_id = k.id
WHERE k.is_negative = FALSE
GROUP BY o.id, o.name;


-- ============================================================================
-- TRIGGERS — Auto-maintain updated_at and audit trail
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to all tables with updated_at
CREATE TRIGGER trg_mb_offers_updated
  BEFORE UPDATE ON mb_offers
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_score_weights_updated
  BEFORE UPDATE ON score_weights
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_offer_scores_updated
  BEFORE UPDATE ON offer_scores
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER trg_report_intel_updated
  BEFORE UPDATE ON report_intelligence
  FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- Auto-snapshot score history when offer_scores changes
CREATE OR REPLACE FUNCTION trigger_snapshot_score_history()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (OLD.score_total != NEW.score_total) THEN
    INSERT INTO offer_score_history
      (offer_id, score_total, tier, epc_at_score, scored_at)
    VALUES
      (NEW.offer_id, NEW.score_total, NEW.tier,
       (SELECT epc FROM mb_offers WHERE id = NEW.offer_id),
       NOW());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_score_history_snapshot
  AFTER INSERT OR UPDATE ON offer_scores
  FOR EACH ROW EXECUTE FUNCTION trigger_snapshot_score_history();

-- Auto-snapshot EPC history when offer EPC changes
CREATE OR REPLACE FUNCTION trigger_snapshot_epc_history()
RETURNS TRIGGER AS $$
BEGIN
  IF (TG_OP = 'INSERT') OR (OLD.epc != NEW.epc) OR (OLD.payout != NEW.payout) THEN
    INSERT INTO mb_offer_metrics_history
      (offer_id, epc, payout, daily_cap, status, snapshot_source)
    VALUES
      (NEW.id, NEW.epc, NEW.payout, NEW.daily_cap, NEW.status, 'auto_trigger');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_epc_history_snapshot
  AFTER INSERT OR UPDATE OF epc, payout ON mb_offers
  FOR EACH ROW EXECUTE FUNCTION trigger_snapshot_epc_history();


-- ============================================================================
-- FUNCTIONS — Reusable query logic
-- ============================================================================

-- Compute reversal rate for an offer over a date range
CREATE OR REPLACE FUNCTION fn_compute_reversal_rate(
  p_offer_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS NUMERIC AS $$
DECLARE
  total_conversions INTEGER;
  total_reversals   INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_conversions
  FROM mb_conversion_events
  WHERE offer_id = p_offer_id
    AND converted_at >= NOW() - (p_days || ' days')::INTERVAL;

  SELECT COUNT(*) INTO total_reversals
  FROM mb_reversal_events
  WHERE offer_id = p_offer_id
    AND reversal_date >= NOW() - (p_days || ' days')::INTERVAL;

  IF total_conversions = 0 THEN RETURN 0; END IF;
  RETURN ROUND((total_reversals::NUMERIC / total_conversions), 4);
END;
$$ LANGUAGE plpgsql;

-- Get EPC trend for an offer (positive = rising, negative = falling)
CREATE OR REPLACE FUNCTION fn_epc_trend(
  p_offer_id UUID,
  p_days INTEGER DEFAULT 30
)
RETURNS NUMERIC AS $$
DECLARE
  epc_start NUMERIC;
  epc_end   NUMERIC;
BEGIN
  SELECT epc INTO epc_start
  FROM mb_offer_metrics_history
  WHERE offer_id = p_offer_id
    AND captured_at <= NOW() - (p_days || ' days')::INTERVAL
  ORDER BY captured_at DESC LIMIT 1;

  SELECT epc INTO epc_end
  FROM mb_offer_metrics_history
  WHERE offer_id = p_offer_id
  ORDER BY captured_at DESC LIMIT 1;

  IF epc_start IS NULL OR epc_start = 0 THEN RETURN 0; END IF;
  RETURN ROUND(((epc_end - epc_start) / epc_start), 4);
END;
$$ LANGUAGE plpgsql;


-- ============================================================================
-- ROW LEVEL SECURITY (Supabase)
-- Enable RLS for all tables — lock down to authenticated users only
-- ============================================================================

ALTER TABLE mb_offers                ENABLE ROW LEVEL SECURITY;
ALTER TABLE mb_offer_geo             ENABLE ROW LEVEL SECURITY;
ALTER TABLE mb_offer_landing_pages   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mb_offer_creatives       ENABLE ROW LEVEL SECURITY;
ALTER TABLE mb_offer_metrics_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE mb_performance_reports   ENABLE ROW LEVEL SECURITY;
ALTER TABLE mb_conversion_events     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mb_reversal_events       ENABLE ROW LEVEL SECURITY;
ALTER TABLE mb_subid_performance     ENABLE ROW LEVEL SECURITY;
ALTER TABLE mb_tracking_links        ENABLE ROW LEVEL SECURITY;
ALTER TABLE kw_seed_groups           ENABLE ROW LEVEL SECURITY;
ALTER TABLE kw_keywords              ENABLE ROW LEVEL SECURITY;
ALTER TABLE kw_metrics               ENABLE ROW LEVEL SECURITY;
ALTER TABLE kw_demographics          ENABLE ROW LEVEL SECURITY;
ALTER TABLE kw_geo_demand            ENABLE ROW LEVEL SECURITY;
ALTER TABLE kw_bid_landscape         ENABLE ROW LEVEL SECURITY;
ALTER TABLE kw_clusters              ENABLE ROW LEVEL SECURITY;
ALTER TABLE score_weights            ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_scores             ENABLE ROW LEVEL SECURITY;
ALTER TABLE offer_score_history      ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_market_research   ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_intelligence      ENABLE ROW LEVEL SECURITY;
ALTER TABLE report_keyword_plan      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sys_sync_jobs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE sys_api_credentials      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sys_api_rate_limits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE sys_config               ENABLE ROW LEVEL SECURITY;
ALTER TABLE sys_audit_log            ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- END OF SCHEMA
-- Total tables:  25
-- Total views:    3
-- Total triggers: 5
-- Total functions: 2
-- Total indexes: 60+
-- ============================================================================
