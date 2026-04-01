import { type Page, type Locator, expect } from '@playwright/test';

export class DashboardPage {
  readonly page: Page;
  readonly pageTitle: Locator;
  readonly statCards: Locator;
  readonly alphaTierCard: Locator;
  readonly keywordValidationCard: Locator;
  readonly intelligenceReportsCard: Locator;
  readonly currentVelocityCard: Locator;
  readonly topOffersSection: Locator;
  readonly offerRows: Locator;
  readonly executeSyncButton: Locator;
  readonly campaignMatrixLink: Locator;

  constructor(page: Page) {
    this.page = page;
    // The page title is "Nexus Dashboard" in metadata; the visible heading is "System Synthesis"
    this.pageTitle = page.locator('h1');
    this.statCards = page.locator('[class*="GlassCard"], .hover\\:border-white\\/10');
    this.alphaTierCard = page.locator('text=Alpha Tier Reach').locator('..');
    this.keywordValidationCard = page.locator('text=Keyword Validation').locator('..');
    this.intelligenceReportsCard = page.locator('text=Intelligence Reports').locator('..');
    this.currentVelocityCard = page.locator('text=Current Velocity').locator('..');
    this.topOffersSection = page.locator('text=Alpha Tier Performance');
    this.offerRows = page.locator('text=Alpha Tier Performance').locator('..').locator('..').locator('[class*="motion"]');
    this.executeSyncButton = page.locator('button', { hasText: 'Execute Global Sync' });
    this.campaignMatrixLink = page.locator('a', { hasText: 'Detailed Analysis' });
  }

  async goto() {
    await this.page.goto('/');
  }

  async waitForLoad() {
    // Wait until the loading screen is gone and main content appears
    await this.page.waitForSelector('h1', { state: 'visible' });
  }

  async getStatCardValue(label: string): Promise<string> {
    const card = this.page.locator(`text=${label}`).locator('..').locator('..');
    const value = card.locator('.text-3xl');
    return value.textContent().then(t => t?.trim() ?? '');
  }
}
