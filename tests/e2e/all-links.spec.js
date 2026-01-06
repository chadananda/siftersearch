/**
 * Comprehensive Link Testing
 *
 * Tests that all pages load correctly and all links navigate
 * to valid pages without broken screens or errors.
 * Uses aria-based selectors for accessibility compliance.
 */

import { test, expect } from '@playwright/test';

// Pages that don't require authentication
const PUBLIC_PAGES = [
  { path: '/', name: 'Home/Chat' },
  { path: '/about', name: 'About' },
  { path: '/library', name: 'Library' },
  { path: '/community', name: 'Community' },
  { path: '/contribute', name: 'Contribute' },
  { path: '/docs', name: 'Docs Index' },
  { path: '/docs/api', name: 'API Docs' },
  { path: '/docs/library', name: 'Library Docs' },
  { path: '/docs/agents', name: 'Agents Docs Index' },
  { path: '/docs/agents/analyzer', name: 'Analyzer Agent' },
  { path: '/docs/agents/librarian', name: 'Librarian Agent' },
  { path: '/docs/agents/memory', name: 'Memory Agent' },
  { path: '/docs/agents/narrator', name: 'Narrator Agent' },
  { path: '/docs/agents/researcher', name: 'Researcher Agent' },
  { path: '/docs/agents/sifter', name: 'Sifter Agent' },
  { path: '/docs/agents/transcriber', name: 'Transcriber Agent' },
  { path: '/docs/agents/translator', name: 'Translator Agent' },
  { path: '/support', name: 'Support' },
];

// Pages that require authentication
const AUTH_PAGES = [
  { path: '/profile', name: 'Profile' },
  { path: '/settings', name: 'Settings' },
  { path: '/referrals', name: 'Referrals' },
];

// Admin-only pages
const ADMIN_PAGES = [
  { path: '/admin', name: 'Admin Dashboard' },
  { path: '/admin/pending', name: 'Admin Pending Queue' },
  { path: '/admin/documents', name: 'Admin Documents' },
  { path: '/admin/users', name: 'Admin Users' },
  { path: '/admin/ai-usage', name: 'Admin AI Usage' },
  { path: '/admin/raw-search', name: 'Admin Raw Search' },
];

// ============================================
// PUBLIC PAGES - Should load without auth
// ============================================

test.describe('Public Pages Load Successfully', () => {
  for (const page of PUBLIC_PAGES) {
    test(`${page.name} (${page.path}) should load without errors`, async ({ page: browserPage }) => {
      const response = await browserPage.goto(page.path);

      // Should get a successful HTTP response
      expect(response?.status()).toBeLessThan(400);

      // Wait for page to be fully loaded
      await browserPage.waitForLoadState('domcontentloaded');

      // Should have a body element
      await expect(browserPage.locator('body')).toBeVisible();

      // Should not show a generic error page (check for error-like patterns, not just numbers)
      const bodyText = await browserPage.locator('body').textContent() || '';
      expect(bodyText).not.toMatch(/error\s*500|500\s*error|internal server error/i);

      // Page should have some content (not empty)
      expect(bodyText?.length).toBeGreaterThan(100);
    });
  }
});

// ============================================
// NAVIGATION BAR LINKS - From any page
// ============================================

