/**
 * Authentication E2E Tests
 *
 * Tests the auth modal functionality.
 */

import { test, expect } from '@playwright/test';

test.describe('Auth Modal', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should open auth modal when clicking Sign In', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Modal should appear
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  });

  test('should show login form by default', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).click();

    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign In', exact: true })).toBeVisible();
  });

  test('should switch to signup form', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Click "Sign up" link
    await page.getByRole('button', { name: 'Sign up' }).click();

    // Should show signup form
    await expect(page.getByRole('heading', { name: 'Create Account' })).toBeVisible();
    await expect(page.getByLabel('Name')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
    await expect(page.getByLabel('Password')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Account' })).toBeVisible();
  });

  test('should switch back to login form', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.getByRole('button', { name: 'Sign up' }).click();

    // Click "Sign in" link
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page.getByRole('heading', { name: 'Welcome Back' })).toBeVisible();
  });

  test('should close modal when clicking X button', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click X button (SVG with X path)
    await page.locator('button:has(svg path[d*="M6 18L18 6"])').click();

    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should close modal when pressing Escape', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    await page.keyboard.press('Escape');

    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should close modal when clicking backdrop', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();

    // Click on the backdrop (the dark overlay, not the modal content)
    await page.locator('.fixed.inset-0').click({ position: { x: 10, y: 10 } });

    await expect(page.getByRole('dialog')).not.toBeVisible();
  });

  test('should require email field', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Try to submit with just password
    await page.getByLabel('Password').fill('testpassword');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();

    // Form should not submit (HTML5 validation)
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('should require password field', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).click();

    // Try to submit with just email
    await page.getByLabel('Email').fill('test@example.com');
    await page.getByRole('button', { name: 'Sign In', exact: true }).click();

    // Form should not submit (HTML5 validation)
    await expect(page.getByRole('dialog')).toBeVisible();
  });

  test('should show password minimum length hint on signup', async ({ page }) => {
    await page.getByRole('button', { name: 'Sign In' }).click();
    await page.getByRole('button', { name: 'Sign up' }).click();

    await expect(page.getByText('Minimum 8 characters')).toBeVisible();
  });
});

test.describe('Auth Modal - Responsive', () => {
  test('should work on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    await page.getByRole('button', { name: 'Sign In' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await expect(page.getByLabel('Email')).toBeVisible();
  });
});
