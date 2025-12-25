/**
 * Navigation Bar E2E Tests
 *
 * Tests the NavBar component across different viewport sizes
 * and verifies progressive collapse behavior.
 */

import { test, expect } from '@playwright/test';

test.describe('Navigation Bar', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display the SifterSearch logo', async ({ page }) => {
    const logo = page.locator('.navbar-brand');
    await expect(logo).toBeVisible();
    await expect(logo).toContainText('SifterSearch');
  });

  test('should display theme toggle button', async ({ page }) => {
    const themeToggle = page.locator('.navbar-right button').first();
    await expect(themeToggle).toBeVisible();
  });

  test('should show Sign In button when not authenticated', async ({ page }) => {
    const signInButton = page.getByRole('button', { name: 'Sign In' });
    await expect(signInButton).toBeVisible();
  });
});

test.describe('Navigation - Desktop (1200px)', () => {
  test.use({ viewport: { width: 1200, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display all navigation links', async ({ page }) => {
    await expect(page.locator('.nav-link:has-text("Search")')).toBeVisible();
    await expect(page.locator('.nav-link:has-text("Library")')).toBeVisible();
    await expect(page.locator('.nav-link:has-text("Community")')).toBeVisible();
    await expect(page.locator('.nav-link:has-text("Docs")')).toBeVisible();
  });

  test('should show hamburger menu for About link', async ({ page }) => {
    const hamburger = page.locator('.hamburger-btn');
    await expect(hamburger).toBeVisible();

    await hamburger.click();
    await expect(page.locator('.nav-dropdown')).toBeVisible();
    await expect(page.locator('.nav-dropdown-item:has-text("About")')).toBeVisible();
  });

  test('should navigate to Library page', async ({ page }) => {
    await page.locator('.nav-link:has-text("Library")').click();
    await expect(page).toHaveURL(/\/library/);
  });
});

test.describe('Navigation - Tablet (800px)', () => {
  test.use({ viewport: { width: 800, height: 600 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should show Search, Library, and Community links', async ({ page }) => {
    // These should be visible at 800px
    await expect(page.locator('.nav-link.show-sm:has-text("Search")')).toBeVisible();
    await expect(page.locator('.nav-link.show-sm:has-text("Library")')).toBeVisible();
    await expect(page.locator('.nav-link.show-md:has-text("Community")')).toBeVisible();
  });

  test('should hide Docs link in main nav', async ({ page }) => {
    // Docs requires 1100px, so should be hidden at 800px
    const docsLink = page.locator('.nav-link.show-lg:has-text("Docs")');
    await expect(docsLink).toBeHidden();
  });

  test('should show Docs in hamburger menu', async ({ page }) => {
    const hamburger = page.locator('.hamburger-btn');
    await hamburger.click();

    await expect(page.locator('.nav-dropdown-item.hide-above-lg:has-text("Docs")')).toBeVisible();
    await expect(page.locator('.nav-dropdown-item:has-text("About")')).toBeVisible();
  });
});

test.describe('Navigation - Mobile (500px)', () => {
  test.use({ viewport: { width: 500, height: 800 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should hide all nav links in main nav', async ({ page }) => {
    // All links should be hidden at 500px (below 640px threshold)
    const navLinks = page.locator('.navbar-nav .nav-link:not(.hamburger-btn)');
    const count = await navLinks.count();

    // All visible nav-link elements should be hidden
    for (let i = 0; i < count; i++) {
      await expect(navLinks.nth(i)).toBeHidden();
    }
  });

  test('should show hamburger menu button', async ({ page }) => {
    const hamburger = page.locator('.hamburger-btn');
    await expect(hamburger).toBeVisible();
  });

  test('should show all links in hamburger dropdown', async ({ page }) => {
    const hamburger = page.locator('.hamburger-btn');
    await hamburger.click();

    await expect(page.locator('.nav-dropdown')).toBeVisible();
    await expect(page.locator('.nav-dropdown-item:has-text("Search")')).toBeVisible();
    await expect(page.locator('.nav-dropdown-item:has-text("Library")')).toBeVisible();
    await expect(page.locator('.nav-dropdown-item:has-text("Community")')).toBeVisible();
    await expect(page.locator('.nav-dropdown-item:has-text("Docs")')).toBeVisible();
    await expect(page.locator('.nav-dropdown-item:has-text("About")')).toBeVisible();
  });

  test('should navigate from hamburger menu', async ({ page }) => {
    const hamburger = page.locator('.hamburger-btn');
    await hamburger.click();

    await page.locator('.nav-dropdown-item:has-text("Library")').click();
    await expect(page).toHaveURL(/\/library/);
  });
});

test.describe('Navigation - Active State', () => {
  test('should mark Search as active on home page', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    const searchLink = page.locator('.nav-link:has-text("Search")');
    await expect(searchLink).toHaveClass(/active/);
  });

  test('should mark Library as active on library page', async ({ page }) => {
    await page.goto('/library');
    await page.waitForLoadState('networkidle');

    const libraryLink = page.locator('.nav-link:has-text("Library")');
    await expect(libraryLink).toHaveClass(/active/);
  });
});

test.describe('Theme Toggle', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should toggle theme when clicked', async ({ page }) => {
    // Get the HTML element to check for theme class
    const html = page.locator('html');

    // Find and click the theme toggle button
    const themeToggle = page.locator('.navbar-right button[aria-label*="theme"], .navbar-right button:has(svg)').first();

    // Get initial theme state
    const initialDark = await html.evaluate(el => el.classList.contains('dark'));

    // Click toggle
    await themeToggle.click();
    await page.waitForTimeout(100);

    // Theme should have changed
    const afterClickDark = await html.evaluate(el => el.classList.contains('dark'));
    expect(afterClickDark).not.toBe(initialDark);
  });
});