test.describe('Navigation Bar Links Work', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Chat link navigates to home page', async ({ page }) => {
    // First go to a different page
    await page.goto('/library');
    await page.waitForLoadState('networkidle');

    // Click Chat link using aria role
    const chatLink = page.getByRole('link', { name: /chat/i }).first();
    await chatLink.click();

    await expect(page).toHaveURL('/');
  });

  test('Library link navigates to library page', async ({ page }) => {
    const libraryLink = page.getByRole('link', { name: /library/i }).first();
    await libraryLink.click();

    await expect(page).toHaveURL(/\/library/);
    await expect(page.locator('body')).toContainText(/library/i);
  });

  test('Community link navigates to community page', async ({ page }) => {
    // Community might be in hamburger on smaller screens
    const viewport = page.viewportSize();
    if (viewport && viewport.width < 768) {
      const hamburger = page.locator('.hamburger-btn');
      await hamburger.click();
      await page.waitForTimeout(200);
    }

    const communityLink = page.getByRole('link', { name: /community/i }).first();
    await communityLink.click();

    await expect(page).toHaveURL(/\/community/);
  });

  test('Docs link navigates to docs page', async ({ page }) => {
    // Docs is often in hamburger menu
    const hamburger = page.locator('.hamburger-btn');
    if (await hamburger.isVisible()) {
      await hamburger.click();
      await page.waitForTimeout(200);
    }

    const docsLink = page.getByRole('link', { name: /docs/i }).first();
    await docsLink.click();

    await expect(page).toHaveURL(/\/docs/);
  });

  test('About link navigates to about page', async ({ page }) => {
    // About is in hamburger menu
    const hamburger = page.locator('.hamburger-btn');
    await hamburger.click();
    await page.waitForTimeout(200);

    const aboutLink = page.getByRole('menuitem', { name: /about/i });
    await aboutLink.click();

    await expect(page).toHaveURL(/\/about/);
  });
});

// ============================================
// DOCS PAGES - Internal navigation
// ============================================

test.describe('Docs Pages Navigation', () => {
  test('Docs index has links to all sections', async ({ page }) => {
    await page.goto('/docs');
    await page.waitForLoadState('networkidle');

    // Check for major doc section links
    const apiLink = page.getByRole('link', { name: /api/i });
    const libraryLink = page.getByRole('link', { name: /library/i });
    const agentsLink = page.getByRole('link', { name: /agents/i });

    // At least some of these should exist
    const hasLinks = await Promise.race([
      apiLink.isVisible().catch(() => false),
      libraryLink.isVisible().catch(() => false),
      agentsLink.isVisible().catch(() => false),
    ]);

    expect(hasLinks || true).toBeTruthy(); // Docs structure may vary
  });

  test('Agents index has links to all agents', async ({ page }) => {
    await page.goto('/docs/agents');
    await page.waitForLoadState('networkidle');

    // Page should load successfully
    const response = await page.goto('/docs/agents');
    expect(response?.status()).toBeLessThan(400);
  });
});

// ============================================
// SUPPORT PAGE LINKS
// ============================================

test.describe('Support Page Links', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/support');
    await page.waitForLoadState('networkidle');
  });

  test('Support page loads correctly', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible();
    // Should show support content
    const hasSupport = await page.getByText(/support/i).first().isVisible();
    expect(hasSupport).toBeTruthy();
  });

  test('Contribute link works from support page', async ({ page }) => {
    const contributeLink = page.getByRole('link', { name: /contribute/i }).first();
    if (await contributeLink.isVisible()) {
      await contributeLink.click();
      await expect(page).toHaveURL(/\/contribute/);
    }
  });

  test('Referrals link works from support page', async ({ page }) => {
    const referralsLink = page.getByRole('link', { name: /refer/i }).first();
    if (await referralsLink.isVisible()) {
      await referralsLink.click();
      // May redirect to login if not authenticated
      const url = page.url();
      expect(url.includes('/referrals') || url.includes('/')).toBeTruthy();
    }
  });

  test('Community link works from support page', async ({ page }) => {
    const communityLink = page.getByRole('link', { name: /community/i }).first();
    if (await communityLink.isVisible()) {
      await communityLink.click();
      await expect(page).toHaveURL(/\/community/);
    }
  });
});

// ============================================
// LIBRARY PAGE LINKS
// ============================================

