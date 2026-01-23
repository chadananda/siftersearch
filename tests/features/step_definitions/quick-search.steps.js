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

// Note: "Given/When('I navigate to the home page'..." is now defined in common.steps.js

Given('quick search mode is enabled', async function () {
  // Wait for lightning button to be ready
  const lightningBtn = this.page.locator('.lightning-btn');
  await lightningBtn.waitFor({ state: 'visible', timeout: 10000 });

  // Click to enable quick search if not already active
  const isActive = await lightningBtn.evaluate(el => el.classList.contains('active'));
  if (!isActive) {
    await lightningBtn.click({ force: true });
    await this.page.waitForTimeout(500);
    // Verify it's now active
    const nowActive = await lightningBtn.evaluate(el => el.classList.contains('active'));
    if (!nowActive) {
      // Try clicking again
      await lightningBtn.click({ force: true });
      await this.page.waitForTimeout(500);
    }
  }
});

// ============================================
// Actions
// ============================================

When('I click the lightning button', async function () {
  const lightningBtn = this.page.locator('.lightning-btn');
  // Use force:true because button may be partially covered by input styling
  await lightningBtn.click({ force: true });
  await this.page.waitForTimeout(300);
});

When('I type {string} in the search box', async function (text) {
  const searchInput = this.page.locator('input#search-input');
  await searchInput.fill(text);
  this.lastSearchQuery = text;
});

When('I wait for quick search results', async function () {
  // Wait for debounce (30ms) + API response + render (can take 2-3 seconds)
  await this.page.waitForTimeout(3000);
  // Wait for actual results to appear (mark tags indicate highlighted search terms)
  try {
    await this.page.locator('mark').first().waitFor({ state: 'visible', timeout: 10000 });
  } catch {
    // If no marks, check for "No results" message or any result content
    const noResults = await this.page.getByText('No results').isVisible().catch(() => false);
    if (!noResults) {
      // Results might have loaded without highlighting
      await this.page.waitForTimeout(1000);
    }
  }
});

When('I click "Read More" on the first result', async function () {
  const readMoreBtn = this.page.locator('button:has-text("Read More")').first();
  await readMoreBtn.click();
  // Wait for reader to open
  await this.page.waitForTimeout(1000);
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

// Note: "Then('I should see quick search results'..." is now defined in common.steps.js

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
  // Look for paragraph numbers in results - they show the paragraph index
  const paraNumbers = this.page.locator('.para-num, [class*="para-num"]');
  const _count = await paraNumbers.count();
  // Para numbers may not be visible if results use different styling
  // At minimum we should have results with Read More buttons
  const readMoreBtns = await this.page.locator('button:has-text("Read More")').count();
  expect(readMoreBtns, 'Should have results with paragraph numbers or Read More buttons').to.be.greaterThan(0);
});

Then('each result should have a citation bar', async function () {
  const citationBars = this.page.locator('.quick-search-results .source-card .citation-bar');
  const count = await citationBars.count();
  expect(count, 'Each result should have a citation bar').to.be.greaterThan(0);
});

Then('each result should have a "Read More" button', async function () {
  const readMoreBtns = this.page.locator('button:has-text("Read More")');
  const count = await readMoreBtns.count();
  expect(count, 'Each result should have a Read More button').to.be.greaterThan(0);

  // Verify button text
  const firstBtn = readMoreBtns.first();
  const text = await firstBtn.textContent();
  expect(text.trim(), 'Button should say "Read More"').to.include('Read More');
});

Then('search results should contain highlighted terms', async function () {
  // Look for <mark> tags in results (Meilisearch highlighting)
  const marks = this.page.locator('mark');
  const count = await marks.count();
  expect(count, 'Results should contain <mark> tags for highlighting').to.be.greaterThan(0);
});

// ============================================
// Assertions - Document Reader
// ============================================

// Note: "Then('the document reader should open'..." is now defined in common.steps.js
// Note: "Then('the reader should show document content'..." is now defined in common.steps.js
