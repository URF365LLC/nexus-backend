import { type Page, type Locator } from '@playwright/test';

export class KeywordsPage {
  readonly page: Page;
  readonly pageHeading: Locator;
  readonly offerListPanel: Locator;
  readonly offerButtons: Locator;
  readonly keywordsPanel: Locator;
  readonly emptyState: Locator;
  readonly keywordTable: Locator;
  readonly keywordRows: Locator;
  readonly keywordsLoadingIndicator: Locator;

  constructor(page: Page) {
    this.page = page;
    this.pageHeading = page.locator('h1', { hasText: 'Keyword Alpha' });
    // The left panel contains offer buttons
    this.offerListPanel = page.locator("text=/Offers \\(/").locator('..');
    this.offerButtons = page.locator('button').filter({ has: page.locator('text=/\\d+ kw/') });
    // Right panel
    this.keywordsPanel = page.locator('text=Select an offer to load keyword intelligence').locator('..');
    this.emptyState = page.locator('text=Select an offer to load keyword intelligence');
    this.keywordTable = page.locator('table');
    this.keywordRows = page.locator('table tbody tr');
    this.keywordsLoadingIndicator = page.locator('text=Loading keywords…');
  }

  async goto() {
    await this.page.goto('/keywords');
  }

  async waitForLoad() {
    await this.pageHeading.waitFor({ state: 'visible' });
    // Wait for offers to load — look for offer buttons with kw count
    await this.page.waitForSelector('button:has-text("kw")', { state: 'visible', timeout: 10000 });
  }

  async selectFirstOffer() {
    await this.offerButtons.first().click();
  }

  async waitForKeywordsLoaded() {
    // Wait for loading indicator to disappear if present
    await this.keywordsLoadingIndicator.waitFor({ state: 'hidden', timeout: 10000 }).catch(() => null);
    // Then wait for table to appear
    await this.keywordTable.waitFor({ state: 'visible', timeout: 10000 });
  }

  async getSelectedOfferName(): Promise<string> {
    // The right panel header shows the selected offer name in h2
    const h2 = this.page.locator('h2').last();
    return h2.textContent().then(t => t?.trim() ?? '');
  }
}
