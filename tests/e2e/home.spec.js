/**
 * Home Page E2E Tests
 *
 * Tests the main search interface and navigation.
 */

import { test, expect } from '@playwright/test';

test.describe('Home Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should display the SifterSearch logo and title', async ({ page }) => {
    await expect(page.locator('h1')).toContainText('SifterSearch');
  });

  test('should show welcome message when no messages', async ({ page }) => {
    await expect(page.getByText('Explore Sacred Texts')).toBeVisible();
    await expect(page.getByText('Search across interfaith scriptures')).toBeVisible();
  });

  test('should display suggested searches', async ({ page }) => {
    await expect(page.getByRole('button', { name: /nature of the soul/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /creation stories/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /compassion/i })).toBeVisible();
  });

  test('should have search mode selector', async ({ page }) => {
    const modeSelector = page.locator('select');
    await expect(modeSelector).toBeVisible();

    // Check available options
    const options = modeSelector.locator('option');
    await expect(options).toHaveCount(3);
    await expect(options.nth(0)).toHaveText('Hybrid Search');
    await expect(options.nth(1)).toHaveText('Keyword Only');
    await expect(options.nth(2)).toHaveText('Semantic Only');
  });

  test('should have search input and submit button', async ({ page }) => {
    const input = page.getByPlaceholder('Search sacred texts...');
    const submitButton = page.locator('button[type="submit"]');

    await expect(input).toBeVisible();
    await expect(submitButton).toBeVisible();
  });

  test('should navigate to About page', async ({ page }) => {
    await page.getByRole('link', { name: 'About' }).click();
    await expect(page).toHaveURL('/about');
    await expect(page.getByText('About SifterSearch')).toBeVisible();
  });

  test('should show Sign In button when not authenticated', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });
});

test.describe('Search Interaction', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should allow typing in search input', async ({ page }) => {
    const input = page.getByPlaceholder('Search sacred texts...');
    await input.fill('What is love?');
    await expect(input).toHaveValue('What is love?');
  });

  test('should disable submit button when input is empty', async ({ page }) => {
    const submitButton = page.locator('button[type="submit"]');
    await expect(submitButton).toBeDisabled();
  });

  test('should enable submit button when input has text', async ({ page }) => {
    const input = page.getByPlaceholder('Search sacred texts...');
    const submitButton = page.locator('button[type="submit"]');

    await input.fill('test query');
    await expect(submitButton).toBeEnabled();
  });

  test('should populate input when clicking suggestion', async ({ page }) => {
    await page.getByRole('button', { name: /nature of the soul/i }).click();

    // The suggestion should trigger a search, showing loading or results
    // Since we don't have a real backend, we expect to see user message
    await expect(page.getByText('What is the nature of the soul?')).toBeVisible();
  });
});

test.describe('Responsive Design', () => {
  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // Main elements should still be visible
    await expect(page.getByText('Explore Sacred Texts')).toBeVisible();
    await expect(page.getByPlaceholder('Search sacred texts...')).toBeVisible();
  });
});
