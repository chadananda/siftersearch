/**
 * Step definitions for all-links.feature
 *
 * Tests that all pages and links work correctly using real Playwright navigation.
 */

import { When, Then, Given } from '@cucumber/cucumber';
import { expect } from 'chai';

// ============================================
// PAGE NAVIGATION - Real Playwright
// ============================================

When('I navigate to {string}', async function (path) {
  await this.goto(path);
});

Then('the page should load without errors', async function () {
  // Check HTTP response was successful
  const status = this.lastResponse?.status();
  expect(status, `Page returned HTTP ${status}`).to.be.lessThan(400);
});

Then('the page should have visible content', async function () {
  // Wait for body to have content
  const body = await this.page.$('body');
  expect(body, 'Page body should exist').to.not.be.null;

  const content = await this.page.textContent('body');
  expect(content.length, 'Page should have text content').to.be.greaterThan(50);
});

Then('the page should not show a 404 error', async function () {
  const status = this.lastResponse?.status();
  expect(status, 'Page should not be 404').to.not.equal(404);

  // Also check for 404 text in page
  const pageText = await this.page.textContent('body');
  expect(pageText.toLowerCase()).to.not.include('page not found');
});

Then('the page should not show a 500 error', async function () {
  const status = this.lastResponse?.status();
  expect(status, 'Page should not be 500').to.not.equal(500);

  // Also check for error text in page
  const pageText = await this.page.textContent('body');
  expect(pageText.toLowerCase()).to.not.include('internal server error');
});

// ============================================
// NAVIGATION LINKS
// ============================================

Given('I am on the library page', async function () {
  await this.goto('/library');
});

Given('I am on the home page', async function () {
  await this.goto('/');
});

Given('I am on the about page', async function () {
  await this.goto('/about');
});

When('I click the {string} link in the navigation', async function (linkText) {
  // Find nav link by accessible name
  await this.clickLink(linkText);
});

When('I click the {string} link in the footer', async function (linkText) {
  // Click link within footer
  const footer = this.page.locator('footer');
  await footer.getByRole('link', { name: linkText }).click();
  await this.waitForNavigation();
});

Then('I should be on the home page', async function () {
  const url = this.currentUrl();
  expect(url).to.match(/\/$/);
});

Then('I should be on the {string} page', async function (pageName) {
  const url = this.currentUrl();
  const expectedPath = pageName.toLowerCase().replace(/\s+/g, '-');
  expect(url).to.include(expectedPath);
});

Then('the page title should contain {string}', async function (text) {
  await this.assertTitle(text);
});

// ============================================
// HEADER/NAV BAR
// ============================================

Then('I should see the navigation bar', async function () {
  const nav = this.getByRole('navigation');
  await this.assertVisible(nav);
});

Then('the navigation should contain a {string} link', async function (linkText) {
  const nav = this.getByRole('navigation');
  const link = nav.getByRole('link', { name: linkText });
  await this.assertVisible(link);
});

// ============================================
// ERROR HANDLING
// ============================================

When('I navigate to a non-existent page', async function () {
  await this.goto('/this-page-does-not-exist-12345');
});

Then('I should see a {int} error page', async function (statusCode) {
  const status = this.lastResponse?.status();
  expect(status).to.equal(statusCode);
});

Then('I should see an error message', async function () {
  // Look for common error indicators
  const pageText = await this.page.textContent('body');
  const hasError = pageText.toLowerCase().includes('not found') ||
                   pageText.toLowerCase().includes('error') ||
                   pageText.includes('404');
  expect(hasError, 'Page should show error message').to.be.true;
});
