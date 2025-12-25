/**
 * Cucumber Hooks - Setup and teardown for test scenarios
 */

import { Before, After, BeforeAll, AfterAll, setDefaultTimeout } from '@cucumber/cucumber';

// Increase default timeout for slower operations
setDefaultTimeout(30000);

// Global setup before all scenarios
BeforeAll(async function () {
  // Could start test server here
  console.log('[Cucumber] Starting test run...');
});

// Global teardown after all scenarios
AfterAll(async function () {
  console.log('[Cucumber] Test run complete.');
});

// Before each scenario
Before(async function (scenario) {
  // Reset state before each scenario
  await this.cleanup?.();

  // Tag-based setup
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
});

// After each scenario
After(async function (scenario) {
  // Log scenario result
  const status = scenario.result?.status;
  if (status === 'FAILED') {
    console.log(`[Cucumber] Scenario failed: ${scenario.pickle.name}`);
  }

  // Cleanup
  await this.cleanup?.();
});

// Before scenarios tagged @ui or @accessibility
Before({ tags: '@ui or @accessibility' }, async function () {
  // Browser setup would go here (Playwright)
  console.log('[Cucumber] UI test - browser setup would go here');
});

// After UI scenarios
After({ tags: '@ui or @accessibility' }, async function () {
  // Browser teardown
  if (this.browser) {
    await this.browser.close();
    this.browser = null;
  }
});

// Before webhook scenarios
Before({ tags: '@webhook' }, function () {
  // Set up webhook test context
  this.webhookSignature = 'test_webhook_signature';
});

// Before security-related scenarios
Before({ tags: '@security' }, function () {
  // Security tests may need special setup
  console.log('[Cucumber] Security test scenario');
});
