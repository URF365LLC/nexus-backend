import { type Page, type Locator } from '@playwright/test';

export class CampaignsPage {
  readonly page: Page;
  readonly pageHeading: Locator;
  readonly offerCards: Locator;
  readonly tierFilterAll: Locator;
  readonly tierFilterA: Locator;
  readonly tierFilterB: Locator;
  readonly tierFilterC: Locator;
  readonly offerCount: Locator;
  readonly briefDrawer: Locator;
  readonly briefDrawerCloseButton: Locator;
  readonly deployModal: Locator;
  readonly deployModalCloseButton: Locator;
  readonly deployModalCancelButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageHeading = page.locator('h1', { hasText: 'Campaign Matrix' });
    // Each offer card is a motion div wrapping a GlassCard
    this.offerCards = page.locator('.grid > div[class*="motion"], .grid > div').filter({ has: page.locator('button', { hasText: 'View Brief' }) });
    this.tierFilterAll = page.locator('button', { hasText: 'All Tiers' });
    this.tierFilterA = page.locator('button', { hasText: 'Tier A' });
    this.tierFilterB = page.locator('button', { hasText: 'Tier B' });
    this.tierFilterC = page.locator('button', { hasText: 'Tier C' });
    this.offerCount = page.locator('text=/\\d+ offers/');
    // Drawer has fixed position, slides in from right
    this.briefDrawer = page.locator('[class*="fixed right-0"]');
    this.briefDrawerCloseButton = page.locator('[aria-label="Close drawer"]');
    // Modal backdrop
    this.deployModal = page.locator('[class*="max-w-md"]');
    this.deployModalCloseButton = page.locator('[aria-label="Close modal"]');
    this.deployModalCancelButton = page.locator('button', { hasText: 'Cancel' });
  }

  async goto() {
    await this.page.goto('/campaigns');
  }

  async waitForLoad() {
    await this.pageHeading.waitFor({ state: 'visible' });
    // Wait for at least one offer card to appear (offers load async)
    await this.page.waitForSelector('button:has-text("View Brief")', { state: 'visible', timeout: 10000 });
  }

  async clickViewBriefOnFirstCard() {
    const firstViewBrief = this.page.locator('button', { hasText: 'View Brief' }).first();
    await firstViewBrief.click();
  }

  async clickDeployOnFirstCard() {
    const firstDeploy = this.page.locator('button', { hasText: 'Deploy' }).first();
    await firstDeploy.click();
  }

  async getVisibleOfferCount(): Promise<number> {
    const text = await this.offerCount.textContent();
    const match = text?.match(/(\d+)\s+offers/);
    return match ? parseInt(match[1], 10) : 0;
  }
}
