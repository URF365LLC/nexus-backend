export interface Offer {
  id: string | number;
  mb_offer_id?: number | string;
  name: string;
  vertical?: string;
  tier?: string;
  score_total?: number;
  keyword_count?: number;
  confidence_score?: number | null;
  payout?: number | string | null;
  epc?: number | string | null;
  [key: string]: unknown;
}

export interface DashboardData {
  system: {
    active_offers: number;
    tier_a?: number;
    tier_b?: number;
    tier_c?: number;
  };
  tiers: {
    [key: string]: { count: number; avg_score: number };
  };
  keyword_coverage: {
    validated_keywords: number;
    total_keywords: number;
    avg_keywords_per_offer: number | string;
  };
  reports: {
    ready: number;
    generating: number;
  };
  top_offers: Offer[];
}
