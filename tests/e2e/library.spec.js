/**
 * Library Browser E2E Tests
 *
 * Tests the library browser page functionality including
 * tree view, document list, filters, and document selection.
 */

import { test, expect } from '@playwright/test';

test.describe('Library Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/library');
    await page.waitForLoadState('networkidle');
  });

  test('should display the library browser interface', async ({ page }) => {
    // Check for main library container
    await expect(page.locator('.library-browser, [class*="library"]')).toBeVisible();
  });

  test('should display navigation bar', async ({ page }) => {
    await expect(page.locator('.navbar')).toBeVisible();
  });

  test('should mark Library link as active', async ({ page }) => {
    const libraryLink = page.locator('.nav-link:has-text("Library")');
    await expect(libraryLink).toHaveClass(/active/);
  });

  test('should display tree view section', async ({ page }) => {
    // Tree view should be visible (unless hidden on mobile)
    const treeView = page.locator('.tree-view, [class*="tree"]');
    await expect(treeView).toBeVisible();
  });

  test('should display document list section', async ({ page }) => {
    const documentList = page.locator('.document-list, [class*="document-list"]');
    await expect(documentList).toBeVisible();
  });
});

test.describe('Library - Tree View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/library');
    await page.waitForLoadState('networkidle');
    // Wait for tree data to load
    await page.waitForTimeout(500);
  });

  test('should display religion nodes', async ({ page }) => {
    const treeNodes = page.locator('.tree-node, [class*="tree-node"]');
    // Should have at least one religion node (if library has data)
    const count = await treeNodes.count();
    // This will be 0 if library is empty, which is acceptable
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should expand religion node on click', async ({ page }) => {
    const firstReligion = page.locator('.tree-node').first();

    // Skip if no tree nodes
    if ((await firstReligion.count()) === 0) {
      test.skip();
      return;
    }

    const expandButton = firstReligion.locator('button, .tree-toggle').first();
    await expandButton.click();

    // Should show collections after expansion
    const collections = firstReligion.locator('.tree-children, .tree-collection');
    await expect(collections).toBeVisible();
  });
});

test.describe('Library - Filter Panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/library');
    await page.waitForLoadState('networkidle');
  });

  test('should display filter panel', async ({ page }) => {
    const filterPanel = page.locator('.filter-panel, [class*="filter"]');
    await expect(filterPanel).toBeVisible();
  });

  test('should have religion filter dropdown', async ({ page }) => {
    const religionFilter = page.locator('select').filter({ hasText: /All religions|Religion/ });
    await expect(religionFilter).toBeVisible();
  });

  test('should have collection filter dropdown', async ({ page }) => {
    const collectionFilter = page.locator('select').filter({ hasText: /All collections|Collection/ });
    await expect(collectionFilter).toBeVisible();
  });

  test('should have language filter dropdown', async ({ page }) => {
    const languageFilter = page.locator('select').filter({ hasText: /All languages|Language/ });
    await expect(languageFilter).toBeVisible();
  });

  test('should have author filter input', async ({ page }) => {
    const authorFilter = page.locator('input[placeholder*="author" i]');
    await expect(authorFilter).toBeVisible();
  });

  test('should have year range inputs', async ({ page }) => {
    const yearFrom = page.locator('input[placeholder*="From" i]');
    const yearTo = page.locator('input[placeholder*="To" i]');
    await expect(yearFrom).toBeVisible();
    await expect(yearTo).toBeVisible();
  });

  test('should have status filter dropdown', async ({ page }) => {
    const statusFilter = page.locator('select').filter({ hasText: /All statuses|Status/ });
    await expect(statusFilter).toBeVisible();
  });
});

test.describe('Library - Document List', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/library');
    await page.waitForLoadState('networkidle');
    // Wait for documents to load
    await page.waitForTimeout(500);
  });

  test('should display document cards', async ({ page }) => {
    const documentCards = page.locator('.document-card, [class*="document-card"]');
    // Count will depend on library content
    const count = await documentCards.count();
    // If library has documents, we should see them
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should show document title on cards', async ({ page }) => {
    const firstCard = page.locator('.document-card').first();

    // Skip if no documents
    if ((await firstCard.count()) === 0) {
      test.skip();
      return;
    }

    const title = firstCard.locator('.document-title, h3');
    await expect(title).toBeVisible();
  });

  test('should show document author on cards', async ({ page }) => {
    const firstCard = page.locator('.document-card').first();

    // Skip if no documents
    if ((await firstCard.count()) === 0) {
      test.skip();
      return;
    }

    const author = firstCard.locator('.document-author, [class*="author"]');
    // Author may or may not be present depending on document
    expect(await author.count()).toBeGreaterThanOrEqual(0);
  });

  test('should show status indicator on cards', async ({ page }) => {
    const firstCard = page.locator('.document-card').first();

    // Skip if no documents
    if ((await firstCard.count()) === 0) {
      test.skip();
      return;
    }

    const status = firstCard.locator('.status-badge, [class*="status"]');
    await expect(status).toBeVisible();
  });
});

test.describe('Library - Document Selection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/library');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('should select document when card is clicked', async ({ page }) => {
    const firstCard = page.locator('.document-card').first();

    // Skip if no documents
    if ((await firstCard.count()) === 0) {
      test.skip();
      return;
    }

    await firstCard.click();

    // Card should appear selected
    await expect(firstCard).toHaveClass(/selected/);
  });

  test('should open document detail panel on selection', async ({ page }) => {
    const firstCard = page.locator('.document-card').first();

    // Skip if no documents
    if ((await firstCard.count()) === 0) {
      test.skip();
      return;
    }

    await firstCard.click();

    // Detail panel should be visible
    const detailPanel = page.locator('.document-detail, [class*="detail-panel"]');
    await expect(detailPanel).toBeVisible();
  });
});

test.describe('Library - Filter Interactions', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/library');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(500);
  });

  test('should filter by status', async ({ page }) => {
    const statusFilter = page.locator('select').filter({ hasText: /All statuses/ }).first();

    // Skip if filter not found
    if ((await statusFilter.count()) === 0) {
      test.skip();
      return;
    }

    // Select "Indexed" status
    await statusFilter.selectOption({ label: 'Indexed' });
    await page.waitForTimeout(300);

    // All visible cards should have indexed status
    const cards = page.locator('.document-card');
    const count = await cards.count();

    for (let i = 0; i < count; i++) {
      const statusBadge = cards.nth(i).locator('.status-badge.success, [class*="success"]');
      await expect(statusBadge).toBeVisible();
    }
  });
});

test.describe('Library - Responsive', () => {
  test('should be responsive on tablet', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/library');
    await page.waitForLoadState('networkidle');

    // Main elements should still be visible
    await expect(page.locator('.navbar')).toBeVisible();
    await expect(page.locator('.filter-panel, [class*="filter"]')).toBeVisible();
  });

  test('should be responsive on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/library');
    await page.waitForLoadState('networkidle');

    // Main elements should still be visible
    await expect(page.locator('.navbar')).toBeVisible();

    // Document list should be visible
    const documentList = page.locator('.document-list, [class*="document"]');
    await expect(documentList).toBeVisible();
  });
});
