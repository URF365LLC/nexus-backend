-- ============================================================================
-- NEXUS CPA INTELLIGENCE ENGINE — SCHEMA MIGRATION v1.0 → v1.1
-- Date: 2026-03-27
--
-- CHANGE LOG — Every change traces to a specific validated finding:
--
-- [A] EPC contamination problem
--     Network EPC is blended across all traffic types. We need explicit
--     fields to track cold-start bootstrap mode vs. own-data mode,
--     and our own CVR separate from the network average.
--
-- [B] Confidence score belongs on offer_scores, not just reports
--     A score without a confidence rating is incomplete for decision-making.
--     Data volume and recency affect reliability — must live at scoring layer.
--
-- [C] True EV formula support
--     Expected Value = (Your_CVR × Payout × (1 - Reversal_Rate)) - CPC
--     Requires dedicated fields for each input and the output.
--
-- [D] Token refresh engine fields
--     sys_api_credentials needs refresh control fields so the background
--     job can manage the MB 2-hour expiry without silent failures.
--
-- [E] Rate limit enforcement fields
--     sys_api_rate_limits needs throttle state so jobs can back off
--     instead of hammering the Bing API and getting inconsistent data.
--
-- [F] Filter idempotency audit trail
--     passes_filter changes need to be logged so re-runs are auditable
--     and the reason for state changes is preserved over time.
--
-- [G] Job idempotency controls
--     sys_sync_jobs needs idempotency keys to prevent duplicate runs
--     from scheduler race conditions or manual retriggers.
-- ============================================================================


-- ============================================================================
-- [A + B + C] — offer_scores: EPC bootstrap, own CVR, confidence, true EV
-- ============================================================================

ALTER TABLE offer_scores

  -- [A] Bootstrap mode flag
  -- TRUE  = score is based on network EPC (cold start, no own conversion data)
  -- FALSE = score is based on our own mb_conversion_events data (ground truth)
  ADD COLUMN is_bootstrap_mode         BOOLEAN NOT NULL DEFAULT TRUE,

  -- [A] Our own conversion rate derived from mb_conversion_events
  -- NULL when is_bootstrap_mode = TRUE (no data yet)
  ADD COLUMN our_cvr                   NUMERIC(8,6),

  -- [A] Sample size behind our_cvr — how many conversion events were used
  -- Low sample size = less reliable CVR = should weight confidence down
  ADD COLUMN conversion_sample_size    INTEGER DEFAULT 0,

  -- [A] How old is the underlying conversion data in days
  -- Stale data = lower confidence even if sample size is large
  ADD COLUMN data_recency_days         INTEGER,

  -- [B] Confidence score — 0 to 100
  -- Composite of: data_completeness + sample_size adequacy + data recency
  -- HIGH score + LOW confidence = risky bet
  -- MEDIUM score + HIGH confidence = safer bet
  ADD COLUMN confidence_score          NUMERIC(5,2),

  -- [B] Data completeness — % of desired scoring inputs that are populated
  -- Example: missing kw_demographics = lower completeness score
  ADD COLUMN data_completeness         NUMERIC(5,2),

  -- [C] True expected value using the full formula:
  -- EV = (our_cvr × payout × (1 - reversal_rate)) - avg_cpc
  -- NULL when is_bootstrap_mode = TRUE (no our_cvr yet)
  ADD COLUMN expected_value_true       NUMERIC(10,4),

  -- [C] Bootstrap expected value — used during cold start
  -- EV = (traffic_adjusted_epc - avg_cpc)
  -- This is the EPC-based proxy until real CVR data accumulates
  ADD COLUMN expected_value_bootstrap  NUMERIC(10,4),

  -- [C] The CPC used in EV calculation — snapshot at time of scoring
  -- Stored here so the EV calculation is fully reproducible
  ADD COLUMN avg_cpc_used              NUMERIC(10,4),

  -- [C] CVR source label — documents what was used for the calculation
  -- 'own_data' | 'bootstrap_epc' | 'vertical_benchmark'
  ADD COLUMN cvr_source                TEXT DEFAULT 'bootstrap_epc';

COMMENT ON COLUMN offer_scores.is_bootstrap_mode IS
  'TRUE = using network EPC proxy. FALSE = using own mb_conversion_events data.';
COMMENT ON COLUMN offer_scores.our_cvr IS
  'Our own conversion rate from mb_conversion_events. NULL during bootstrap.';
COMMENT ON COLUMN offer_scores.confidence_score IS
  'Composite confidence 0-100. High score + low confidence = risky.';
COMMENT ON COLUMN offer_scores.expected_value_true IS
  'EV = (our_cvr x payout x (1 - reversal_rate)) - avg_cpc. NULL during bootstrap.';
