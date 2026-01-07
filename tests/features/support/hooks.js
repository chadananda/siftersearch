/**
 * Cucumber Hooks - Setup and teardown for BDD tests
 *
 * Manages browser lifecycle for UI tests using Playwright.
 */

import { Before, After, BeforeAll, AfterAll, setDefaultTimeout, Status } from '@cucumber/cucumber';
import { mkdir } from 'fs/promises';

// 60 second timeout for tests
setDefaultTimeout(60000);

// Shared browser instance across scenarios for performance
let sharedBrowser = null;

// ============================================
// Global Setup/Teardown
// ============================================

BeforeAll(async function () {
  console.log('[BDD] Starting test run...');

  // Create screenshots directory
  await mkdir('test-results/screenshots', { recursive: true }).catch(() => {});
});

AfterAll(async function () {
  console.log('[BDD] Test run complete.');

  // Close shared browser if exists
  if (sharedBrowser) {
    await sharedBrowser.close().catch(() => {});
    sharedBrowser = null;
  }
});

// ============================================
// Scenario Setup
// ============================================

Before(async function (scenario) {
  // Reset state
  this.testUser = null;
  this.authToken = null;
  this.response = null;
  this.responseData = null;
  this.lastResponse = null;

  // Tag-based user setup
  const tags = scenario.pickle.tags.map(t => t.name);

  if (tags.includes('@admin')) {
    this.testUser = { email: 'admin@test.com', tier: 'admin', id: 'admin_1' };
    this.authToken = 'test_admin_token';
  } else if (tags.includes('@patron')) {
    this.testUser = { email: 'patron@test.com', tier: 'patron', id: 'patron_1' };
    this.authToken = 'test_patron_token';
  } else if (tags.includes('@approved')) {
    this.testUser = { email: 'approved@test.com', tier: 'approved', id: 'approved_1' };
    this.authToken = 'test_approved_token';
  } else if (tags.includes('@verified')) {
    this.testUser = { email: 'verified@test.com', tier: 'verified', id: 'verified_1' };
    this.authToken = 'test_verified_token';
  }

  // Reuse browser for performance, but create fresh context per scenario
  if (this.browser) {
    sharedBrowser = this.browser;
  } else if (sharedBrowser) {
    this.browser = sharedBrowser;
  }
});

// ============================================
// Scenario Teardown
// ============================================

After(async function (scenario) {
  // Take screenshot on failure
  if (scenario.result?.status === Status.FAILED && this.page) {
    const name = scenario.pickle.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    try {
      await this.screenshot(`failed-${name}`);
    } catch (e) {
      console.error(`[BDD] Failed to take screenshot: ${e.message}`);
    }
  }

  // Clean up browser context (but keep browser for reuse)
  await this.closeBrowser?.();
});

// ============================================
// Tag-specific hooks
// ============================================

// Before UI/accessibility tests - ensure browser is ready
Before({ tags: '@ui or @accessibility or @implemented' }, async function () {
  // Browser will be lazily initialized on first navigation
});

// Webhook tests need special signature
Before({ tags: '@webhook' }, function () {
  this.webhookSignature = 'test_webhook_signature';
});

// Security tests
Before({ tags: '@security' }, function () {
  console.log('[BDD] Security test scenario');
});

// Mobile viewport for mobile tests
Before({ tags: '@mobile' }, async function () {
  if (!this.page) await this.launchBrowser();
  await this.setMobileViewport();
});

// Tablet viewport
Before({ tags: '@tablet' }, async function () {
  if (!this.page) await this.launchBrowser();
  await this.setTabletViewport();
});
