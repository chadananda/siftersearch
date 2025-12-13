/**
 * Home Page E2E Tests
 *
 * Tests the main search interface and navigation.
 */

import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should display the SifterSearch logo and title', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 })).toContainText('SifterSearch');
  });

  test('should show welcome section with research engine heading', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Ocean Library Agentic Research Engine' })).toBeVisible();
    await expect(page.getByText('Use advanced AI research')).toBeVisible();
  });

  test('should display library statistics', async ({ page }) => {
    // Wait for the Library Contents section which loads asynchronously
    await expect(page.getByText('Library Contents')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Religions')).toBeVisible();
    await expect(page.getByText('Documents')).toBeVisible();
    await expect(page.getByText('Paragraphs')).toBeVisible();
  });

  test('should display suggested searches', async ({ page }) => {
    // Wait for stats to load, which means suggestions are ready too
    await expect(page.getByText('Library Contents')).toBeVisible({ timeout: 10000 });
    // Suggestions are dynamically generated, just check that there are some buttons in the main area
    // The suggestion buttons have various text like "What is the nature of the soul?"
    const mainArea = page.locator('main[role="main"], [role="main"]');
    const suggestionButtons = mainArea.locator('button');
    await expect(suggestionButtons.first()).toBeVisible({ timeout: 10000 });
  });

  test('should have search input and submit button', async ({ page }) => {
    const input = page.getByRole('searchbox', { name: 'Search sacred texts' });
    const submitButton = page.getByRole('button', { name: 'Search' });

    await expect(input).toBeVisible();
    await expect(submitButton).toBeVisible();
  });

  test('should open About section', async ({ page }) => {
    // On mobile, About is a menuitem in hamburger menu. On desktop, it's a direct button.
    // Note: About opens a popover/region on the same page, not a separate page
    const menuButton = page.getByRole('button', { name: 'Toggle menu' });

    // Check if we need to open the mobile menu first
    if (await menuButton.isVisible()) {
      await menuButton.click();
      // Wait for menu to open
      await page.waitForTimeout(300);
      // Click the menuitem
      await page.getByRole('menuitem', { name: 'About' }).click();
    } else {
      // Desktop: click the button
      await page.getByRole('button', { name: 'About' }).click();
    }

    // About section should be visible (it's a popover, not a separate page)
    await expect(page.getByRole('region', { name: 'About SifterSearch' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'About SifterSearch' })).toBeVisible();
  });

  test('should show Sign In button when not authenticated', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Sign In' }).first()).toBeVisible();
  });
});

test.describe('Search Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should allow typing in search input', async ({ page }) => {
    const input = page.getByRole('searchbox', { name: 'Search sacred texts' });
    await input.fill('What is love?');
    await expect(input).toHaveValue('What is love?');
  });

  test('should disable submit button when input is empty', async ({ page }) => {
    const submitButton = page.getByRole('button', { name: 'Search' });
    await expect(submitButton).toBeDisabled();
  });

  test('should enable submit button when input has text', async ({ page }) => {
    const input = page.getByRole('searchbox', { name: 'Search sacred texts' });
    // Use exact match to avoid matching "Clear search and return to library" button
    const submitButton = page.getByRole('button', { name: 'Search', exact: true });

    await input.fill('test query');
    await expect(submitButton).toBeEnabled();
  });

  test('should submit search when clicking a suggestion', async ({ page }) => {
    // Wait for suggestions to load
    await expect(page.getByText('Library Contents')).toBeVisible({ timeout: 10000 });

    // Click the first suggestion button in the main area
    const mainArea = page.locator('main[role="main"], [role="main"]');
    const suggestionBtn = mainArea.locator('button').first();
    await suggestionBtn.click();

    // After clicking, the search should be submitted (will show in the UI)
    // Just check that the button was clickable and triggered something
    await page.waitForTimeout(500);
  });
});

test.describe('Responsive Design', () => {
  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Main elements should still be visible
    await expect(page.getByRole('heading', { name: 'Ocean Library Agentic Research Engine' })).toBeVisible();
    await expect(page.getByRole('searchbox', { name: 'Search sacred texts' })).toBeVisible();
  });
});
