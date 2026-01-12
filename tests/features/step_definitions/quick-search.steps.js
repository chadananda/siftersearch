/**
 * Quick Search Step Definitions
 *
 * Steps for testing the quick search mode (lightning button toggle).
 * Tests UI behavior using Playwright with ARIA-based selectors.
 *
 * Note: "I am on the home page" step is defined in all-links.steps.js
 * Note: "I should see the document content" step is defined in library.steps.js
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';

// ============================================
// Setup & Navigation
// ============================================

Given('I navigate to the home page', async function () {
  if (!this.page) await this.launchBrowser();
  // Navigate without waiting for networkidle (some API calls may fail)
  // Use environment variable or default to localhost:5173
  const baseUrl = process.env.BASE_URL || process.env.UI_URL || 'http://localhost:5173';
  await this.page.goto(baseUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });
  // Wait for the search input to be ready
  await this.page.locator('input#search-input').waitFor({ state: 'visible', timeout: 15000 });
});

Given('quick search mode is enabled', async function () {
  // Click lightning button to enable quick search
  const lightningBtn = this.page.locator('.lightning-btn');
  const isActive = await lightningBtn.evaluate(el => el.classList.contains('active'));
  if (!isActive) {
    await lightningBtn.click();
    await this.page.waitForTimeout(100);
  }
});

// ============================================
// Actions
// ============================================

When('I click the lightning button', async function () {
  const lightningBtn = this.page.locator('.lightning-btn');
  await lightningBtn.click();
  await this.page.waitForTimeout(100);
});

When('I type {string} in the search box', async function (text) {
  const searchInput = this.page.locator('input#search-input');
  await searchInput.fill(text);
  this.lastSearchQuery = text;
});

When('I wait for quick search results', async function () {
  // Wait for debounce (30ms) + API response + render
  await this.page.waitForTimeout(500);
  // Wait for either results or "No results found" message
  await this.page.locator('.quick-search-results').waitFor({ state: 'visible', timeout: 10000 });
  // Wait for loading spinner to disappear
  const spinner = this.page.locator('.quick-search-results .animate-spin');
  if (await spinner.isVisible().catch(() => false)) {
    await spinner.waitFor({ state: 'hidden', timeout: 10000 });
  }
});

When('I click "Read More" on the first result', async function () {
  const readMoreBtn = this.page.locator('.quick-search-results .read-more-btn').first();
  await readMoreBtn.click();
  // Wait for reader to open
  await this.page.waitForTimeout(500);
});

// ============================================
// Assertions - Toggle State
// ============================================

Then('quick search mode should be enabled', async function () {
  const lightningBtn = this.page.locator('.lightning-btn');
  const isActive = await lightningBtn.evaluate(el => el.classList.contains('active'));
  expect(isActive, 'Lightning button should have active class').to.be.true;
});

Then('quick search mode should be disabled', async function () {
  const lightningBtn = this.page.locator('.lightning-btn');
  const isActive = await lightningBtn.evaluate(el => el.classList.contains('active'));
  expect(isActive, 'Lightning button should not have active class').to.be.false;
});

Then('the lightning button should appear active', async function () {
  const lightningBtn = this.page.locator('.lightning-btn');
  const isActive = await lightningBtn.evaluate(el => el.classList.contains('active'));
  expect(isActive, 'Lightning button should appear active').to.be.true;
});

Then('the search placeholder should say {string}', async function (expectedPlaceholder) {
  const searchInput = this.page.locator('input#search-input');
  const placeholder = await searchInput.getAttribute('placeholder');
  expect(placeholder, `Placeholder should be "${expectedPlaceholder}"`).to.equal(expectedPlaceholder);
});

// ============================================
// Assertions - Results
// ============================================

Then('I should see quick search results', async function () {
  const results = this.page.locator('.quick-search-results .source-card');
  const count = await results.count();
  expect(count, 'Should have at least one quick search result').to.be.greaterThan(0);
});

Then('the results count should be displayed', async function () {
  const statsText = this.page.locator('.quick-search-results .text-muted').first();
  const text = await statsText.textContent();
  // Should match pattern like "1,234 results in 45ms"
  expect(text, 'Should show results count and time').to.match(/\d+.*results.*in.*\d+ms/i);
});

Then('quick search results should use source-card styling', async function () {
  const sourceCards = this.page.locator('.quick-search-results .source-card');
  const count = await sourceCards.count();
  expect(count, 'Results should use source-card class').to.be.greaterThan(0);

  // Verify cards have the expanded class
  const firstCard = sourceCards.first();
  const hasExpanded = await firstCard.evaluate(el => el.classList.contains('expanded'));
  expect(hasExpanded, 'Source cards should have expanded class').to.be.true;
});

Then('each result should have a paragraph number', async function () {
  const paraNumbers = this.page.locator('.quick-search-results .source-card .para-num');
  const count = await paraNumbers.count();
  expect(count, 'Each result should have a paragraph number element').to.be.greaterThan(0);
});

Then('each result should have a citation bar', async function () {
  const citationBars = this.page.locator('.quick-search-results .source-card .citation-bar');
  const count = await citationBars.count();
  expect(count, 'Each result should have a citation bar').to.be.greaterThan(0);
});

Then('each result should have a "Read More" button', async function () {
  const readMoreBtns = this.page.locator('.quick-search-results .source-card .read-more-btn');
  const count = await readMoreBtns.count();
  expect(count, 'Each result should have a Read More button').to.be.greaterThan(0);

  // Verify button text
  const firstBtn = readMoreBtns.first();
  const text = await firstBtn.textContent();
  expect(text.trim(), 'Button should say "Read More"').to.equal('Read More');
});

Then('search results should contain highlighted terms', async function () {
  // Look for <mark> tags in results (Meilisearch highlighting)
  const marks = this.page.locator('.quick-search-results .source-card mark');
  const count = await marks.count();
  expect(count, 'Results should contain <mark> tags for highlighting').to.be.greaterThan(0);
});

// ============================================
// Assertions - Document Reader
// ============================================

Then('the document reader should open', async function () {
  // Reader overlay should be visible
  const reader = this.page.locator('.reader-overlay, .reader-container, [role="dialog"]');
  await reader.first().waitFor({ state: 'visible', timeout: 5000 });
});

Then('the reader should show document content', async function () {
  // Reader should have content visible
  const content = this.page.locator('.reader-container .reader-paragraph, .reader-content p, .reader-body, .reader-text');
  const count = await content.count();
  expect(count, 'Reader should show document content').to.be.greaterThan(0);
});
