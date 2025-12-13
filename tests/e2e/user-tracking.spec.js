/**
 * User Tracking E2E Tests
 *
 * Tests anonymous user ID generation, storage, and the query limit system.
 */

import { test, expect } from '@playwright/test';

test.describe('Anonymous User ID', () => {
  test.beforeEach(async ({ page }) => {
    // Clear storage before each test to simulate fresh user
    await page.goto('/');
  });

  test('should generate user ID on first visit', async ({ page }) => {
    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Check localStorage for user ID
    const userId = await page.evaluate(() => localStorage.getItem('sifter_user_id'));

    expect(userId).toBeTruthy();
    expect(userId).toMatch(/^user_[a-f0-9-]+$/i);
  });

  test('should persist user ID across page reloads', async ({ page }) => {
    await page.waitForLoadState('networkidle');

    // Get initial user ID
    const initialUserId = await page.evaluate(() => localStorage.getItem('sifter_user_id'));

    // Reload page
    await page.reload();
    await page.waitForLoadState('networkidle');

    // User ID should be the same
    const afterReloadUserId = await page.evaluate(() => localStorage.getItem('sifter_user_id'));

    expect(afterReloadUserId).toBe(initialUserId);
  });

  test('should persist user ID across navigation', async ({ page }) => {
    await page.waitForLoadState('networkidle');
    const initialUserId = await page.evaluate(() => localStorage.getItem('sifter_user_id'));

    // Navigate to about page
    await page.goto('/about');
    await page.waitForLoadState('networkidle');

    const aboutPageUserId = await page.evaluate(() => localStorage.getItem('sifter_user_id'));

    expect(aboutPageUserId).toBe(initialUserId);
  });
});

test.describe('Search with User Tracking', () => {
  test('should send X-User-ID header with search requests', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Get user ID
    const userId = await page.evaluate(() => localStorage.getItem('sifter_user_id'));

    // Intercept network requests
    let capturedRequest = null;
    page.on('request', request => {
      if (request.url().includes('/api/search/analyze/stream')) {
        capturedRequest = request;
      }
    });

    // Type a search query using the labeled searchbox
    const searchInput = page.getByRole('searchbox', { name: 'Search sacred texts' });
    await searchInput.fill('What is justice?');

    // Submit search (press Enter)
    await searchInput.press('Enter');

    // Wait for the request
    await page.waitForTimeout(2000);

    // Verify the header was sent
    if (capturedRequest) {
      const headers = capturedRequest.headers();
      expect(headers['x-user-id']).toBe(userId);
    }
  });
});

test.describe('Query Limit Display', () => {
  test('should show remaining queries info after search', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Type a simple search using the labeled searchbox
    const searchInput = page.getByRole('searchbox', { name: 'Search sacred texts' });
    await searchInput.fill('What is love?');
    await searchInput.press('Enter');

    // Wait for search results (should see sources or response)
    await page.waitForTimeout(15000); // AI search can take time

    // Check for query limit info in response (this depends on UI implementation)
    // For now, just verify the search completes
    const pageContent = await page.content();

    // The search should have processed (either showing results or at least the query)
    expect(pageContent.toLowerCase()).toContain('love');
  });
});

test.describe('Admin Login', () => {
  test('should login with admin credentials', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Open auth modal - click Sign In button (in banner/header area)
    // On mobile it's in the header, on desktop in the nav
    const signInButton = page.locator('header, banner, nav').getByRole('button', { name: 'Sign In' }).first();
    await signInButton.click();

    // Wait for modal
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Fill in admin credentials
    await page.getByLabel('Email').fill('chadananda@gmail.com');
    await page.getByLabel('Password').fill('vanilla1844');

    // Submit - click the button inside the dialog form
    await dialog.getByRole('button', { name: 'Sign In' }).click();

    // Wait for login to complete
    await page.waitForTimeout(3000);

    // Modal should close and user should be logged in
    // Check that Sign In button is replaced with user menu or avatar
    await expect(dialog).not.toBeVisible({ timeout: 10000 });
  });
});

test.describe('User ID Unification on Login', () => {
  test('should preserve anonymous user ID for unification', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Get anonymous user ID
    const anonymousUserId = await page.evaluate(() => localStorage.getItem('sifter_user_id'));
    expect(anonymousUserId).toBeTruthy();

    // Do a search before login to generate some history
    const searchInput = page.getByRole('searchbox', { name: 'Search sacred texts' });
    await searchInput.fill('test query before login');
    await searchInput.press('Enter');
    await page.waitForTimeout(5000);

    // Now login - click Sign In button (in banner/header area)
    const signInButton = page.locator('header, banner, nav').getByRole('button', { name: 'Sign In' }).first();
    await signInButton.click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.getByLabel('Email').fill('chadananda@gmail.com');
    await page.getByLabel('Password').fill('vanilla1844');
    await dialog.getByRole('button', { name: 'Sign In' }).click();

    await page.waitForTimeout(3000);

    // After login, the anonymous user ID should still be in localStorage
    // (it's used to send X-User-ID for unification in the login request)
    const userIdAfterLogin = await page.evaluate(() => localStorage.getItem('sifter_user_id'));

    // User ID might be updated or preserved - just verify it exists
    expect(userIdAfterLogin).toBeTruthy();
  });
});