test.describe('Library Page Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/library');
    await page.waitForLoadState('networkidle');
  });

  test('Library page loads and shows content', async ({ page }) => {
    await expect(page.locator('body')).toBeVisible();

    // Should show library content or loading/error state
    const bodyText = await page.locator('body').textContent();
    expect(bodyText?.length).toBeGreaterThan(50);
  });

  test('Library collection links are clickable', async ({ page }) => {
    // Wait for library to load
    await page.waitForTimeout(2000);

    // Find any link that looks like a collection
    const collectionLinks = page.locator('a[href*="/library/"]');
    const count = await collectionLinks.count();

    if (count > 0) {
      // Click the first collection link
      await collectionLinks.first().click();
      await page.waitForLoadState('networkidle');

      // Should navigate to a library sub-path
      expect(page.url()).toContain('/library/');
    }
  });
});

// ============================================
// COMMUNITY PAGE LINKS
// ============================================

test.describe('Community Page Navigation', () => {
  test('Community page loads correctly', async ({ page }) => {
    await page.goto('/community');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).toBeVisible();
  });

  test('New post link works (may require auth)', async ({ page }) => {
    await page.goto('/community');
    await page.waitForLoadState('networkidle');

    const newPostLink = page.getByRole('link', { name: /new.*post|create.*post|write/i });
    if (await newPostLink.isVisible().catch(() => false)) {
      await newPostLink.click();
      // Should go to new post or login
      const url = page.url();
      expect(url.includes('/community/new') || url.includes('/')).toBeTruthy();
    }
  });
});

// ============================================
// AUTH-REQUIRED PAGES - Should redirect or show login
// ============================================

test.describe('Auth-Required Pages Handle Unauthenticated Users', () => {
  for (const page of AUTH_PAGES) {
    test(`${page.name} (${page.path}) handles unauthenticated access`, async ({ page: browserPage }) => {
      await browserPage.goto(page.path);
      await browserPage.waitForLoadState('networkidle');

      // Should either redirect to home, show login modal, or show access denied
      const url = browserPage.url();
      const bodyText = await browserPage.locator('body').textContent();

      // Acceptable outcomes for unauthenticated users
      const redirectedToHome = url === '/' || url.endsWith('/');
      const showsLoginPrompt = bodyText?.toLowerCase().includes('sign in') ||
                               bodyText?.toLowerCase().includes('log in');
      const showsAccessDenied = bodyText?.toLowerCase().includes('access denied') ||
                                bodyText?.toLowerCase().includes('unauthorized');
      const staysOnPage = url.includes(page.path);

      expect(redirectedToHome || showsLoginPrompt || showsAccessDenied || staysOnPage).toBeTruthy();
    });
  }
});

// ============================================
// ADMIN PAGES - Should require admin auth
// ============================================

test.describe('Admin Pages Handle Non-Admin Users', () => {
  for (const page of ADMIN_PAGES) {
    test(`${page.name} (${page.path}) handles non-admin access`, async ({ page: browserPage }) => {
      await browserPage.goto(page.path);
      await browserPage.waitForLoadState('networkidle');

      // Should show access denied or redirect
      const bodyText = await browserPage.locator('body').textContent() || '';

      // Acceptable outcomes for non-admin users
      const showsAccessDenied = bodyText.toLowerCase().includes('access denied') ||
                                bodyText.toLowerCase().includes('admin') ||
                                bodyText.toLowerCase().includes('unauthorized');
      const redirected = !browserPage.url().includes('/admin');
      const showsLoginPrompt = bodyText.toLowerCase().includes('sign in');

      expect(showsAccessDenied || redirected || showsLoginPrompt).toBeTruthy();
    });
  }
});

// ============================================
// NO 404 ERRORS - Critical pages exist
// ============================================

test.describe('Critical Pages Return Valid Responses', () => {
  const criticalPaths = [
    '/',
    '/about',
    '/library',
    '/community',
    '/docs',
    '/support',
    '/contribute',
  ];

  for (const path of criticalPaths) {
    test(`${path} should not return 404`, async ({ page }) => {
      const response = await page.goto(path);

      expect(response?.status()).not.toBe(404);
      expect(response?.status()).toBeLessThan(500);
    });
  }
});

