/**
 * About Page E2E Tests
 */

import { test, expect } from '@playwright/test';

test.describe('About Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/about');
  });

  test('should display page title and header', async ({ page }) => {
    await expect(page).toHaveTitle(/About.*SifterSearch/i);
    await expect(page.getByRole('heading', { level: 1, name: 'About SifterSearch' })).toBeVisible();
  });

  test('should display about this project section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'About This Project' })).toBeVisible();
    await expect(page.getByText('private project by Chad Jones')).toBeVisible();
  });

  test('should display features section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Features' })).toBeVisible();
    await expect(page.getByText('Hybrid Search').first()).toBeVisible();
    await expect(page.getByText('Multi-Tradition Library').first()).toBeVisible();
    await expect(page.getByText('Conversational Interface').first()).toBeVisible();
    await expect(page.getByText('Scholarly Sources').first()).toBeVisible();
  });

  test('should display technology section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Technology' })).toBeVisible();
    await expect(page.getByText('Semantic search')).toBeVisible();
    await expect(page.getByText('Keyword search')).toBeVisible();
    await expect(page.getByText('AI re-ranking')).toBeVisible();
  });

  test('should navigate back to home', async ({ page }) => {
    // Click the logo link to go back to home
    await page.locator('header a').first().click();
    await expect(page).toHaveURL('/');
  });

  test('should have working logo link to home', async ({ page }) => {
    await page.locator('header a').first().click();
    await expect(page).toHaveURL('/');
  });

  test('should display footer with copyright', async ({ page }) => {
    const currentYear = new Date().getFullYear();
    await expect(page.getByText(`${currentYear} Chad Jones`)).toBeVisible();
  });

  test('should display agentic architecture section', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Agentic Architecture' })).toBeVisible();
    await expect(page.getByText('multi-agent AI architecture')).toBeVisible();
  });

  test('should display agent cards', async ({ page }) => {
    // Scroll to ensure agent cards are visible
    await page.getByRole('heading', { name: 'Agentic Architecture' }).scrollIntoViewIfNeeded();

    await expect(page.getByRole('heading', { name: 'Sifter', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Researcher', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Analyzer', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Translator', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Narrator', exact: true })).toBeVisible();
  });
});

test.describe('About Page - Responsive', () => {
  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/about');

    await expect(page.getByRole('heading', { name: 'About SifterSearch' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'About This Project' })).toBeVisible();
  });

  test('should be responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/about');

    await expect(page.getByRole('heading', { name: 'Features' })).toBeVisible();
    // Features grid should show
    await expect(page.getByText('Hybrid Search').first()).toBeVisible();
  });
});
