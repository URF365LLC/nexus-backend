import { type Page } from '@playwright/test';
import {
  mockDashboardData,
  mockOffers,
  mockScores,
  mockReport,
  mockJobs,
  mockKeywords,
} from '../fixtures/mockData';

/**
 * Register all API proxy mocks so tests run without the Railway backend.
 * Call this before page.goto() in each test that needs mocked API data.
 */
export async function registerApiMocks(page: Page): Promise<void> {
  // Dashboard endpoint
  await page.route('**/api/nexus/dashboard', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: mockDashboardData }),
    });
  });

  // Offers endpoint (handles query params like ?limit=157)
  await page.route('**/api/nexus/offers**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: mockOffers }),
    });
  });

  // Scores endpoint
  await page.route('**/api/nexus/scores**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: mockScores }),
    });
  });

  // Reports endpoint — /api/nexus/reports/:offerId
  await page.route('**/api/nexus/reports/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: mockReport }),
    });
  });

  // Jobs endpoint
  await page.route('**/api/nexus/jobs**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: mockJobs }),
    });
  });

  // Keywords endpoint — /api/nexus/keywords/:offerId
  await page.route('**/api/nexus/keywords/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: mockKeywords }),
    });
  });

  // Sync endpoints — just acknowledge them so buttons don't cause errors
  await page.route('**/api/nexus/sync/**', (route) => {
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ success: true, data: { queued: true } }),
    });
  });
}
