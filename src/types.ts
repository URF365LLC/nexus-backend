export interface Offer {
  id: string
  mb_campaign_id: number
  name: string
  vertical: string
  payout: number | null
  epc: number | null
  conversion_type: string | null
  traffic_search: boolean
  traffic_native: boolean
  traffic_social: boolean
  score_total: number
  tier: string
  confidence_score: number | null
  is_bootstrap_mode: boolean | null
  expected_profit_per_click: number | null
  breakeven_cpc: number | null
  avg_cpc_used: number | null
  keyword_count: number
}

export interface TierStats {
  count: number
  avg_score: number
  avg_confidence: number
  avg_eppc: number
}

export interface DashboardData {
  tiers: Record<string, TierStats>
  top_offers: Offer[]
  keyword_coverage: {
    total_offers: number
    offers_with_keywords: number
    total_keywords: number
    validated_keywords: number
    avg_keywords_per_offer: number | string
  }
  reports: {
    total: number
    ready: number
    generating: number
    failed: number
    pending: number
  }
  jobs: Record<string, { last_success: string | null; last_attempt: string | null }>
  system: {
    active_offers: number
    bootstrap_offers: number
    data_complete_offers: number
    tier_a: number
    tier_b: number
    tier_c: number
  }
}
