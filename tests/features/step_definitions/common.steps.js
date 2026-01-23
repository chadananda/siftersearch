/**
 * Common step definitions shared across features
 * Uses ARIA and semantic selectors for accessibility compliance
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';

const BASE_URL = process.env.UI_URL || 'http://localhost:5173';

// ============================================
// Authentication Steps (shared across features)
// ============================================

Given('I am logged in as an approved user', async function () {
  this.testUser = { email: 'approved@test.com', tier: 'approved', id: 'user_approved' };
  this.authToken = 'test_approved_token';
});

Given('I am logged in as a verified user', async function () {
  this.testUser = { email: 'verified@test.com', tier: 'verified', id: 'user_verified' };
  this.authToken = 'test_verified_token';
});

Given('I am logged in as an admin', async function () {
  this.testUser = { email: 'admin@test.com', tier: 'admin', id: 'user_admin' };
  this.authToken = 'test_admin_token';
});

Given('I am an anonymous user', function () {
  this.authToken = null;
  this.testUser = null;
});

Given('I am not authenticated', function () {
  this.authToken = null;
  this.testUser = null;
});

Given('I am logged in as a {string} user', async function (tier) {
  this.testUser = { email: `${tier}@test.com`, tier, id: `user_${tier}` };
  this.authToken = `test_${tier}_token`;
});

// ============================================
// Common Response Assertions
// ============================================

Then('I should receive a {int} unauthorized error', function (statusCode) {
  expect(this.response.status).to.equal(statusCode);
});

Then('I should receive a {int} bad request error', function (statusCode) {
  expect(this.response.status).to.equal(statusCode);
});

Then('I should receive a {int} forbidden error', function (statusCode) {
  expect(this.response.status).to.equal(statusCode);
});

Then('I should receive a {int} error', function (statusCode) {
  expect(this.response.status).to.equal(statusCode);
});

Then('I should receive a success response', function () {
  expect(this.response.ok).to.be.true;
});

Then('I should receive a validation error', function () {
  expect(this.response.status).to.be.oneOf([400, 422]);
});

Then('the error should mention {string}', function (text) {
  const message = this.responseData?.message || this.responseData?.error || '';
  expect(message.toLowerCase()).to.include(text.toLowerCase());
});

Then('the error message should mention {string}', function (text) {
  const message = this.responseData?.message || this.responseData?.error || '';
  expect(message.toLowerCase()).to.include(text.toLowerCase());
});

// ============================================
// Application State (Browser-based)
// ============================================

Given('the application is running', async function () {
  // Launch browser if not already launched
  if (!this.page) {
    await this.launchBrowser();
  }

  // Verify app is accessible
  try {
    const response = await fetch(BASE_URL);
    expect(response.ok, 'Application should be responding').to.be.true;
  } catch (err) {
    throw new Error(`Application not running at ${BASE_URL}: ${err.message}`);
  }
});

// ============================================
// Viewport / Responsive
// ============================================

Given('my viewport is {int} pixels wide', async function (width) {
  if (!this.page) await this.launchBrowser();
  await this.page.setViewportSize({ width, height: 800 });
});

// ============================================
// Navigation
// ============================================

When('I navigate to {string}', async function (path) {
  if (!this.page) await this.launchBrowser();
  await this.page.goto(`${BASE_URL}${path}`);
  await this.page.waitForLoadState('networkidle');
});

When('I navigate to the library page', async function () {
  if (!this.page) await this.launchBrowser();
  await this.page.goto(`${BASE_URL}/library`);
  await this.page.waitForLoadState('networkidle');
});

When('I navigate to a non-existent page', async function () {
  if (!this.page) await this.launchBrowser();
  await this.page.goto(`${BASE_URL}/this-page-does-not-exist-${Date.now()}`);
  await this.page.waitForLoadState('networkidle');
});

When('I navigate to the home page', async function () {
  if (!this.page) await this.launchBrowser();
  await this.page.goto(BASE_URL);
  await this.page.waitForLoadState('networkidle');
});

// ============================================
// Page Load Assertions (using ARIA/semantic selectors)
// ============================================

Then('the page should load without errors', async function () {
  // Check for common error indicators using semantic/ARIA selectors
  const errorHeading = await this.page.locator('h1:has-text("Error"), h1:has-text("404"), h1:has-text("500")').count();
  expect(errorHeading).to.equal(0, 'Page should not show error heading');

  // Check that main content landmark exists
  const mainContent = await this.page.locator('main, [role="main"]').count();
  expect(mainContent).to.be.greaterThan(0, 'Page should have main content area');

  // Check for any visible error messages
  const errorAlerts = await this.page.locator('[role="alert"]:visible, .error:visible').count();
  expect(errorAlerts).to.equal(0, 'Page should not show error alerts');
});

Then('I should see a user-friendly error message', async function () {
  // Look for error message using ARIA role or semantic selectors
  const errorMessage = await this.page.locator('[role="alert"], .error-message, .error').count();
  expect(errorMessage).to.be.greaterThan(0, 'Should show error message');

  // Error message should not contain technical details
  const errorText = await this.page.locator('[role="alert"], .error-message, .error').first().textContent();
  expect(errorText).to.not.match(/undefined|null|Error:|at \w+/i, 'Error should be user-friendly');
});

// ============================================
// Search
// ============================================

When('I search for {string}', async function (query) {
  // Use ARIA label to find search input
  const searchInput = this.page.locator('input[type="search"], input[aria-label*="earch"], input[placeholder*="earch"]').first();
  await searchInput.fill(query);

  // Find and click search button
  const searchButton = this.page.locator('button[type="submit"], button[aria-label*="earch"]').first();
  await searchButton.click();
  await this.page.waitForLoadState('networkidle');
});

When('I perform a search', async function () {
  await this.page.locator('input[type="search"], input[aria-label*="earch"]').first().fill('test query');
  await this.page.locator('button[type="submit"], button[aria-label*="earch"]').first().click();
  await this.page.waitForLoadState('networkidle');
});

Then('I should see quick search results', async function () {
  // Look for results container using semantic selectors
  const results = this.page.locator('[role="region"][aria-label*="esult"], .search-results, .results').first();
  const isVisible = await results.isVisible({ timeout: 5000 });
  expect(isVisible).to.be.true;
});

// ============================================
// Library / Document Reader
// ============================================

Then('the document list should be visible', async function () {
  // Use semantic selectors for document list
  const docList = this.page.locator('[role="list"], .document-list, .doc-list').first();
  const isVisible = await docList.isVisible({ timeout: 3000 });
  expect(isVisible).to.be.true;
});

Then('the document reader should open', async function () {
  // Check for main content area of document reader
  const reader = this.page.locator('main[class*="document"], [role="main"]').first();
  const isVisible = await reader.isVisible({ timeout: 3000 });
  expect(isVisible).to.be.true;
});

Then('the reader should show document content', async function () {
  // Look for document content using semantic selectors
  const content = this.page.locator('main .document-content, main .doc-content, article').first();
  const isVisible = await content.isVisible();
  expect(isVisible).to.be.true;
});

// ============================================
// Library Navigation (Religion/Collection/Document)
// ============================================

Given('I am on a religion page', async function () {
  if (!this.page) await this.launchBrowser();
  // Navigate to a religion page (e.g., Bahai)
  await this.page.goto(`${BASE_URL}/library/bahai`);
  await this.page.waitForLoadState('networkidle');
});

Given('I am on a collection page', async function () {
  if (!this.page) await this.launchBrowser();
  // Navigate to a collection page (e.g., Bahai > Core Publications)
  await this.page.goto(`${BASE_URL}/library/bahai/core-tablets`);
  await this.page.waitForLoadState('networkidle');
});

When('I click on a collection', async function () {
  // Find and click a collection link using semantic selectors
  const collectionLink = this.page.locator('a[href*="/library/"][aria-label], .collection-link, [role="link"]').first();
  await collectionLink.click();
  await this.page.waitForLoadState('networkidle');
});

When('I click on a document', async function () {
  // Find and click a document link using semantic selectors
  const documentLink = this.page.locator('a[href*="/library/"], .document-link, [role="link"]').first();
  await documentLink.click();
  await this.page.waitForLoadState('networkidle');
});

Then('the collection page should load', async function () {
  // Verify collection page loaded with document list
  const documentList = this.page.locator('[role="list"], .document-list, .collection-documents').first();
  const isVisible = await documentList.isVisible({ timeout: 5000 });
  expect(isVisible).to.be.true;
});

Then('I should see documents in the collection', async function () {
  // Check for document items using semantic selectors
  const documents = this.page.locator('[role="listitem"], .document-card, .document-item');
  const count = await documents.count();
  expect(count).to.be.greaterThan(0, 'Collection should have documents');
});

Then('the document page should load', async function () {
  // Verify document presentation page loaded
  const documentContent = this.page.locator('main[class*="document"], article, [role="main"]').first();
  const isVisible = await documentContent.isVisible({ timeout: 5000 });
  expect(isVisible).to.be.true;

  // Should have document title
  const title = this.page.locator('h1').first();
  const hasTitle = await title.isVisible();
  expect(hasTitle).to.be.true;
});

Then('I should see the document content', async function () {
  // Check for paragraphs/content
  const content = this.page.locator('.document-content, .doc-content, article').first();
  const isVisible = await content.isVisible();
  expect(isVisible).to.be.true;

  // Should have at least one paragraph
  const paragraphs = this.page.locator('p, .paragraph');
  const count = await paragraphs.count();
  expect(count).to.be.greaterThan(0, 'Document should have content');
});
