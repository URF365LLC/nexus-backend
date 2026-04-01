import { test, expect } from '@playwright/test';
import { CampaignsPage } from './pages/CampaignsPage';
import { registerApiMocks } from './helpers/mockRoutes';
import { mockOffers } from './fixtures/mockData';

test.describe('Campaign Matrix', () => {
  test.beforeEach(async ({ page }) => {
    await registerApiMocks(page);
  });

  test('page loads with Campaign Matrix heading', async ({ page }) => {
    const campaigns = new CampaignsPage(page);
    await campaigns.goto();
    await campaigns.waitForLoad();

    await expect(campaigns.pageHeading).toBeVisible();
  });

  test('offer cards render from mock data', async ({ page }) => {
    const campaigns = new CampaignsPage(page);
    await campaigns.goto();
    await campaigns.waitForLoad();

    // All three mock offer names should be visible in the grid
    await expect(page.locator('text=Alpha Finance Pro').first()).toBeVisible();
    await expect(page.locator('text=Beta Health Shield').first()).toBeVisible();
    await expect(page.locator('text=Gamma Insurance Direct').first()).toBeVisible();
  });

  test('offer count badge shows correct total', async ({ page }) => {
    const campaigns = new CampaignsPage(page);
    await campaigns.goto();
    await campaigns.waitForLoad();

    const count = await campaigns.getVisibleOfferCount();
    expect(count).toBe(mockOffers.length);
  });

  test('tier filters are visible', async ({ page }) => {
    const campaigns = new CampaignsPage(page);
    await campaigns.goto();
    await campaigns.waitForLoad();

    await expect(campaigns.tierFilterAll).toBeVisible();
    await expect(campaigns.tierFilterA).toBeVisible();
    await expect(campaigns.tierFilterB).toBeVisible();
    await expect(campaigns.tierFilterC).toBeVisible();
  });

  test('Tier A filter shows only tier A offers', async ({ page }) => {
    const campaigns = new CampaignsPage(page);
    await campaigns.goto();
    await campaigns.waitForLoad();

    await campaigns.tierFilterA.click();

    // After filtering to Tier A, only offer-001 (Alpha Finance Pro, tier A) should be visible
    await expect(page.locator('text=Alpha Finance Pro').first()).toBeVisible();

    // Tier B and C offers should not appear in the grid cards
    // (They may appear in other parts, so check the count label)
    const count = await campaigns.getVisibleOfferCount();
    const tierACount = mockOffers.filter(o => o.tier === 'A').length;
    expect(count).toBe(tierACount);
  });

  test('Tier B filter shows only tier B offers', async ({ page }) => {
    const campaigns = new CampaignsPage(page);
    await campaigns.goto();
    await campaigns.waitForLoad();

    await campaigns.tierFilterB.click();

    const count = await campaigns.getVisibleOfferCount();
    const tierBCount = mockOffers.filter(o => o.tier === 'B').length;
    expect(count).toBe(tierBCount);
  });

  test('Tier C filter shows only tier C offers', async ({ page }) => {
    const campaigns = new CampaignsPage(page);
    await campaigns.goto();
    await campaigns.waitForLoad();

    await campaigns.tierFilterC.click();

    const count = await campaigns.getVisibleOfferCount();
    const tierCCount = mockOffers.filter(o => o.tier === 'C').length;
    expect(count).toBe(tierCCount);
  });

  test('All Tiers filter restores full list', async ({ page }) => {
    const campaigns = new CampaignsPage(page);
    await campaigns.goto();
    await campaigns.waitForLoad();

    // First filter to A, then back to All
    await campaigns.tierFilterA.click();
    await campaigns.tierFilterAll.click();

    const count = await campaigns.getVisibleOfferCount();
    expect(count).toBe(mockOffers.length);
  });

  test('clicking View Brief opens the drawer', async ({ page }) => {
    const campaigns = new CampaignsPage(page);
    await campaigns.goto();
    await campaigns.waitForLoad();

    await campaigns.clickViewBriefOnFirstCard();

    // Drawer slides in from right — check it becomes visible
    await campaigns.briefDrawer.waitFor({ state: 'visible' });
    await expect(campaigns.briefDrawer).toBeVisible();
  });

  test('drawer shows offer name and tabs after View Brief click', async ({ page }) => {
    const campaigns = new CampaignsPage(page);
    await campaigns.goto();
    await campaigns.waitForLoad();

    await campaigns.clickViewBriefOnFirstCard();
    await campaigns.briefDrawer.waitFor({ state: 'visible' });

    // The first offer is Alpha Finance Pro
    await expect(page.locator('[class*="fixed right-0"] h2')).toHaveText('Alpha Finance Pro');

    // Tabs should be present
    await expect(page.locator('button', { hasText: 'Claude Synthesis' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Market Research' })).toBeVisible();
    await expect(page.locator('button', { hasText: 'Metadata' })).toBeVisible();
  });

  test('drawer close button dismisses the drawer', async ({ page }) => {
    const campaigns = new CampaignsPage(page);
    await campaigns.goto();
    await campaigns.waitForLoad();

    await campaigns.clickViewBriefOnFirstCard();
    await campaigns.briefDrawer.waitFor({ state: 'visible' });

    await campaigns.briefDrawerCloseButton.click();

    await campaigns.briefDrawer.waitFor({ state: 'hidden' });
    await expect(campaigns.briefDrawer).not.toBeVisible();
  });

  test('clicking Deploy opens the modal', async ({ page }) => {
    const campaigns = new CampaignsPage(page);
    await campaigns.goto();
    await campaigns.waitForLoad();

    await campaigns.clickDeployOnFirstCard();

    await campaigns.deployModal.waitFor({ state: 'visible' });
    await expect(campaigns.deployModal).toBeVisible();
  });

  test('deploy modal shows offer details and warning', async ({ page }) => {
    const campaigns = new CampaignsPage(page);
    await campaigns.goto();
    await campaigns.waitForLoad();

    await campaigns.clickDeployOnFirstCard();
    await campaigns.deployModal.waitFor({ state: 'visible' });

    // Heading inside modal
    await expect(page.locator('text=Deploy to Bing Ads')).toBeVisible();

    // Warning text
    await expect(page.locator('text=Microsoft Advertising')).toBeVisible();

    // Confirm Deploy button
    await expect(page.locator('button', { hasText: 'Confirm Deploy' })).toBeVisible();
  });

  test('deploy modal Cancel button dismisses the modal', async ({ page }) => {
    const campaigns = new CampaignsPage(page);
    await campaigns.goto();
    await campaigns.waitForLoad();

    await campaigns.clickDeployOnFirstCard();
    await campaigns.deployModal.waitFor({ state: 'visible' });

    await campaigns.deployModalCancelButton.click();

    await campaigns.deployModal.waitFor({ state: 'hidden' });
    await expect(campaigns.deployModal).not.toBeVisible();
  });

  test('deploy modal close button (X) dismisses the modal', async ({ page }) => {
    const campaigns = new CampaignsPage(page);
    await campaigns.goto();
    await campaigns.waitForLoad();

    await campaigns.clickDeployOnFirstCard();
    await campaigns.deployModal.waitFor({ state: 'visible' });

    await campaigns.deployModalCloseButton.click();

    await campaigns.deployModal.waitFor({ state: 'hidden' });
    await expect(campaigns.deployModal).not.toBeVisible();
  });

  test('each offer card has View Brief and Deploy buttons', async ({ page }) => {
    const campaigns = new CampaignsPage(page);
    await campaigns.goto();
    await campaigns.waitForLoad();

    const viewBriefButtons = page.locator('button', { hasText: 'View Brief' });
    const deployButtons = page.locator('button', { hasText: 'Deploy' });

    await expect(viewBriefButtons).toHaveCount(mockOffers.length);
    // Deploy count: each card has Deploy, plus the modal has "Confirm Deploy" — so filter precisely
    // The grid cards have text exactly "Deploy" (not "Confirm Deploy")
    const gridDeployButtons = page.locator('.grid button', { hasText: /^Deploy$/ });
    await expect(gridDeployButtons).toHaveCount(mockOffers.length);
  });
});
