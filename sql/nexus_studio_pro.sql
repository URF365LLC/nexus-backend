-- ============================================================================
-- NEXUS CREATIVE STUDIO PRO — EXTENSION SCHEMA
-- This layer adds the Creative Studio, Simulation, and Operations features.
-- ============================================================================

-- ENUMS for Studio
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'studio_project_status') THEN
    CREATE TYPE studio_project_status AS ENUM (
      'draft', 'simulating', 'review_pending', 'approved', 'deployed', 'archived'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'blueprint_persona') THEN
    CREATE TYPE blueprint_persona AS ENUM (
      'ogilvy', 'halbert', 'schwartz', 'hopkins', 'custom'
    );
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'asset_type') THEN
    CREATE TYPE asset_type AS ENUM (
      'image_realistic', 'headline', 'subheadline', 'cta_button', 'video_motion', 'body_copy'
    );
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- studio_projects — The parent entity for a creative production lifecycle
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS studio_projects (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  offer_id        UUID NOT NULL REFERENCES mb_offers(id) ON DELETE CASCADE,
  name            TEXT NOT NULL,
  status          studio_project_status DEFAULT 'draft',
  
  -- Settings
  target_persona  blueprint_persona DEFAULT 'ogilvy',
  target_vibe     TEXT,                          -- e.g., "Premium OLED", "Aggressive Tabloid"
  alpha_keywords  TEXT[],                        -- Selected keywords from kw_keywords
  
  -- Metrics (Snapshotted from FunnelAI)
  predicted_ctr   NUMERIC(5,4),
  actual_ctr      NUMERIC(5,4),
  total_leads     INTEGER DEFAULT 0,
  
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_studio_projects_offer ON studio_projects(offer_id);
CREATE INDEX idx_studio_projects_status ON studio_projects(status);

-- ----------------------------------------------------------------------------
-- studio_blueprints — AI-generated strategic configuration
-- ----------------------------------------------------------------------------
CREATE TABLE studio_blueprints (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  
  -- Core Strategy (Synthesized from @copywriting and @marketing-psychology)
  angle           TEXT,
  primary_hook    TEXT,
  objections      TEXT[],
  psych_triggers  JSONB,                         -- e.g., {"urgency": 0.8, "authority": 0.9}
  
  -- Design Token (Synthesized from UI/UX Pro Max)
  design_system   JSONB,                         -- colors, fonts, spacing, effects
  
  generated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- studio_funnels — The visual layout state (OpenFunnels compatible)
-- ----------------------------------------------------------------------------
CREATE TABLE studio_funnels (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  
  -- The Editor's JSON state
  layout_data     JSONB NOT NULL,                -- The nested container/block structure
  
  -- Metadata for export
  meta_title      TEXT,
  meta_description TEXT,
  
  is_published    BOOLEAN DEFAULT FALSE,
  published_url   TEXT,
  
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- studio_assets — Generated images and copy variants
-- ----------------------------------------------------------------------------
CREATE TABLE studio_assets (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  
  asset_type      asset_type NOT NULL,
  content_url     TEXT,                          -- URL for images/videos
  content_text    TEXT,                          -- Text for headlines/copy
  
  -- Quality Score (based on @marketing-psychology)
  kpi_score       NUMERIC(3,2),                  -- 0.0 to 1.0
  kpi_breakdown   JSONB,                         -- {urgency: 0.9, clarity: 0.8}
  
  is_approved     BOOLEAN DEFAULT FALSE,
  is_selected     BOOLEAN DEFAULT FALSE,         -- Currently used in layout
  
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_studio_assets_project ON studio_assets(project_id);

-- ----------------------------------------------------------------------------
-- studio_simulations — MiroFish results
-- ----------------------------------------------------------------------------
CREATE TABLE studio_simulations (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID NOT NULL REFERENCES studio_projects(id) ON DELETE CASCADE,
  
  -- Simulation Metadata
  agent_count     INTEGER DEFAULT 1000,
  persona_config  JSONB,                         -- The config used for MiroFish agents
  
  -- Results
  prediction_report TEXT,                        -- Summary of behavior
  heat_map_data   JSONB,                         -- Interaction patterns
  objections_found TEXT[],
  
  simulated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ----------------------------------------------------------------------------
-- studio_lead_pipeline & studio_leads (CRMNow Integration)
-- ----------------------------------------------------------------------------
CREATE TABLE studio_lead_pipeline (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            TEXT NOT NULL,
  sort_order      INTEGER DEFAULT 0,
  is_active       BOOLEAN DEFAULT TRUE
);

INSERT INTO studio_lead_pipeline (name, sort_order) VALUES
  ('New Lead', 10),
  ('On Page', 20),
  ('Form Start', 30),
  ('Qualified', 40),
  ('Converted', 50),
  ('High Value', 60);

CREATE TABLE studio_leads (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id      UUID REFERENCES studio_projects(id) ON DELETE SET NULL,
  pipeline_id     UUID REFERENCES studio_lead_pipeline(id),
  
  -- Lead Info
  ip_address      INET,
  geo_context     JSONB,
  browser_context JSONB,
  
  -- Identification
  email           TEXT,
  phone           TEXT,
  custom_fields   JSONB,
  
  -- Score (CRMNow logic)
  lead_score      INTEGER DEFAULT 0,
  
  -- Attribution (CPA Lead Automation logic)
  keyword_id      UUID REFERENCES kw_keywords(id),
  ad_id           UUID,                          -- External ad ID if known
  utm_source      TEXT,
  utm_medium      TEXT,
  utm_campaign    TEXT,
  
  captured_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_studio_leads_project ON studio_leads(project_id);
CREATE INDEX idx_studio_leads_pipeline ON studio_leads(pipeline_id);

-- Enable RLS
ALTER TABLE studio_projects         ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_blueprints       ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_funnels          ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_assets           ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_simulations      ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_lead_pipeline   ENABLE ROW LEVEL SECURITY;
ALTER TABLE studio_leads            ENABLE ROW LEVEL SECURITY;