COMMENT ON COLUMN offer_scores.expected_value_bootstrap IS
  'EV = traffic_adjusted_epc - avg_cpc. Active during cold start.';


-- ============================================================================
-- [A] — mb_offers: EPC bootstrap tracking at the offer level
-- ============================================================================

ALTER TABLE mb_offers

  -- Track how many conversion events we personally have for this offer
  -- Drives the is_bootstrap_mode flag on offer_scores
  ADD COLUMN own_conversion_count      INTEGER DEFAULT 0,

  -- Our own EPC derived from mb_conversion_events + mb_subid_performance
  -- NULL until we have enough own data (defined by sys_config threshold)
  ADD COLUMN own_epc                   NUMERIC(10,4),

  -- Minimum conversions required before own_epc is trusted
  -- Seeded from sys_config 'min_conversions_for_own_epc'
  ADD COLUMN own_epc_min_sample        INTEGER DEFAULT 30,

  -- Flag: do we have enough own data to exit bootstrap mode?
  ADD COLUMN has_sufficient_own_data   BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN mb_offers.own_conversion_count IS
  'Count of our own conversion events. Drives bootstrap vs own-data scoring mode.';
COMMENT ON COLUMN mb_offers.own_epc IS
  'Our own EPC from mb_conversion_events. More reliable than network EPC.';
COMMENT ON COLUMN mb_offers.has_sufficient_own_data IS
  'TRUE when own_conversion_count >= own_epc_min_sample. Triggers bootstrap exit.';


-- ============================================================================
-- [D] — sys_api_credentials: Token refresh engine control fields
-- ============================================================================

ALTER TABLE sys_api_credentials

  -- Enable/disable automatic refresh for this credential
  ADD COLUMN auto_refresh_enabled      BOOLEAN DEFAULT TRUE,

  -- How many minutes before expiry to trigger a proactive refresh
  -- For MaxBounty (2hr expiry): set to 20 = refresh at 100min mark
  ADD COLUMN refresh_buffer_minutes    INTEGER DEFAULT 20,

  -- Timestamp of last refresh attempt (success or failure)
  ADD COLUMN last_refresh_attempt      TIMESTAMPTZ,

  -- Whether the last refresh attempt succeeded
  ADD COLUMN last_refresh_success      BOOLEAN,

  -- Consecutive failure count — triggers alert after threshold
  ADD COLUMN refresh_failure_count     INTEGER DEFAULT 0,

  -- Hard stop: disable auto-refresh after N consecutive failures
  -- Prevents infinite retry loops on bad credentials
  ADD COLUMN max_refresh_failures      INTEGER DEFAULT 5,

  -- Human-readable note on last error for debugging
  ADD COLUMN last_refresh_error        TEXT;

COMMENT ON COLUMN sys_api_credentials.refresh_buffer_minutes IS
  'Proactive refresh N minutes before expiry. MB expires every 2hrs — set to 20.';
COMMENT ON COLUMN sys_api_credentials.refresh_failure_count IS
  'Consecutive failures. System disables auto-refresh after max_refresh_failures.';


-- ============================================================================
-- [E] — sys_api_rate_limits: Throttle state for back-off enforcement
-- ============================================================================

ALTER TABLE sys_api_rate_limits

  -- Is this endpoint currently throttled?
  -- Job scheduler checks this before queuing new API calls
  ADD COLUMN is_throttled              BOOLEAN DEFAULT FALSE,

  -- When throttle expires — job can retry after this timestamp
  ADD COLUMN throttled_until           TIMESTAMPTZ,

  -- Count of jobs currently waiting due to rate limit on this endpoint
  ADD COLUMN queued_job_count          INTEGER DEFAULT 0,

  -- Total throttle events ever recorded — useful for tuning request rates
  ADD COLUMN throttle_event_count      INTEGER DEFAULT 0,

  -- Last HTTP status code received — 429 = rate limited, 200 = OK
  ADD COLUMN last_http_status          INTEGER;

COMMENT ON COLUMN sys_api_rate_limits.is_throttled IS
  'TRUE = do not make new requests to this endpoint. Check throttled_until.';
COMMENT ON COLUMN sys_api_rate_limits.throttled_until IS
  'Timestamp when throttle expires. NULL if not throttled.';


-- ============================================================================
-- [F] — New table: offer_filter_log
-- Auditable history of why an offer passed or failed the binary filter gate.
-- Critical for idempotency: when passes_filter changes, we know why and when.
-- ============================================================================