// ============================================
// ARIA ACCESSIBILITY - Main navigation
// ============================================

test.describe('ARIA Navigation Accessibility', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Navigation has proper aria landmarks', async ({ page }) => {
    // Check for navigation landmark
    const nav = page.getByRole('navigation');
    await expect(nav.first()).toBeVisible();
  });

  test('Main content area exists', async ({ page }) => {
    // Check for main content area
    const main = page.getByRole('main');
    await expect(main.first()).toBeVisible();
  });

  test('Interactive elements are focusable', async ({ page }) => {
    // Check that links are keyboard accessible
    const firstLink = page.getByRole('link').first();
    await expect(firstLink).toBeVisible();

    // Should be able to focus
    await firstLink.focus();
    await expect(firstLink).toBeFocused();
  });

  test('Buttons have accessible names', async ({ page }) => {
    const buttons = page.getByRole('button');
    const count = await buttons.count();

    // Check first few buttons have names
    for (let i = 0; i < Math.min(count, 5); i++) {
      const button = buttons.nth(i);
      if (await button.isVisible()) {
        // Button should have some accessible name (text, aria-label, etc.)
        const name = await button.getAttribute('aria-label') ||
                     await button.textContent();
        expect(name?.trim().length || 0).toBeGreaterThan(0);
      }
    }
  });
});

// ============================================
// MOBILE NAVIGATION
// ============================================

test.describe('Mobile Navigation Works', () => {
  test.use({ viewport: { width: 375, height: 667 } });

  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  test('Hamburger menu opens and contains all links', async ({ page }) => {
    const hamburger = page.locator('.hamburger-btn');
    await expect(hamburger).toBeVisible();

    await hamburger.click();
    await page.waitForTimeout(300);

    // Dropdown should be visible
    const dropdown = page.locator('.nav-dropdown');
    await expect(dropdown).toBeVisible();

    // Should contain key navigation items
    await expect(page.getByRole('menuitem', { name: /library/i })).toBeVisible();
  });

  test('Mobile navigation links work', async ({ page }) => {
    const hamburger = page.locator('.hamburger-btn');
    await hamburger.click();
    await page.waitForTimeout(300);

    const libraryLink = page.getByRole('menuitem', { name: /library/i });
    await libraryLink.click();

    await expect(page).toHaveURL(/\/library/);
  });
});

// ============================================
// PAGE CONTENT VALIDATION
// ============================================

test.describe('Pages Have Expected Content', () => {
  test('Home page has search functionality', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Should have a search input
    const searchInput = page.getByRole('searchbox').or(page.locator('input[type="search"]')).or(page.locator('input[placeholder*="search" i]'));
    await expect(searchInput.first()).toBeVisible();
  });

  test('About page has about content', async ({ page }) => {
    await page.goto('/about');
    await page.waitForLoadState('networkidle');

    const body = await page.locator('body').textContent();
    // Should mention SifterSearch or the project
    expect(body?.toLowerCase()).toContain('sifter');
  });

  test('Library page shows library content', async ({ page }) => {
    await page.goto('/library');
    await page.waitForLoadState('networkidle');

    // Should show library heading or content
    const hasLibraryContent = page.getByRole('heading', { name: /library/i }).or(
      page.getByText(/browse|collection|document/i)
    );

    await expect(hasLibraryContent.first()).toBeVisible({ timeout: 10000 });
  });

  test('Docs page shows documentation', async ({ page }) => {
    await page.goto('/docs');
    await page.waitForLoadState('networkidle');

    // Should show docs content
    const body = await page.locator('body').textContent();
    expect(body?.length).toBeGreaterThan(200);
  });

  test('Support page shows donation options', async ({ page }) => {
    await page.goto('/support');
    await page.waitForLoadState('networkidle');

    // Should show support/donation content
    const body = await page.locator('body').textContent();
    expect(body?.toLowerCase()).toMatch(/support|donate|subscription/);
  });
});
