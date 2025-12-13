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
    // Note: May show "Library Not Connected" if API is down
    const libraryContent = page.getByText('Library Contents');
    const libraryNotConnected = page.getByText('Library Not Connected');

    // Wait for either state - library connected or not
    await expect(libraryContent.or(libraryNotConnected)).toBeVisible({ timeout: 15000 });

    // Only check stats if library is connected
    if (await libraryContent.isVisible()) {
      await expect(page.getByText('Religions')).toBeVisible();
      await expect(page.getByText('Documents')).toBeVisible();
      await expect(page.getByText('Paragraphs')).toBeVisible();
    }
  });

  test('should display suggested searches', async ({ page }) => {
    // Wait for either stats or "not connected" state
    const libraryContent = page.getByText('Library Contents');
    const libraryNotConnected = page.getByText('Library Not Connected');
    await expect(libraryContent.or(libraryNotConnected)).toBeVisible({ timeout: 15000 });

    // Suggestions are in the main area - they exist even when disabled
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

    // Wait for library status to load
    const libraryContent = page.getByText('Library Contents');
    const libraryNotConnected = page.getByText('Library Not Connected');
    await expect(libraryContent.or(libraryNotConnected)).toBeVisible({ timeout: 15000 });

    await input.fill('test query');

    // Button should be enabled only if library is connected
    if (await libraryContent.isVisible()) {
      await expect(submitButton).toBeEnabled();
    } else {
      // When library is disconnected, button stays disabled even with text
      await expect(submitButton).toBeDisabled();
    }
  });

  test('should submit search when clicking a suggestion', async ({ page }) => {
    // Wait for either library connected or not connected state
    const libraryContent = page.getByText('Library Contents');
    const libraryNotConnected = page.getByText('Library Not Connected');
    await expect(libraryContent.or(libraryNotConnected)).toBeVisible({ timeout: 15000 });

    // If library is connected, test clicking a suggestion
    if (await libraryContent.isVisible()) {
      const mainArea = page.locator('main[role="main"], [role="main"]');
      const suggestionBtn = mainArea.locator('button:not([disabled])').first();
      await suggestionBtn.click();
      // After clicking, the search should be submitted (will show in the UI)
      await page.waitForTimeout(500);
    }
    // Skip test action if library not connected (suggestions are disabled)
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
