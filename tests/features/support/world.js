/**
 * Cucumber World - Unified context for BDD tests
 *
 * Combines API testing and Playwright browser automation.
 * All UI tests use ARIA-based selectors for accessibility compliance.
 */

import { setWorldConstructor, World } from '@cucumber/cucumber';
import { chromium } from '@playwright/test';

class SifterSearchWorld extends World {
  constructor(options) {
    super(options);

    // Base URLs (dev mode uses 5173, production preview uses 4321)
    this.apiBaseUrl = process.env.API_URL || 'http://localhost:3000';
    this.uiBaseUrl = process.env.UI_URL || 'http://localhost:5173';

    // Browser config
    this.headless = process.env.HEADLESS !== 'false';
    this.slowMo = parseInt(process.env.SLOW_MO || '0', 10);

    // Browser instances (lazy initialized)
    this.browser = null;
    this.context = null;
    this.page = null;

    // Auth state
    this.testUser = null;
    this.authToken = null;

    // Response state
    this.response = null;
    this.responseData = null;
    this.lastResponse = null;

    // Feature-specific state
    this.searchCount = 0;
    this.webhookSignature = null;
    this.activeSubscription = null;
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
      baseURL: this.uiBaseUrl
    });

    this.page = await this.context.newPage();

    // Log browser console errors
    this.page.on('console', msg => {
      if (msg.type() === 'error') {
        console.error(`[Browser] ${msg.text()}`);
      }
    });

    // Log failed requests
    this.page.on('requestfailed', request => {
      console.error(`[Request Failed] ${request.url()}: ${request.failure()?.errorText}`);
    });
  }

  async closeBrowser() {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.context) {
      await this.context.close().catch(() => {});
      this.context = null;
    }
  }

  async closeBrowserCompletely() {
    await this.closeBrowser();
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }

  // ============================================
  // Navigation
  // ============================================

  async goto(path) {
    if (!this.page) await this.launchBrowser();
    const url = path.startsWith('http') ? path : `${this.uiBaseUrl}${path}`;
    this.lastResponse = await this.page.goto(url, {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    // Wait a bit for dynamic content but don't block on network
    await this.page.waitForTimeout(500);
    return this.lastResponse;
  }

  async waitForNavigation() {
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForTimeout(300);
  }

  currentUrl() {
    return this.page?.url() || null;
  }

  // ============================================
  // ARIA-Based Selectors
  // ============================================

  getByRole(role, options = {}) {
    return this.page.getByRole(role, options);
  }

  getByLabel(label, options = {}) {
    return this.page.getByLabel(label, options);
  }

  getByPlaceholder(placeholder, options = {}) {
    return this.page.getByPlaceholder(placeholder, options);
  }

  getByText(text, options = {}) {
    return this.page.getByText(text, options);
  }

  getByTestId(testId) {
    return this.page.getByTestId(testId);
  }

  // ============================================
  // UI Actions
  // ============================================

  async clickLink(name, options = {}) {
    await this.getByRole('link', { name, ...options }).click();
    await this.waitForNavigation();
  }

  async clickButton(name, options = {}) {
    await this.getByRole('button', { name, ...options }).click();
  }

  async fillInput(label, value) {
    await this.getByLabel(label).fill(value);
  }

  async fillSearch(value) {
    // Try searchbox role first, then placeholder
    const searchbox = this.page.getByRole('searchbox');
    if (await searchbox.count() > 0) {
      await searchbox.fill(value);
    } else {
      await this.page.getByPlaceholder(/search/i).fill(value);
    }
  }

  async pressEnter() {
    await this.page.keyboard.press('Enter');
  }

  // ============================================
  // Assertions
  // ============================================

  async assertVisible(locator) {
    await locator.waitFor({ state: 'visible', timeout: 10000 });
  }

  async assertHidden(locator) {
    await locator.waitFor({ state: 'hidden', timeout: 10000 });
  }

  async assertUrl(pattern) {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    await this.page.waitForURL(regex, { timeout: 10000 });
  }

  async assertPageContains(text) {
    await this.page.getByText(text).first().waitFor({ state: 'visible', timeout: 10000 });
  }

  async assertTitle(expected) {
    const title = await this.page.title();
    if (!title.includes(expected)) {
      throw new Error(`Expected title to contain "${expected}", got "${title}"`);
    }
  }

  assertResponseOk() {
    if (!this.lastResponse) {
      throw new Error('No response captured');
    }
    const status = this.lastResponse.status();
    if (status >= 400) {
      throw new Error(`Expected OK response, got ${status}`);
    }
  }

  // ============================================
  // Viewport
  // ============================================

  async setMobileViewport() {
    await this.page.setViewportSize({ width: 375, height: 667 });
  }

  async setTabletViewport() {
    await this.page.setViewportSize({ width: 768, height: 1024 });
  }

  async setDesktopViewport() {
    await this.page.setViewportSize({ width: 1280, height: 720 });
  }

  // ============================================
  // API Requests
  // ============================================

  async apiRequest(method, path, body = null, headers = {}) {
    const url = `${this.apiBaseUrl}${path}`;
    const options = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers
      }
    };

    if (this.authToken) {
      options.headers['Authorization'] = `Bearer ${this.authToken}`;
    }

    if (body) {
      options.body = JSON.stringify(body);
    }

    this.response = await fetch(url, options);
    try {
      this.responseData = await this.response.json();
    } catch {
      this.responseData = null;
    }

    return this.response;
  }

  // ============================================
  // Screenshots & Debug
  // ============================================

  async screenshot(name) {
    if (!this.page) return null;
    const path = `test-results/screenshots/${name}-${Date.now()}.png`;
    await this.page.screenshot({ path, fullPage: true });
    console.log(`[Screenshot] ${path}`);
    return path;
  }

  async debugPause() {
    if (!this.headless && this.page) {
      await this.page.pause();
    }
  }

  // ============================================
  // Cleanup
  // ============================================

  async cleanup() {
    this.testUser = null;
    this.authToken = null;
    this.response = null;
    this.responseData = null;
    this.lastResponse = null;
    this.searchCount = 0;
    await this.closeBrowser();
  }
}

setWorldConstructor(SifterSearchWorld);

export { SifterSearchWorld };
