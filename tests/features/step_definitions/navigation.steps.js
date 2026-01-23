/**
 * Navigation step definitions for NavBar feature tests
 *
 * Uses real Playwright browser automation.
 * Note: Basic page navigation (Given I am on X page) is in all-links.steps.js
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';

// ============================================
// Search Page (alias for home)
// ============================================

Given('I am on the search page', async function () {
  await this.goto('/');
});

Given('I am on the docs page', async function () {
  await this.goto('/docs');
});

// ============================================
// Viewport Steps
// ============================================

// Note: "Given('my viewport is {int} pixels wide'..." is now defined in common.steps.js

// ============================================
// Navigation Bar Visibility
// ============================================

Then('I should see the SifterSearch logo', async function () {
  // Look for logo link or image
  const logo = this.page.locator('a[href="/"]').first();
  await this.assertVisible(logo);
});

Then('I should see the theme toggle button', async function () {
  const themeToggle = this.getByRole('button', { name: /theme|dark|light/i });
  await this.assertVisible(themeToggle);
});

// ============================================
// Navigation Links
// ============================================

Then('I should see the {string} navigation link', async function (linkName) {
  const nav = this.getByRole('navigation');
  const link = nav.getByRole('link', { name: linkName });
  await this.assertVisible(link);
});

Then('I should not see the {string} navigation link in the main nav', async function (linkName) {
  const nav = this.getByRole('navigation');
  const link = nav.getByRole('link', { name: linkName });
  await expect(await link.isVisible()).to.be.false;
});

Then('I should not see any navigation links in the main nav', async function () {
  // On very small viewports, nav links are hidden
  const nav = this.getByRole('navigation');
  const links = nav.getByRole('link');
  const count = await links.count();
  // At minimum there's the logo link
  expect(count).to.be.lessThanOrEqual(1);
});

Then('I should see the hamburger menu button', async function () {
  const hamburger = this.getByRole('button', { name: /menu/i });
  await this.assertVisible(hamburger);
});

// ============================================
// Hamburger Menu
// ============================================

When('I click the hamburger menu button', async function () {
  const hamburger = this.getByRole('button', { name: /menu/i });
  await hamburger.click();
  // Wait for menu animation
  await this.page.waitForTimeout(300);
});

Then('I should see {string} in the dropdown menu', async function (linkName) {
  // Look for link in any menu/dropdown
  const link = this.getByRole('link', { name: linkName });
  await this.assertVisible(link);
});

// ============================================
// User Menu / Auth
// ============================================

Then('I should see the {string} button', async function (buttonName) {
  const button = this.getByRole('button', { name: buttonName });
  await this.assertVisible(button);
});

Then('I should not see the {string} button', async function (buttonName) {
  const button = this.getByRole('button', { name: buttonName });
  await expect(await button.isVisible()).to.be.false;
});

Then('I should see my user avatar', async function () {
  // Look for user menu button or avatar
  const avatar = this.page.locator('[data-testid="user-menu"], [aria-label*="user"], [aria-label*="account"]').first();
  await this.assertVisible(avatar);
});

When('I click on my user avatar', async function () {
  const avatar = this.page.locator('[data-testid="user-menu"], [aria-label*="user"], [aria-label*="account"]').first();
  await avatar.click();
  await this.page.waitForTimeout(300);
});

Then('I should see {string} in the user dropdown', async function (linkName) {
  const link = this.getByRole('link', { name: linkName });
  await this.assertVisible(link);
});

Then('I should not see {string} in the user dropdown', async function (linkName) {
  const link = this.getByRole('link', { name: linkName });
  await expect(await link.isVisible()).to.be.false;
});

// ============================================
// Navigation Actions
// ============================================

When('I click on the {string} navigation link', async function (linkName) {
  await this.clickLink(linkName);
});

Then('I should be on the library page', async function () {
  const url = this.currentUrl();
  expect(url).to.include('/library');
});

Then('I should be on the docs page', async function () {
  const url = this.currentUrl();
  expect(url).to.include('/docs');
});

Then('the {string} link should be active', async function (linkName) {
  // Check for active state via aria-current or CSS class
  const link = this.getByRole('link', { name: linkName });
  const ariaCurrent = await link.getAttribute('aria-current');
  const className = await link.getAttribute('class');

  const isActive = ariaCurrent === 'page' ||
                   className?.includes('active') ||
                   className?.includes('current');
  expect(isActive, `${linkName} link should be active`).to.be.true;
});

// ============================================
// Theme Toggle
// ============================================

Given('the current theme is {string}', async function (theme) {
  // Check document has the expected theme class/attribute
  const html = this.page.locator('html');
  const className = await html.getAttribute('class');
  const dataTheme = await html.getAttribute('data-theme');

  if (theme === 'dark') {
    expect(className?.includes('dark') || dataTheme === 'dark').to.be.true;
  } else {
    expect(!className?.includes('dark') && dataTheme !== 'dark').to.be.true;
  }
});

When('I click the theme toggle button', async function () {
  // Theme button cycles through: "System theme", "Light mode", "Dark mode"
  // Find whichever one is currently displayed
  const themeToggle = this.page.locator('button[aria-label="System theme"], button[aria-label="Light mode"], button[aria-label="Dark mode"]').first();
  await themeToggle.click();
  await this.page.waitForTimeout(100);
});

When('I click the theme toggle button again', async function () {
  // Theme button cycles through: "System theme", "Light mode", "Dark mode"
  const themeToggle = this.page.locator('button[aria-label="System theme"], button[aria-label="Light mode"], button[aria-label="Dark mode"]').first();
  await themeToggle.click();
  await this.page.waitForTimeout(100);
});

Then('the current theme should be {string}', async function (theme) {
  const html = this.page.locator('html');
  const className = await html.getAttribute('class');
  const dataTheme = await html.getAttribute('data-theme');

  if (theme === 'dark') {
    expect(className?.includes('dark') || dataTheme === 'dark').to.be.true;
  } else {
    expect(!className?.includes('dark') && dataTheme !== 'dark').to.be.true;
  }
});
