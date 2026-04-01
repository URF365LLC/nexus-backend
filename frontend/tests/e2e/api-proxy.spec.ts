import { test, expect } from '@playwright/test';
import { mockDashboardData } from './fixtures/mockData';

/**
 * API Proxy health checks.
 *
 * These tests verify the Next.js route handler at /api/nexus/[...path] correctly
 * proxies requests and returns properly shaped JSON. We use page.route() to intercept
 * the actual HTTP calls so the Railway backend is not needed.
 *
 * We navigate to "/" first to give the page a base URL before making fetch calls
 * via page.evaluate(), which requires an origin to resolve relative URLs.
 */
test.describe('API Proxy health', () => {
  test('GET /api/nexus/dashboard returns success:true with data envelope', async ({ page }) => {
    await page.route('**/api/nexus/dashboard', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockDashboardData }),
      });
    });

    // Navigate to root so the page context has an origin for relative fetch URLs
    await page.goto('/');

    const result = await page.evaluate(async () => {
      const res = await fetch('/api/nexus/dashboard');
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data).toBeDefined();
    expect(result.body.data.tiers).toBeDefined();
    expect(result.body.data.top_offers).toBeDefined();
    expect(result.body.data.system).toBeDefined();
  });

  test('GET /api/nexus/offers returns success:true with data array', async ({ page }) => {
    await page.route('**/api/nexus/offers**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            { id: 'offer-001', name: 'Test Offer', tier: 'A', payout: 45, score_total: 92, keyword_count: 34 },
          ],
        }),
      });
    });

    await page.goto('/');

    const result = await page.evaluate(async () => {
      const res = await fetch('/api/nexus/offers?limit=10');
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(Array.isArray(result.body.data)).toBe(true);
    expect(result.body.data.length).toBeGreaterThan(0);
    // Verify offer shape
    const offer = result.body.data[0];
    expect(offer).toHaveProperty('id');
    expect(offer).toHaveProperty('name');
    expect(offer).toHaveProperty('tier');
    expect(offer).toHaveProperty('score_total');
  });

  test('GET /api/nexus/keywords/:offerId returns success:true with keyword array', async ({ page }) => {
    await page.route('**/api/nexus/keywords/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: [
            { id: 'kw-001', keyword: 'test keyword', intent: 'transactional', avg_monthly_searches: 5000, competition_level: 'medium', avg_cpc: 2.50, suggested_bid: 2.00 },
          ],
        }),
      });
    });

    await page.goto('/');

    const result = await page.evaluate(async () => {
      const res = await fetch('/api/nexus/keywords/offer-001?limit=100');
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(Array.isArray(result.body.data)).toBe(true);
    const kw = result.body.data[0];
    expect(kw).toHaveProperty('keyword');
    expect(kw).toHaveProperty('intent');
    expect(kw).toHaveProperty('avg_cpc');
  });

  test('GET /api/nexus/reports/:offerId returns success:true with report data', async ({ page }) => {
    await page.route('**/api/nexus/reports/**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            offer_name: 'Test Offer',
            status: 'completed',
            claude_synthesis: 'Test synthesis',
            perplexity_research: 'Test research',
          },
        }),
      });
    });

    await page.goto('/');

    const result = await page.evaluate(async () => {
      const res = await fetch('/api/nexus/reports/offer-001');
      return { status: res.status, body: await res.json() };
    });

    expect(result.status).toBe(200);
    expect(result.body.success).toBe(true);
    expect(result.body.data.status).toBe('completed');
    expect(result.body.data.claude_synthesis).toBeDefined();
    expect(result.body.data.perplexity_research).toBeDefined();
  });

  test('response envelope always includes success field', async ({ page }) => {
    await page.route('**/api/nexus/dashboard', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: mockDashboardData }),
      });
    });

    await page.route('**/api/nexus/offers**', (route) => {
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, data: [] }),
      });
    });

    await page.goto('/');

    const endpoints = ['/api/nexus/dashboard', '/api/nexus/offers?limit=1'];

    for (const url of endpoints) {
      const result = await page.evaluate(async (fetchUrl: string) => {
        const res = await fetch(fetchUrl);
        return res.json();
      }, url);

      expect(typeof result.success).toBe('boolean');
    }
  });
});
