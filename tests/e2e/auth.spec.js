/**
 * Authentication E2E Tests
 *
 * Tests the auth modal functionality.
 */

import { test, expect } from '@playwright/test';

test.describe('Auth Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('should open auth modal when clicking Sign In', async ({ page }) => {
    // Use first Sign In button (nav bar)
    await page.getByRole('button', { name: 'Sign In' }).first().click();

    // Modal should appear
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  });

  test('should show login form by default', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).first().click();
    const dialog = page.getByRole('dialog');

    await expect(dialog.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Password' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Sign In' })).toBeVisible();
  });

  test('should switch to signup form', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).first().click();
    const dialog = page.getByRole('dialog');

    // Click "Sign up" link
    await dialog.getByRole('button', { name: 'Sign up' }).click();

    // Should show signup form
    await expect(dialog.getByRole('heading', { name: 'Create Account' })).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Name' })).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Email' })).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Password' })).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Create Account' })).toBeVisible();
  });

  test('should switch back to login form', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).first().click();
    const dialog = page.getByRole('dialog');

    await dialog.getByRole('button', { name: 'Sign up' }).click();
    await dialog.getByRole('button', { name: 'Sign in' }).click();

    await expect(dialog.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  });

  test('should close modal when clicking close button', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    // Click close dialog button
    await dialog.getByRole('button', { name: 'Close dialog' }).click();

    await expect(dialog).not.toBeVisible();
  });

  test('should close modal when pressing Escape', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(dialog).not.toBeVisible();
  });

  test('should require email field for submission', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).first().click();
    const dialog = page.getByRole('dialog');

    // Try to submit with just password
    await dialog.getByRole('textbox', { name: 'Password' }).fill('testpassword');
    await dialog.getByRole('button', { name: 'Sign In' }).click();

    // Form should not submit (HTML5 validation) - dialog still visible
    await expect(dialog).toBeVisible();
  });

  test('should require password field for submission', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).first().click();
    const dialog = page.getByRole('dialog');

    // Try to submit with just email
    await dialog.getByRole('textbox', { name: 'Email' }).fill('test@example.com');
    await dialog.getByRole('button', { name: 'Sign In' }).click();

    // Form should not submit (HTML5 validation) - dialog still visible
    await expect(dialog).toBeVisible();
  });

  test('should show password minimum length hint on signup', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).first().click();
    const dialog = page.getByRole('dialog');

    await dialog.getByRole('button', { name: 'Sign up' }).click();

    await expect(dialog.getByText('Minimum 8 characters')).toBeVisible();
  });
});

test.describe('Auth Modal - Responsive', () => {
  test('should work on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.getByRole('button', { name: 'Sign In' }).first().click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('textbox', { name: 'Email' })).toBeVisible();
  });
});