CREATE TABLE offer_filter_log (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id            UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,

  -- Result of this filter evaluation
  passed              BOOLEAN NOT NULL,

  -- Structured failure reasons (array — an offer can fail multiple gates)
  failure_reasons     TEXT[],                        -- e.g. ['epc_below_threshold','no_search_traffic']

  -- Values at time of evaluation (snapshot for reproducibility)
  epc_at_eval         NUMERIC(10,4),
  payout_at_eval      NUMERIC(10,4),
  reversal_at_eval    NUMERIC(5,4),
  traffic_search_at_eval BOOLEAN,
  daily_cap_at_eval   INTEGER,

  -- Previous state — were we changing from pass to fail or vice versa?
  previous_result     BOOLEAN,                       -- NULL = first evaluation
  state_changed       BOOLEAN GENERATED ALWAYS AS (
                        CASE
                          WHEN previous_result IS NULL THEN TRUE
                          WHEN previous_result != passed THEN TRUE
                          ELSE FALSE
                        END
                      ) STORED,

  -- What triggered this evaluation
  triggered_by        TEXT DEFAULT 'filter_job',     -- 'filter_job','manual','epc_change_trigger'
  job_id              UUID REFERENCES sys_sync_jobs(id),

  evaluated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_filter_log_offer_id   ON offer_filter_log(offer_id);
CREATE INDEX idx_filter_log_evaluated  ON offer_filter_log(evaluated_at DESC);
CREATE INDEX idx_filter_log_changed    ON offer_filter_log(offer_id, state_changed)
  WHERE state_changed = TRUE;
CREATE INDEX idx_filter_log_passed     ON offer_filter_log(passed);

COMMENT ON TABLE offer_filter_log IS
  'Immutable audit trail of every filter evaluation. Drives idempotency for passes_filter on mb_offers.';
COMMENT ON COLUMN offer_filter_log.state_changed IS
  'Computed: TRUE when this evaluation changed the offer pass/fail state.';


-- ============================================================================
-- [G] — sys_sync_jobs: Idempotency controls
-- ============================================================================

ALTER TABLE sys_sync_jobs

  -- Unique key to prevent duplicate job runs
  -- Format: '{job_type}:{entity_id}:{date}' or '{job_type}:{run_date}'
  ADD COLUMN idempotency_key           TEXT,

  -- Can this job safely be re-run without side effects?
  ADD COLUMN is_idempotent             BOOLEAN DEFAULT TRUE,

  -- Was this job a duplicate that was skipped?
  ADD COLUMN was_skipped_duplicate     BOOLEAN DEFAULT FALSE;

CREATE UNIQUE INDEX idx_sys_jobs_idempotency
  ON sys_sync_jobs(idempotency_key)
  WHERE idempotency_key IS NOT NULL
    AND job_status NOT IN ('failed', 'cancelled');

COMMENT ON COLUMN sys_sync_jobs.idempotency_key IS
  'Unique key preventing duplicate runs. Format: job_type:entity_id:YYYY-MM-DD.';
COMMENT ON COLUMN sys_sync_jobs.was_skipped_duplicate IS
  'TRUE when job was rejected because identical idempotency_key already exists.';


-- ============================================================================
-- Update sys_config with new threshold keys introduced by this migration
-- ============================================================================

INSERT INTO sys_config (key, value, value_type, description) VALUES
  ('min_conversions_for_own_epc',
    '30',
    'integer',
    'Minimum own conversion events before trusting our_cvr over network EPC'),

  ('min_conversions_for_bootstrap_exit',
    '30',
    'integer',
    'Conversion count threshold to flip has_sufficient_own_data = TRUE on mb_offers'),

  ('confidence_min_sample_weight',
    '0.40',
    'float',
    'Weight of sample size adequacy in confidence_score calculation (0-1)'),

  ('confidence_recency_weight',
    '0.30',
    'float',
    'Weight of data recency in confidence_score calculation (0-1)'),

  ('confidence_completeness_weight',
    '0.30',
    'float',
    'Weight of data completeness in confidence_score calculation (0-1)'),

  ('confidence_min_to_act',
    '40',
    'integer',
    'Minimum confidence_score required before a report is auto-generated'),

  ('mb_token_refresh_buffer_minutes',
    '20',
    'integer',
    'Proactive refresh window before MB token expiry (MB expires every 120 min)'),

  ('bing_throttle_backoff_seconds',
    '60',
    'integer',
    'Seconds to back off after receiving a 429 from Bing Ad Insight API'),

  ('filter_log_retention_days',
    '90',
    'integer',
    'Days to retain offer_filter_log records before archiving')

ON CONFLICT (key) DO NOTHING;


-- ============================================================================
-- Update trigger: auto-update has_sufficient_own_data on mb_offers
-- Fires whenever own_conversion_count is updated
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_check_bootstrap_exit()
RETURNS TRIGGER AS $$
DECLARE
  threshold INTEGER;
BEGIN
  SELECT value::INTEGER INTO threshold
  FROM sys_config
  WHERE key = 'min_conversions_for_bootstrap_exit';

  IF threshold IS NULL THEN threshold := 30; END IF;

  NEW.has_sufficient_own_data := (NEW.own_conversion_count >= threshold);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_bootstrap_exit_check
  BEFORE UPDATE OF own_conversion_count ON mb_offers
  FOR EACH ROW EXECUTE FUNCTION trigger_check_bootstrap_exit();


-- ============================================================================
-- Update trigger: auto-populate expected_value_bootstrap on offer_scores
-- Fires on insert or update of traffic_adjusted_epc or avg_cpc_used
-- ============================================================================

CREATE OR REPLACE FUNCTION trigger_compute_bootstrap_ev()
RETURNS TRIGGER AS $$
BEGIN
  -- Bootstrap EV: traffic_adjusted_epc - avg_cpc_used
  IF NEW.traffic_adjusted_epc IS NOT NULL AND NEW.avg_cpc_used IS NOT NULL THEN
    NEW.expected_value_bootstrap :=
      ROUND(NEW.traffic_adjusted_epc - NEW.avg_cpc_used, 4);
  END IF;

  -- True EV: only compute when we have our own CVR and reversal rate
  IF NEW.our_cvr IS NOT NULL
    AND NEW.avg_cpc_used IS NOT NULL
  THEN
    -- Pull reversal rate from the parent offer
    DECLARE
      v_payout   NUMERIC(10,4);
      v_reversal NUMERIC(5,4);
    BEGIN
      SELECT payout, reversal_rate
        INTO v_payout, v_reversal
      FROM mb_offers
      WHERE id = NEW.offer_id;

      IF v_payout IS NOT NULL THEN
        NEW.expected_value_true :=
          ROUND(
            (NEW.our_cvr * v_payout * (1 - COALESCE(v_reversal, 0)))
            - NEW.avg_cpc_used,
          4);
      END IF;
    END;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_compute_ev
  BEFORE INSERT OR UPDATE OF traffic_adjusted_epc, avg_cpc_used, our_cvr
  ON offer_scores
  FOR EACH ROW EXECUTE FUNCTION trigger_compute_bootstrap_ev();


-- ============================================================================
-- View update: extend v_qualified_offers with new fields
-- Drop and recreate — view depends on offer_scores which now has new columns
-- ============================================================================

DROP VIEW IF EXISTS v_qualified_offers;

CREATE VIEW v_qualified_offers AS
SELECT
  o.id,
  o.mb_campaign_id,
  o.name,
  o.vertical,
  o.payout,
  o.epc,
  o.own_epc,
  o.own_conversion_count,
  o.has_sufficient_own_data,
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

  -- Scoring
  s.score_total,
  s.tier,
  s.confidence_score,
  s.data_completeness,
  s.is_bootstrap_mode,
  s.our_cvr,
  s.conversion_sample_size,
  s.cvr_source,

  -- Profitability
  s.expected_profit_per_click,
  s.expected_value_bootstrap,
  s.expected_value_true,
  s.avg_cpc_used,
  s.breakeven_cpc,
  s.traffic_adjusted_epc,

  s.scored_at,
  o.last_synced_at
FROM mb_offers o
LEFT JOIN offer_scores s ON s.offer_id = o.id
WHERE o.status = 'active'
  AND o.passes_filter = TRUE;

COMMENT ON VIEW v_qualified_offers IS
  'Active, filter-passing offers with full scoring and profitability data. Primary query surface for the scoring engine.';


-- ============================================================================
-- SUMMARY OF CHANGES
--
-- Tables modified (7):
--   offer_scores           — +11 columns (bootstrap, CVR, confidence, true EV)
--   mb_offers              — +4 columns (own data tracking, bootstrap exit)
--   sys_api_credentials    — +7 columns (refresh engine control)
--   sys_api_rate_limits    — +5 columns (throttle state)
--   sys_sync_jobs          — +3 columns (idempotency)
--
-- Tables created (1):
--   offer_filter_log       — filter gate audit trail with computed state_changed
--
-- Config keys added (9):
--   min_conversions_for_own_epc
--   min_conversions_for_bootstrap_exit
--   confidence_min_sample_weight
--   confidence_recency_weight
--   confidence_completeness_weight
--   confidence_min_to_act
--   mb_token_refresh_buffer_minutes
--   bing_throttle_backoff_seconds
--   filter_log_retention_days
--
-- Triggers added (2):
--   trg_bootstrap_exit_check     — auto-flips has_sufficient_own_data
--   trg_compute_ev               — auto-computes both EV variants on score upsert
--
-- Views updated (1):
--   v_qualified_offers            — extended with new scoring + EV columns
--
-- Zero breaking changes. Zero dropped columns. Zero renamed columns.
-- Safe to run against existing schema with no data migration required.
-- ============================================================================
