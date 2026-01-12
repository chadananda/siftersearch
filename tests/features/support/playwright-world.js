/**
 * Playwright-Integrated Cucumber World
 *
 * Provides real browser automation for BDD tests using Playwright.
 * All selectors use ARIA roles/labels for accessibility compliance.
 */

import { setWorldConstructor, World } from '@cucumber/cucumber';
import { chromium } from '@playwright/test';

class PlaywrightWorld extends World {
  constructor(options) {
    super(options);

    // Browser instances
    this.browser = null;
    this.context = null;
    this.page = null;

    // Configuration
    this.baseUrl = process.env.BASE_URL || 'http://localhost:5173';
    this.apiUrl = process.env.API_URL || 'http://localhost:3001';
    this.headless = process.env.HEADLESS !== 'false';
    this.slowMo = parseInt(process.env.SLOW_MO || '0', 10);

    // Test state
    this.testUser = null;
    this.authToken = null;
    this.lastResponse = null;
  }

  // ============================================
  // Browser Lifecycle
  // ============================================

  async launchBrowser() {
    if (!this.browser) {
      this.browser = await chromium.launch({
        headless: this.headless,
        slowMo: this.slowMo
      });
    }

    this.context = await this.browser.newContext({
      viewport: { width: 1280, height: 720 },
      baseURL: this.baseUrl
    });

    this.page = await this.context.newPage();

    // Set up console logging for debugging
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`[Browser Error] ${msg.text()}`);
      }
    });
  }

  async closeBrowser() {
    if (this.page) {
      await this.page.close();
      this.page = null;
    }
    if (this.context) {
      await this.context.close();
      this.context = null;
    }
  }

  async closeBrowserCompletely() {
    await this.closeBrowser();
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  // ============================================
  // Navigation
  // ============================================

  async goto(path) {
    const url = path.startsWith('http') ? path : `${this.baseUrl}${path}`;
    // Use 'load' instead of 'networkidle' to avoid hanging on failed API requests
    const response = await this.page.goto(url, { waitUntil: 'load', timeout: 30000 });
    // Give page time to initialize after load
    await this.page.waitForTimeout(1000);
    this.lastResponse = response;
    return response;
  }

  async waitForNavigation() {
    await this.page.waitForLoadState('load');
    await this.page.waitForTimeout(500);
  }

  // ============================================
  // ARIA-Based Selectors
  // All selectors use accessibility attributes for testability
  // ============================================

  /**
   * Find element by ARIA role and accessible name
   */
  getByRole(role, options = {}) {
    return this.page.getByRole(role, options);
  }

  /**
   * Find element by aria-label
   */
  getByLabel(label, options = {}) {
    return this.page.getByLabel(label, options);
  }

  /**
   * Find element by placeholder text
   */
  getByPlaceholder(placeholder, options = {}) {
    return this.page.getByPlaceholder(placeholder, options);
  }

  /**
   * Find element by text content
   */
  getByText(text, options = {}) {
    return this.page.getByText(text, options);
  }

  /**
   * Find element by test ID (data-testid attribute)
   */
  getByTestId(testId) {
    return this.page.getByTestId(testId);
  }

  // ============================================
  // Common UI Actions
  // ============================================

  /**
   * Click a link by its accessible name
   */
  async clickLink(name, options = {}) {
    const link = this.getByRole('link', { name, ...options });
    await link.click();
    await this.waitForNavigation();
  }

  /**
   * Click a button by its accessible name
   */
  async clickButton(name, options = {}) {
    const button = this.getByRole('button', { name, ...options });
    await button.click();
  }

  /**
   * Click a menu item by its accessible name
   */
  async clickMenuItem(name) {
    const menuItem = this.getByRole('menuitem', { name });
    await menuItem.click();
    await this.waitForNavigation();
  }

  /**
   * Fill a text input by its label
   */
  async fillInput(label, value) {
    const input = this.getByLabel(label);
    await input.fill(value);
  }

  /**
   * Fill a searchbox
   */
  async fillSearch(value) {
    const search = this.getByRole('searchbox');
    await search.fill(value);
  }

  /**
   * Select an option from a combobox/select
   */
  async selectOption(label, value) {
    const select = this.getByLabel(label);
    await select.selectOption(value);
  }

  // ============================================
  // Assertions
  // ============================================

  /**
   * Assert element is visible
   */
  async assertVisible(locator) {
    await locator.waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Assert element is hidden
   */
  async assertHidden(locator) {
    await locator.waitFor({ state: 'hidden', timeout: 10000 });
  }

  /**
   * Assert page URL matches pattern
   */
  async assertUrl(pattern) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    await this.page.waitForURL(regex);
  }

  /**
   * Assert page contains text
   */
  async assertPageContains(text) {
    await this.page.getByText(text).waitFor({ state: 'visible', timeout: 10000 });
  }

  /**
   * Assert HTTP response status
   */
  assertResponseOk() {
    if (!this.lastResponse) {
      throw new Error('No response captured');
    }
    const status = this.lastResponse.status();
    if (status >= 400) {
      throw new Error(`Expected successful response, got ${status}`);
    }
  }

  // ============================================
  // Viewport Management
  // ============================================

  async setViewport(width, height = 720) {
    await this.page.setViewportSize({ width, height });
  }

  async setMobileViewport() {
    await this.setViewport(375, 667);
  }

  async setTabletViewport() {
    await this.setViewport(768, 1024);
  }

  async setDesktopViewport() {
    await this.setViewport(1280, 720);
  }

  // ============================================
  // Authentication Helpers
  // ============================================

  async loginAs(email, password) {
    // Navigate to home and open sign in
    await this.goto('/');
    await this.clickButton('Sign In');

    // Fill login form
    await this.fillInput('Email', email);
    await this.fillInput('Password', password);
    await this.clickButton('Sign In');

    // Wait for auth to complete
    await this.page.waitForTimeout(1000);
  }

  async loginAsTestUser(tier = 'user') {
    // For testing, we might need to set up auth via API or localStorage
    // This depends on your auth implementation
    const testCredentials = {
      admin: { email: 'admin@test.com', password: 'testpass123' },
      user: { email: 'user@test.com', password: 'testpass123' },
      guest: { email: 'guest@test.com', password: 'testpass123' }
    };

    const creds = testCredentials[tier];
    if (creds) {
      this.testUser = { tier, ...creds };
      await this.loginAs(creds.email, creds.password);
    }
  }

  async logout() {
    // Click user menu and sign out
    try {
      await this.clickButton('User menu');
      await this.clickMenuItem('Sign Out');
    } catch {
      // User might not be logged in
    }
    this.testUser = null;
    this.authToken = null;
  }

  // ============================================
  // Screenshot & Debug
  // ============================================

  async screenshot(name) {
    const path = `test-results/screenshots/${name}-${Date.now()}.png`;
    await this.page.screenshot({ path, fullPage: true });
    return path;
  }

  async debugPause() {
    if (!this.headless) {
      await this.page.pause();
    }
  }

  // ============================================
  // Cleanup
  // ============================================

  async cleanup() {
    this.testUser = null;
    this.authToken = null;
    this.lastResponse = null;
  }
}

setWorldConstructor(PlaywrightWorld);

export { PlaywrightWorld };
