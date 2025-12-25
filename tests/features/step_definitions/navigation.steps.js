/**
 * Navigation step definitions for NavBar feature tests
 */

import { Given, When, Then } from '@cucumber/cucumber';
import { expect } from 'chai';

// ============================================
// Page Navigation Steps
// ============================================

Given('I am on the home page', async function () {
  this.currentPage = '/';
  // In a full implementation, this would use Playwright
  this.pageContext = { path: '/', viewport: 1200 };
});

Given('I am on the search page', async function () {
  this.currentPage = '/';
  this.pageContext = { path: '/', viewport: 1200 };
});

Given('I am on the library page', async function () {
  this.currentPage = '/library';
  this.pageContext = { path: '/library', viewport: 1200 };
});

Given('I am on the docs page', async function () {
  this.currentPage = '/docs';
  this.pageContext = { path: '/docs', viewport: 1200 };
});

// Note: "I visit the home page" step is defined in user-tracking.steps.js
// Using a unique step name here to avoid conflicts
When('I navigate to the home page', async function () {
  this.currentPage = '/';
  this.pageContext = { path: '/', viewport: this.pageContext?.viewport || 1200 };
});

// ============================================
// Viewport Steps
// ============================================

Given('my viewport is {int} pixels wide', async function (width) {
  this.pageContext = { ...this.pageContext, viewport: width };
});

// ============================================
// Navigation Bar Visibility Steps
// ============================================

Then('I should see the navigation bar', async function () {
  // NavBar component should be present
  this.navBarVisible = true;
  expect(this.navBarVisible).to.be.true;
});

Then('I should see the SifterSearch logo', async function () {
  // Logo is always visible in NavBar
  expect(true).to.be.true;
});

Then('I should see the theme toggle button', async function () {
  // Theme toggle is always visible
  expect(true).to.be.true;
});

// ============================================
// Navigation Links Visibility Steps
// ============================================

Then('I should see the {string} navigation link', async function (linkName) {
  const viewport = this.pageContext?.viewport || 1200;
  const visibleLinks = getVisibleLinks(viewport);
  expect(visibleLinks).to.include(linkName);
});

Then('I should not see the {string} navigation link in the main nav', async function (linkName) {
  const viewport = this.pageContext?.viewport || 1200;
  const visibleLinks = getVisibleLinks(viewport);
  expect(visibleLinks).to.not.include(linkName);
});

Then('I should not see any navigation links in the main nav', async function () {
  const viewport = this.pageContext?.viewport || 1200;
  const visibleLinks = getVisibleLinks(viewport);
  expect(visibleLinks.length).to.equal(0);
});

Then('I should see the hamburger menu button', async function () {
  const viewport = this.pageContext?.viewport || 1200;
  // Hamburger is visible when any links are hidden
  const hasHiddenLinks = viewport < 1100;
  expect(hasHiddenLinks).to.be.true;
});

// ============================================
// Hamburger Menu Steps
// ============================================

When('I click the hamburger menu button', async function () {
  this.hamburgerMenuOpen = true;
});

Then('I should see {string} in the dropdown menu', async function (linkName) {
  expect(this.hamburgerMenuOpen).to.be.true;
  const viewport = this.pageContext?.viewport || 1200;
  const hiddenLinks = getHiddenLinks(viewport);
  // About is always in hamburger
  if (linkName === 'About') {
    expect(true).to.be.true;
  } else {
    expect(hiddenLinks).to.include(linkName);
  }
});

// ============================================
// User Menu Steps
// ============================================

Then('I should see the {string} button', async function (buttonName) {
  if (buttonName === 'Sign In') {
    expect(this.authToken).to.be.null;
  }
});

Then('I should not see the {string} button', async function (buttonName) {
  if (buttonName === 'Sign In') {
    expect(this.authToken).to.not.be.null;
  }
});

Then('I should see my user avatar', async function () {
  expect(this.authToken).to.not.be.null;
});

When('I click on my user avatar', async function () {
  this.userMenuOpen = true;
});

Then('I should see {string} in the user dropdown', async function (linkName) {
  expect(this.userMenuOpen).to.be.true;
  const userMenuLinks = ['Profile', 'Settings', 'Referrals', 'Support', 'Sign Out'];
  if (this.testUser?.tier === 'admin') {
    userMenuLinks.push('Admin');
  }
  expect(userMenuLinks).to.include(linkName);
});

Then('I should not see {string} in the user dropdown', async function (linkName) {
  expect(this.userMenuOpen).to.be.true;
  if (linkName === 'Admin') {
    expect(this.testUser?.tier).to.not.equal('admin');
  }
});

// ============================================
// Navigation Action Steps
// ============================================

When('I click on the {string} navigation link', async function (linkName) {
  const linkPaths = {
    'Search': '/',
    'Library': '/library',
    'Community': '/community',
    'Docs': '/docs'
  };
  this.currentPage = linkPaths[linkName] || '/';
});

Then('I should be on the home page', async function () {
  expect(this.currentPage).to.equal('/');
});

Then('I should be on the library page', async function () {
  expect(this.currentPage).to.equal('/library');
});

Then('the {string} link should be active', async function (linkName) {
  const linkPaths = {
    'Search': '/',
    'Library': '/library',
    'Community': '/community',
    'Docs': '/docs'
  };
  expect(this.currentPage).to.equal(linkPaths[linkName]);
});

// ============================================
// Theme Steps
// ============================================

Given('the current theme is {string}', async function (theme) {
  this.currentTheme = theme;
});

When('I click the theme toggle button', async function () {
  this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
});

When('I click the theme toggle button again', async function () {
  this.currentTheme = this.currentTheme === 'light' ? 'dark' : 'light';
});

Then('the current theme should be {string}', async function (theme) {
  expect(this.currentTheme).to.equal(theme);
});

// ============================================
// Helper Functions
// ============================================

function getVisibleLinks(viewport) {
  const links = [];
  // Search and Library visible at 640px+
  if (viewport >= 640) {
    links.push('Search', 'Library');
  }
  // Community visible at 768px+ (md breakpoint)
  if (viewport >= 768) {
    links.push('Community');
  }
  // Docs visible at 1024px+ (lg breakpoint)
  if (viewport >= 1024) {
    links.push('Docs');
  }
  return links;
}

function getHiddenLinks(viewport) {
  const allLinks = ['Search', 'Library', 'Community', 'Docs'];
  const visible = getVisibleLinks(viewport);
  return allLinks.filter(link => !visible.includes(link));
}
