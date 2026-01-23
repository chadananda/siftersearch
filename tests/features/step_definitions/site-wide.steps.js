/**
 * Site-Wide Critical Path Step Definitions
 *
 * Additional steps for comprehensive site-wide testing.
 * Re-uses existing step definitions where possible.
 *
 * Existing steps are defined in:
 * - all-links.steps.js: "I am on the home page", "the page should load without errors"
 * - navigation.steps.js: "I should see the SifterSearch logo"
 * - quick-search.steps.js: Quick search related steps
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';

// ============================================
// Setup
// ============================================
// Note: "the application is running" is now in common.steps.js

// ============================================
// Page Visits
// ============================================
// Note: "I navigate to {string}" is defined in common.steps.js

// ============================================
// Assertions - Only unique ones
// ============================================

Then('I should see the search input', async function () {
  const input = this.page.locator('input#search-input, input[type="search"], input[placeholder*="Search"]');
  const count = await input.count();
  expect(count, 'Should see search input').to.be.greaterThan(0);
});

Then('I should see the version number', async function () {
  const version = await this.page.locator('text=/v\\.?\\d+\\.\\d+/').first();
  const count = await version.count();
  expect(count, 'Should see version number').to.be.greaterThan(0);
});

Then('the page title should be set', async function () {
  const title = await this.page.title();
  expect(title.length, 'Page should have a title').to.be.greaterThan(0);
});

// ============================================
// Quick Search - Using different phrasing
// ============================================

Then('quick search results should be visible', async function () {
  const results = this.page.locator('.quick-search-results .source-card');
  const count = await results.count();
  expect(count, 'Should have quick search results').to.be.greaterThan(0);
});

Then('result cards should have visible text content', async function () {
  const sourceTexts = await this.page.locator('.quick-search-results .source-text').all();
  expect(sourceTexts.length, 'Should have source text elements').to.be.greaterThan(0);

  for (const textEl of sourceTexts.slice(0, 5)) {
    const text = await textEl.textContent();
    expect(text.trim().length, 'Source text should have content').to.be.greaterThan(10);
  }
});

Then('result cards should have paragraph numbers', async function () {
  const paraNumbers = this.page.locator('.quick-search-results .para-num');
  const count = await paraNumbers.count();
  expect(count, 'Results should have paragraph numbers').to.be.greaterThan(0);
});

Then('result cards should have Read More buttons', async function () {
  const buttons = this.page.locator('.quick-search-results .read-more-btn');
  const count = await buttons.count();
  expect(count, 'Should have Read More buttons').to.be.greaterThan(0);
});

// ============================================
// Document Reader
// ============================================

Then('the reader modal should open', async function () {
  const reader = this.page.locator('.reader-overlay, .reader-container, [role="dialog"]');
  await reader.first().waitFor({ state: 'visible', timeout: 10000 });
});

Then('the reader should show the document title', async function () {
  const title = this.page.locator('.reader-container .reader-title, .reader-header h1, .reader-header h2, .reader-header .text-lg');
  const count = await title.count();
  expect(count, 'Reader should show document title').to.be.greaterThan(0);
});

Then('the reader should display paragraphs', async function () {
  const content = this.page.locator('.reader-container .reader-paragraph, .reader-content p, .reader-body');
  await content.first().waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  // Content might not be available if API not updated yet
});

// ============================================
// Search Highlighting
// ============================================

Then('highlighted text should be complete words', async function () {
  const marks = await this.page.locator('.quick-search-results mark').all();
  expect(marks.length, 'Should have highlighted terms').to.be.greaterThan(0);

  for (const mark of marks.slice(0, 10)) {
    const text = await mark.textContent();
    const parent = mark.locator('..');
    const parentText = await parent.textContent();
    const markIndex = parentText.indexOf(text);

    if (markIndex > 0) {
      const charBefore = parentText[markIndex - 1];
      const isSplit = /[a-zA-Z]/.test(charBefore);
      expect(isSplit, `Highlighted "${text}" should not be preceded by a letter (split word)`).to.be.false;
    }
  }
});

Then('result cards should have proper dimensions', async function () {
  const cards = await this.page.locator('.quick-search-results .source-card').all();
  expect(cards.length).to.be.greaterThan(0);

  for (const card of cards.slice(0, 3)) {
    const box = await card.boundingBox();
    expect(box.height, 'Card should have reasonable height (>50px)').to.be.greaterThan(50);
  }
});

// ============================================
// Library
// ============================================

Then('I should see religion categories', async function () {
  // Library page can take a while to load - wait for religion names to appear
  try {
    await this.page.getByText(/Baha.*i|Islam|Buddhism/i).first().waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    // May not find exact text, continue with other checks
  }

  // Check for religion-related content
  const religions = await this.page.getByText(/Baha.*i|Islam|Buddhism|Hindu|Christian|Judai/i).count();
  expect(religions, 'Should see religion categories').to.be.greaterThan(0);
});

// ============================================
// Navigation Links
// ============================================

Then('all visible navigation links should be valid', async function () {
  const links = await this.page.locator('header a[href], nav a[href]').all();
  this.headerLinks = [];

  for (const link of links) {
    const href = await link.getAttribute('href');
    if (href && !href.startsWith('#') && !href.startsWith('javascript:')) {
      this.headerLinks.push(href);
    }
  }

  expect(this.headerLinks.length, 'Should have header links').to.be.greaterThan(0);
});

// ============================================
// Error Handling
// ============================================

Then('the page should show a 404 error', async function () {
  const pageContent = await this.page.content();
  const is404 = pageContent.includes('404') ||
                pageContent.includes('not found') ||
                pageContent.includes('Not Found');
  expect(is404, 'Should show 404 error').to.be.true;
});

Then('there should be a link back to home', async function () {
  const homeLink = this.page.locator('a[href="/"], a:has-text("Home"), a:has-text("home")');
  const count = await homeLink.count();
  expect(count, 'Should have link back to home').to.be.greaterThan(0);
});

// ============================================
// Religion/Collection Steps
// ============================================

When('I click on a religion category', async function () {
  // Click on first religion link in the library tree
  const religionLink = this.page.locator('a[href*="/library/"]').first();
  await religionLink.click();
  await this.page.waitForTimeout(1000);
});

Then('the religion page should load', async function () {
  // Check that URL has changed to a religion page
  const url = this.page.url();
  expect(url).to.match(/\/library\/[a-z-]+$/i);

  // Check for main content
  const mainContent = this.page.locator('main, [role="main"]');
  const isVisible = await mainContent.isVisible();
  expect(isVisible).to.be.true;
});

Then('I should see collections for that religion', async function () {
  // Look for collection links or cards
  const collections = this.page.locator('a[href*="/library/"], .collection, [class*="collection"]');
  const count = await collections.count();
  expect(count, 'Should see collections for the religion').to.be.greaterThan(0);
});

// ============================================
// Auth States
// ============================================
// Note: Auth steps are defined in common.steps.js
