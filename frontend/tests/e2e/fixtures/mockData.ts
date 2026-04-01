export const mockOffers = [
  {
    id: 'offer-001',
    name: 'Alpha Finance Pro',
    vertical: 'Finance',
    tier: 'A',
    payout: 45.00,
    score_total: 92,
    keyword_count: 34,
    confidence_score: 0.88,
    epc: 1.24,
    breakeven_cpc: 0.98,
  },
  {
    id: 'offer-002',
    name: 'Beta Health Shield',
    vertical: 'Health',
    tier: 'B',
    payout: 28.50,
    score_total: 74,
    keyword_count: 21,
    confidence_score: 0.71,
    epc: 0.87,
    breakeven_cpc: 0.62,
  },
  {
    id: 'offer-003',
    name: 'Gamma Insurance Direct',
    vertical: 'Insurance',
    tier: 'C',
    payout: 15.00,
    score_total: 55,
    keyword_count: 12,
    confidence_score: 0.45,
    epc: 0.51,
    breakeven_cpc: 0.38,
  },
];

export const mockDashboardData = {
  tiers: {
    A: { count: 48 },
    B: { count: 67 },
    C: { count: 42 },
  },
  top_offers: mockOffers.map(o => ({
    id: o.id,
    name: o.name,
    vertical: o.vertical,
    tier: o.tier,
    score_total: o.score_total,
    keyword_count: o.keyword_count,
  })),
  keyword_coverage: {
    total_keywords: 5200,
    validated_keywords: 4420,
  },
  reports: {
    ready: 12,
    processing: 2,
  },
  system: {
    active_offers: 157,
    last_sync: new Date().toISOString(),
  },
};

export const mockReport = {
  offer_id: 'offer-001',
  offer_name: 'Alpha Finance Pro',
  vertical: 'Finance',
  payout: '45.00',
  tier: 'A',
  score_total: '92',
  confidence_score: '0.88',
  status: 'completed',
  generated_at: new Date().toISOString(),
  perplexity_research: 'Market research indicates strong demand in the financial sector with high search volume for personal loan products. Competition remains moderate with significant headroom for well-targeted campaigns.',
  claude_synthesis: 'Analysis of Alpha Finance Pro reveals a high-value opportunity with above-average EPC metrics. The keyword cluster shows strong transactional intent distribution (68% transactional, 22% commercial). Recommended bid range: $0.85 - $1.10 CPC for top performers.',
  keywords_used: [],
};

export const mockScores = [
  { id: 'score-001', offer_id: 'offer-001', score_total: 92, computed_at: new Date().toISOString() },
  { id: 'score-002', offer_id: 'offer-002', score_total: 74, computed_at: new Date().toISOString() },
  { id: 'score-003', offer_id: 'offer-003', score_total: 55, computed_at: new Date().toISOString() },
];

export const mockJobs = [
  { id: 'job-001', type: 'sync_offers', status: 'completed', started_at: new Date().toISOString(), finished_at: new Date().toISOString() },
  { id: 'job-002', type: 'score_compute', status: 'running', started_at: new Date().toISOString(), finished_at: null },
];

export const mockKeywords = [
  { id: 'kw-001', offer_id: 'offer-001', keyword: 'best personal loans 2025', intent: 'transactional', avg_monthly_searches: 22000, competition_level: 'high', avg_cpc: 4.50, suggested_bid: 3.80 },
  { id: 'kw-002', offer_id: 'offer-001', keyword: 'low interest rate loans', intent: 'commercial', avg_monthly_searches: 14500, competition_level: 'medium', avg_cpc: 3.20, suggested_bid: 2.70 },
  { id: 'kw-003', offer_id: 'offer-001', keyword: 'quick loan approval online', intent: 'transactional', avg_monthly_searches: 9800, competition_level: 'medium', avg_cpc: 3.85, suggested_bid: 3.20 },
  { id: 'kw-004', offer_id: 'offer-001', keyword: 'how to get a personal loan', intent: 'informational', avg_monthly_searches: 33000, competition_level: 'low', avg_cpc: 1.20, suggested_bid: 0.95 },
  { id: 'kw-005', offer_id: 'offer-001', keyword: 'compare personal loan rates', intent: 'commercial', avg_monthly_searches: 8200, competition_level: 'high', avg_cpc: 5.10, suggested_bid: 4.30 },
];
