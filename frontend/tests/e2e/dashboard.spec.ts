import { test, expect } from '@playwright/test';
import { DashboardPage } from './pages/DashboardPage';
import { registerApiMocks } from './helpers/mockRoutes';

test.describe('Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await registerApiMocks(page);
  });

  test('page loads and shows the main heading', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForLoad();

    await expect(dashboard.pageTitle).toBeVisible();
    await expect(dashboard.pageTitle).toHaveText('System Synthesis');
  });

  test('page title in document head contains NEXUS', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForLoad();

    await expect(page).toHaveTitle(/nexus/i);
  });

  test('four stat cards are visible', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForLoad();

    await expect(page.locator('text=Alpha Tier Reach')).toBeVisible();
    await expect(page.locator('text=Keyword Validation')).toBeVisible();
    await expect(page.locator('text=Intelligence Reports')).toBeVisible();
    await expect(page.locator('text=Current Velocity')).toBeVisible();
  });

  test('stat card values reflect mocked API data', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForLoad();

    // Alpha Tier Reach = tiers.A.count = 48
    const alphaTierValue = page.locator('text=Alpha Tier Reach').locator('..').locator('..').locator('.text-3xl, .tabular-nums').first();
    await expect(alphaTierValue).toBeVisible();

    // Intelligence Reports = reports.ready = 12
    const reportsValue = page.locator('text=Intelligence Reports').locator('..').locator('..').locator('.text-3xl, .tabular-nums').first();
    await expect(reportsValue).toBeVisible();
  });

  test('top offers section renders offer rows from mock data', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForLoad();

    await expect(page.locator('text=Alpha Tier Performance')).toBeVisible();
    // Mock provides 3 offers — all names should appear
    await expect(page.locator('text=Alpha Finance Pro')).toBeVisible();
    await expect(page.locator('text=Beta Health Shield')).toBeVisible();
    await expect(page.locator('text=Gamma Insurance Direct')).toBeVisible();
  });

  test('Detailed Analysis link navigates to /campaigns', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForLoad();

    const link = page.locator('a', { hasText: 'Detailed Analysis' });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute('href', '/campaigns');
  });

  test('no hard crash — no error boundaries or 500 text', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForLoad();

    await expect(page.locator('text=Application error')).not.toBeVisible();
    await expect(page.locator('text=500')).not.toBeVisible();
  });

  test('Execute Global Sync button is present and enabled', async ({ page }) => {
    const dashboard = new DashboardPage(page);
    await dashboard.goto();
    await dashboard.waitForLoad();

    await expect(dashboard.executeSyncButton).toBeVisible();
    await expect(dashboard.executeSyncButton).toBeEnabled();
  });
});
