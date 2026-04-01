import { test, expect } from '@playwright/test';
import { KeywordsPage } from './pages/KeywordsPage';
import { registerApiMocks } from './helpers/mockRoutes';
import { mockOffers, mockKeywords } from './fixtures/mockData';

test.describe('Keyword Alpha', () => {
  test.beforeEach(async ({ page }) => {
    await registerApiMocks(page);
  });

  test('page loads with Keyword Alpha heading', async ({ page }) => {
    const keywords = new KeywordsPage(page);
    await keywords.goto();
    await keywords.waitForLoad();

    await expect(keywords.pageHeading).toBeVisible();
  });

  test('offer list renders all mock offers', async ({ page }) => {
    const keywords = new KeywordsPage(page);
    await keywords.goto();
    await keywords.waitForLoad();

    // The offer count label should reflect mock data
    await expect(page.locator(`text=Offers (${mockOffers.length})`)).toBeVisible();
  });

  test('offer names appear in the left panel', async ({ page }) => {
    const keywords = new KeywordsPage(page);
    await keywords.goto();
    await keywords.waitForLoad();

    await expect(page.locator('button', { hasText: 'Alpha Finance Pro' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Beta Health Shield' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Gamma Insurance Direct' })).toBeVisible();
  });

  test('empty state is shown before selecting an offer', async ({ page }) => {
    const keywords = new KeywordsPage(page);
    await keywords.goto();
    await keywords.waitForLoad();

    await expect(keywords.emptyState).toBeVisible();
  });

  test('clicking an offer loads keywords in the right panel', async ({ page }) => {
    const keywords = new KeywordsPage(page);
    await keywords.goto();
    await keywords.waitForLoad();

    await keywords.selectFirstOffer();
    await keywords.waitForKeywordsLoaded();

    await expect(keywords.keywordTable).toBeVisible();
  });

  test('keyword table has correct column headers', async ({ page }) => {
    const keywords = new KeywordsPage(page);
    await keywords.goto();
    await keywords.waitForLoad();

    await keywords.selectFirstOffer();
    await keywords.waitForKeywordsLoaded();

    await expect(page.locator('th', { hasText: 'Keyword' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Intent' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Monthly Searches' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Competition' })).toBeVisible();
    await expect(page.locator('th', { hasText: 'Avg CPC' })).toBeVisible();
  });

  test('keyword rows render mock keyword data', async ({ page }) => {
    const keywords = new KeywordsPage(page);
    await keywords.goto();
    await keywords.waitForLoad();

    await keywords.selectFirstOffer();
    await keywords.waitForKeywordsLoaded();

    // All 5 mock keywords should be visible in the table
    for (const kw of mockKeywords) {
      await expect(page.locator(`td:has-text("${kw.keyword}")`)).toBeVisible();
    }
  });

  test('keyword count in right panel header reflects loaded keywords', async ({ page }) => {
    const keywords = new KeywordsPage(page);
    await keywords.goto();
    await keywords.waitForLoad();

    await keywords.selectFirstOffer();
    await keywords.waitForKeywordsLoaded();

    // Right panel shows keyword count
    const countLocator = page.locator('text=Keywords').locator('..').locator('.text-xl, .tabular-nums').first();
    await expect(countLocator).toBeVisible();
    await expect(countLocator).toHaveText(String(mockKeywords.length));
  });

  test('selecting a different offer loads new keywords', async ({ page }) => {
    const keywords = new KeywordsPage(page);
    await keywords.goto();
    await keywords.waitForLoad();

    // Select first offer
    await keywords.offerButtons.first().click();
    await keywords.waitForKeywordsLoaded();

    // Select second offer
    await keywords.offerButtons.nth(1).click();
    await keywords.waitForKeywordsLoaded();

    // Table should still be visible with data
    await expect(keywords.keywordTable).toBeVisible();
  });

  test('intent badges are visible in the keyword table', async ({ page }) => {
    const keywords = new KeywordsPage(page);
    await keywords.goto();
    await keywords.waitForLoad();

    await keywords.selectFirstOffer();
    await keywords.waitForKeywordsLoaded();

    // We have transactional, commercial, informational intents in mock data
    await expect(page.locator('text=transactional').first()).toBeVisible();
    await expect(page.locator('text=commercial').first()).toBeVisible();
    await expect(page.locator('text=informational').first()).toBeVisible();
  });

  test('CPC values are formatted with dollar sign', async ({ page }) => {
    const keywords = new KeywordsPage(page);
    await keywords.goto();
    await keywords.waitForLoad();

    await keywords.selectFirstOffer();
    await keywords.waitForKeywordsLoaded();

    // First mock keyword has avg_cpc 4.50 → displayed as $4.50
    await expect(page.locator('td:has-text("$4.50")')).toBeVisible();
  });

  test('back link returns to dashboard', async ({ page }) => {
    const keywords = new KeywordsPage(page);
    await keywords.goto();
    await keywords.waitForLoad();

    // The page header has a back link; the sidebar also has one — use first()
    const backLink = page.locator('a', { hasText: 'Operator HUD' }).first();
    await expect(backLink).toBeVisible();
    await expect(backLink).toHaveAttribute('href', '/');
  });
});
