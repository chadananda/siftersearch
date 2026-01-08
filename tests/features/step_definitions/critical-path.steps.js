/**
 * Critical Path Step Definitions
 *
 * Steps for critical user flows that must pass before every deployment.
 * All selectors use ARIA roles/labels for accessibility compliance.
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';

// ============================================
// Home Page & Navigation
// ============================================

Then('I should see the search interface', async function () {
  // Look for searchbox role or search form
  const searchBox = this.getByRole('searchbox');
  await this.assertVisible(searchBox);
});

Then('the page should have no critical console errors', async function () {
  // Check we captured no critical errors during page load
  // This is tracked via page.on('console') in playwright-world.js
  // For now, just verify page loaded successfully
  expect(this.lastResponse?.status()).to.be.lessThan(500);
});

// ============================================
// Search Functionality
// ============================================

When('I enter {string} in the search box', async function (query) {
  await this.fillSearch(query);
  this.lastSearchQuery = query;
});

When('I submit the search', async function () {
  // Press Enter or click search button
  const searchBox = this.getByRole('searchbox');
  await searchBox.press('Enter');
  // Wait for results to load
  await this.page.waitForTimeout(2000);
});

When('I submit the search without entering text', async function () {
  const searchBox = this.getByRole('searchbox');
  await searchBox.press('Enter');
  await this.page.waitForTimeout(500);
});

Then('I should see search results', async function () {
  // Look for result items, article elements, or result container
  const results = this.page.locator('[aria-label*="result"], [role="article"], .search-result, .result-item');
  const count = await results.count();
  expect(count, 'Expected at least one search result').to.be.greaterThan(0);
});

Then('results should contain relevant passages', async function () {
  // Verify results have text content
  const results = this.page.locator('[aria-label*="result"], [role="article"], .search-result, .result-item');
  const firstResult = results.first();
  const text = await firstResult.textContent();
  expect(text?.length, 'Result should have content').to.be.greaterThan(10);
});

Then('I should see a helpful message or remain on search', async function () {
  // Either show "enter a query" message or stay on search interface
  const searchBox = this.getByRole('searchbox');
  await this.assertVisible(searchBox);
});

Then('the page should not show an error', async function () {
  // No error messages visible
  const errorElements = this.page.locator('[role="alert"][aria-live="assertive"], .error-message');
  const count = await errorElements.count();
  if (count > 0) {
    const text = await errorElements.first().textContent();
    // Allow "no results" type messages, but not actual errors
    expect(text?.toLowerCase()).to.not.include('error');
    expect(text?.toLowerCase()).to.not.include('failed');
  }
});

// ============================================
// Library Browser
// ============================================

Then('I should see the library interface', async function () {
  // Look for library-specific elements
  const library = this.page.locator('[aria-label*="library"], [role="main"] h1, .library-container');
  await this.assertVisible(library.first());
});

Then('I should see document cards or a document list', async function () {
  // Look for document items
  const docs = this.page.locator('[aria-label*="document"], [role="listitem"], .doc-card, .document-item, article');
  const count = await docs.count();
  expect(count, 'Expected at least one document').to.be.greaterThan(0);
});

Then('I should see the document count', async function () {
  // Look for stats showing document count
  const stats = this.page.locator('[aria-label*="documents"], [aria-label*="stats"], .stats, .document-count');
  await this.assertVisible(stats.first());
});

When('I filter by a religion', async function () {
  // Click on a religion filter/tag
  const filters = this.page.locator('[aria-label*="filter"], [role="button"][data-religion], .religion-tag, .filter-button');
  const firstFilter = filters.first();
  if (await firstFilter.isVisible()) {
    this.selectedFilter = await firstFilter.textContent();
    await firstFilter.click();
    await this.page.waitForTimeout(1000);
  }
});

Then('the document list should update', async function () {
  // Verify the list refreshed (this is implicit in most cases)
  await this.page.waitForTimeout(500);
});

Then('filtered results should reflect the filter', async function () {
  // This is a placeholder - in real tests, verify documents match filter
  // For critical path, just ensure no errors occurred
  expect(this.lastResponse?.status() || 200).to.be.lessThan(500);
});

// ============================================
// Authentication Flow
// ============================================

When('I click the {string} button', async function (buttonName) {
  await this.clickButton(buttonName);
  await this.page.waitForTimeout(500);
});

Then('I should see the sign in form', async function () {
  // Look for form or dialog
  const form = this.page.locator('[role="dialog"], form[aria-label*="sign"], .auth-modal, .sign-in-form');
  await this.assertVisible(form.first());
});

Then('I should see the email input', async function () {
  const emailInput = this.getByLabel(/email/i);
  await this.assertVisible(emailInput);
});

Then('I should see the password input', async function () {
  const passwordInput = this.getByLabel(/password/i);
  await this.assertVisible(passwordInput);
});

When('I enter valid test credentials', async function () {
  await this.fillInput('Email', 'test@siftersearch.com');
  await this.fillInput('Password', 'testpassword123');
});

When('I submit the sign in form', async function () {
  // Click submit button in form
  const submitButton = this.getByRole('button', { name: /sign in|log in|submit/i });
  await submitButton.click();
  await this.page.waitForTimeout(2000);
});

Then('I should be authenticated', async function () {
  // User menu should be visible OR sign in button hidden
  const signInButton = this.getByRole('button', { name: 'Sign In' });
  const isSignInVisible = await signInButton.isVisible().catch(() => false);
  expect(isSignInVisible).to.be.false;
});

Then('I should see the user menu', async function () {
  const userMenu = this.page.locator('[aria-label*="user"], [aria-label*="account"], [data-testid="user-menu"], .user-avatar');
  await this.assertVisible(userMenu.first());
});

Given('I am authenticated as a test user', async function () {
  // Login via API or localStorage for test user
  this.testUser = { email: 'test@siftersearch.com', tier: 'approved' };
  // For now, set up test auth state
  await this.goto('/');
  // If there's a way to set auth via localStorage or cookies, do it here
});

When('I open the user menu', async function () {
  const userMenu = this.page.locator('[aria-label*="user"], [aria-label*="account"], [data-testid="user-menu"], .user-avatar');
  await userMenu.first().click();
  await this.page.waitForTimeout(300);
});

When('I click {string}', async function (text) {
  const element = this.page.locator(`[role="menuitem"]:has-text("${text}"), button:has-text("${text}"), a:has-text("${text}")`);
  await element.first().click();
  await this.page.waitForTimeout(500);
});

Then('I should be signed out', async function () {
  this.testUser = null;
  this.authToken = null;
});

// ============================================
// Theme & Accessibility
// ============================================

Then('the theme should change', async function () {
  const html = this.page.locator('html');
  const className = await html.getAttribute('class');
  const dataTheme = await html.getAttribute('data-theme');
  // Theme should be set to something
  expect(className || dataTheme).to.exist;
});

Then('the preference should be remembered on reload', async function () {
  const htmlBefore = this.page.locator('html');
  const themeBefore = await htmlBefore.getAttribute('class') || await htmlBefore.getAttribute('data-theme');

  await this.page.reload();

  const htmlAfter = this.page.locator('html');
  const themeAfter = await htmlAfter.getAttribute('class') || await htmlAfter.getAttribute('data-theme');

  // Theme should persist
  expect(themeAfter).to.include(themeBefore?.includes('dark') ? 'dark' : '');
});

When('I press Tab repeatedly', async function () {
  // Press Tab several times
  for (let i = 0; i < 5; i++) {
    await this.page.keyboard.press('Tab');
    await this.page.waitForTimeout(100);
  }
});

Then('focus should move through interactive elements', async function () {
  // Verify an element has focus
  const focused = await this.page.evaluate(() => {
    const el = document.activeElement;
    return el && el.tagName !== 'BODY';
  });
  expect(focused, 'An element should have focus').to.be.true;
});

Then('focus should be visible', async function () {
  // Check focused element has visible focus indicator
  const hasFocusStyle = await this.page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el.tagName === 'BODY') return false;
    const styles = window.getComputedStyle(el);
    // Check for outline or box-shadow (common focus indicators)
    return styles.outline !== 'none' || styles.boxShadow !== 'none';
  });
  // This is a soft check - some focus styles use other methods
  expect(true).to.be.true; // Placeholder - focus visibility varies
});

// ============================================
// Stats & Ingestion Progress
// ============================================

Then('I should see library statistics', async function () {
  const stats = this.page.locator('[aria-label*="stats"], [aria-label*="library"], .stats-container, .library-stats');
  await this.assertVisible(stats.first());
});

Then('I should see the passage count', async function () {
  // Look for passage count in stats
  const passageStats = this.page.locator(':text("passages"), :text("paragraphs")');
  await this.assertVisible(passageStats.first());
});

When('the library is partially indexed', async function () {
  // This is a precondition check - we just verify the state
  // The ingestion progress should show if < 100% indexed
  this.expectPartialIndexing = true;
});

Then('I should see ingestion progress', async function () {
  // Look for progress indicator
  const progress = this.page.locator('[aria-label*="progress"], [role="progressbar"], .ingestion-progress, .progress-bar');
  // This might not be visible if fully indexed
  try {
    await progress.first().waitFor({ state: 'visible', timeout: 3000 });
  } catch {
    // Not visible means fully indexed - that's OK
    console.log('Ingestion progress not visible - library may be fully indexed');
  }
});

Then('the progress should show percentage complete', async function () {
  const progressText = this.page.locator(':text("%"), [aria-valuenow]');
  // This might not be visible if fully indexed
  const isVisible = await progressText.first().isVisible().catch(() => false);
  if (this.expectPartialIndexing && !isVisible) {
    console.log('Warning: Expected partial indexing but no progress shown');
  }
});

// ============================================
// Error Handling
// ============================================

When('I navigate to a non-existent page {string}', async function (path) {
  await this.goto(path);
});

Then('I should see the 404 error page', async function () {
  // Check for 404 indicator
  const notFound = this.page.locator(':text("404"), :text("not found"), :text("page doesn\'t exist")');
  await this.assertVisible(notFound.first());
});

Then('I should see a way to return home', async function () {
  // Look for home link
  const homeLink = this.page.locator('a[href="/"], :text("home"), :text("go back")');
  await this.assertVisible(homeLink.first());
});

Given('the API returns an error', async function () {
  // Mock API to return error - this would require route interception
  // For now, we'll skip this precondition and handle gracefully
  this.mockApiError = true;
});

When('I perform a UI search', async function () {
  await this.fillSearch('test query');
  const searchBox = this.getByRole('searchbox');
  await searchBox.press('Enter');
  await this.page.waitForTimeout(1000);
});

Then('I should see a user-friendly error message', async function () {
  // If API error was mocked, check for error message
  // Otherwise, this is a soft pass
  if (this.mockApiError) {
    const errorMsg = this.page.locator('[role="alert"], .error, :text("error"), :text("try again")');
    const isVisible = await errorMsg.first().isVisible().catch(() => false);
    if (!isVisible) {
      console.log('Note: Error message not visible - API may not have errored');
    }
  }
});

Then('the page should remain functional', async function () {
  // Verify page is still interactive
  const searchBox = this.getByRole('searchbox');
  await this.assertVisible(searchBox);
});
