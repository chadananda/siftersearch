/**
 * Visual Regression Test - Capture Screenshots of All Pages
 *
 * This script captures screenshots of every page in the SifterSearch application
 * for visual regression testing. Screenshots are saved to test-results/screenshots/
 *
 * Run: node tests/visual/capture-all-pages.js
 */

import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.UI_URL || 'https://siftersearch.com';
const SCREENSHOT_DIR = 'test-results/screenshots';

// All pages to capture
const PAGES = [
  // Public pages
  { path: '/', name: 'home' },
  { path: '/about', name: 'about' },
  { path: '/library', name: 'library' },
  { path: '/docs', name: 'docs-index' },
  { path: '/docs/api', name: 'docs-api' },
  { path: '/docs/library', name: 'docs-library' },
  { path: '/docs/agents', name: 'docs-agents' },
  { path: '/support', name: 'support' },
  { path: '/contribute', name: 'contribute' },

  // Library navigation (sample paths)
  { path: '/library/bahai', name: 'library-bahai' },
  { path: '/library/bahai/bahaullah', name: 'library-bahai-bahaullah' },
  { path: '/library/bahai/shoghi-effendi', name: 'library-bahai-shoghi' },
  { path: '/library/islam', name: 'library-islam' },
  { path: '/library/christianity', name: 'library-christianity' },
  { path: '/library/judaism', name: 'library-judaism' },
  { path: '/library/buddhism', name: 'library-buddhism' },
  { path: '/library/hinduism', name: 'library-hinduism' },
];

// Interactive states to capture
const INTERACTIVE_STATES = [
  {
    name: 'quick-search-results',
    setup: async (page) => {
      await page.goto(BASE_URL);
      await page.waitForSelector('input#search-input');
      // Enable quick search
      const btn = page.locator('.lightning-btn');
      while (!(await btn.evaluate(el => el.classList.contains('active')))) {
        await btn.click();
        await page.waitForTimeout(200);
      }
      // Search
      await page.fill('input#search-input', 'prayer');
      await page.waitForTimeout(2000);
      await page.waitForSelector('.source-card');
    }
  },
  {
    name: 'quick-search-highlighted',
    setup: async (page) => {
      await page.goto(BASE_URL);
      await page.waitForSelector('input#search-input');
      const btn = page.locator('.lightning-btn');
      while (!(await btn.evaluate(el => el.classList.contains('active')))) {
        await btn.click();
        await page.waitForTimeout(200);
      }
      await page.fill('input#search-input', 'divine unity');
      await page.waitForTimeout(2000);
      await page.waitForSelector('.source-card');
    }
  },
  {
    name: 'document-reader',
    setup: async (page) => {
      await page.goto(BASE_URL);
      await page.waitForSelector('input#search-input');
      const btn = page.locator('.lightning-btn');
      while (!(await btn.evaluate(el => el.classList.contains('active')))) {
        await btn.click();
        await page.waitForTimeout(200);
      }
      await page.fill('input#search-input', 'prayer');
      await page.waitForTimeout(2000);
      await page.waitForSelector('.source-card');
      // Click Read More
      await page.click('.read-more-btn');
      await page.waitForTimeout(1000);
    }
  }
];

// Viewport sizes for responsive testing
const VIEWPORTS = [
  { width: 1920, height: 1080, name: 'desktop' },
  { width: 768, height: 1024, name: 'tablet' },
  { width: 375, height: 812, name: 'mobile' },
];

async function captureScreenshots() {
  // Ensure screenshot directory exists
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const results = { passed: [], failed: [], skipped: [] };

  console.log('\\n=== Visual Regression Test ===\\n');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Screenshot Dir: ${SCREENSHOT_DIR}\\n`);

  // Test each viewport size
  for (const viewport of VIEWPORTS) {
    console.log(`\\n--- Viewport: ${viewport.name} (${viewport.width}x${viewport.height}) ---\\n`);

    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      deviceScaleFactor: 2, // Retina quality
    });
    const page = await context.newPage();

    // Capture static pages
    for (const pageInfo of PAGES) {
      const screenshotName = `${viewport.name}-${pageInfo.name}.png`;
      const screenshotPath = path.join(SCREENSHOT_DIR, screenshotName);

      try {
        console.log(`  Capturing: ${pageInfo.path}`);
        await page.goto(`${BASE_URL}${pageInfo.path}`, {
          waitUntil: 'domcontentloaded',
          timeout: 30000
        });
        await page.waitForTimeout(1000); // Let page settle

        // Check for errors
        const errorCount = await page.locator('.error-overlay, .crash-screen').count();
        if (errorCount > 0) {
          throw new Error('Page shows error overlay');
        }

        await page.screenshot({ path: screenshotPath, fullPage: true });
        results.passed.push({ page: pageInfo.path, viewport: viewport.name, screenshot: screenshotName });
        console.log(`    ✓ Saved: ${screenshotName}`);
      } catch (err) {
        results.failed.push({ page: pageInfo.path, viewport: viewport.name, error: err.message });
        console.log(`    ✗ Failed: ${err.message}`);

        // Still try to capture error state
        try {
          await page.screenshot({ path: `${SCREENSHOT_DIR}/error-${screenshotName}`, fullPage: true });
        } catch { /* ignore screenshot errors */ }
      }
    }

    // Capture interactive states (only on desktop)
    if (viewport.name === 'desktop') {
      console.log('\\n  Interactive States:\\n');

      for (const state of INTERACTIVE_STATES) {
        const screenshotName = `${viewport.name}-${state.name}.png`;
        const screenshotPath = path.join(SCREENSHOT_DIR, screenshotName);

        try {
          console.log(`  Setting up: ${state.name}`);
          await state.setup(page);
          await page.screenshot({ path: screenshotPath, fullPage: false }); // Viewport only
          results.passed.push({ page: state.name, viewport: viewport.name, screenshot: screenshotName });
          console.log(`    ✓ Saved: ${screenshotName}`);
        } catch (err) {
          results.failed.push({ page: state.name, viewport: viewport.name, error: err.message });
          console.log(`    ✗ Failed: ${err.message}`);
        }
      }
    }

    await context.close();
  }

  await browser.close();

  // Summary
  console.log('\\n=== Summary ===\\n');
  console.log(`Passed: ${results.passed.length}`);
  console.log(`Failed: ${results.failed.length}`);
  console.log(`Screenshots saved to: ${SCREENSHOT_DIR}\\n`);

  if (results.failed.length > 0) {
    console.log('Failed captures:');
    results.failed.forEach(f => {
      console.log(`  - ${f.page} (${f.viewport}): ${f.error}`);
    });
    console.log('');
  }

  // Save results JSON
  fs.writeFileSync(
    path.join(SCREENSHOT_DIR, 'results.json'),
    JSON.stringify(results, null, 2)
  );

  return results;
}

// Link checker
async function checkAllLinks() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  const checkedLinks = new Set();
  const brokenLinks = [];
  const workingLinks = [];

  console.log('\\n=== Link Checker ===\\n');

  // Start from home and check all links
  const pagesToCheck = ['/'];
  const pageLinks = {};

  while (pagesToCheck.length > 0) {
    const currentPath = pagesToCheck.shift();
    if (checkedLinks.has(currentPath)) continue;
    checkedLinks.add(currentPath);

    try {
      const response = await page.goto(`${BASE_URL}${currentPath}`, {
        waitUntil: 'domcontentloaded',
        timeout: 15000
      });

      if (!response || response.status() >= 400) {
        brokenLinks.push({ path: currentPath, status: response?.status() || 'no response' });
        continue;
      }

      workingLinks.push({ path: currentPath, status: response.status() });

      // Find all links on this page
      const links = await page.locator('a[href]').all();
      pageLinks[currentPath] = [];

      for (const link of links) {
        const href = await link.getAttribute('href');
        if (!href) continue;

        // Skip external links, anchors, javascript
        if (href.startsWith('http') && !href.startsWith(BASE_URL)) continue;
        if (href.startsWith('#') || href.startsWith('javascript:') || href.startsWith('mailto:')) continue;

        const normalizedPath = href.startsWith('/') ? href : `/${href}`;
        const pathOnly = normalizedPath.split('?')[0].split('#')[0];

        if (!checkedLinks.has(pathOnly) && !pagesToCheck.includes(pathOnly)) {
          // Only check pages within our site structure
          if (pathOnly.startsWith('/library/') || pathOnly.startsWith('/docs/') ||
              pathOnly.startsWith('/admin/') || pathOnly.startsWith('/community/') ||
              ['/', '/about', '/support', '/contribute', '/profile', '/settings', '/referrals'].includes(pathOnly)) {
            pagesToCheck.push(pathOnly);
            pageLinks[currentPath].push(pathOnly);
          }
        }
      }

      console.log(`  Checked: ${currentPath} (${pageLinks[currentPath].length} internal links)`);

      // Limit to avoid infinite crawl
      if (checkedLinks.size > 100) {
        console.log('  Stopping at 100 pages...');
        break;
      }
    } catch (err) {
      brokenLinks.push({ path: currentPath, error: err.message });
      console.log(`  Error: ${currentPath} - ${err.message}`);
    }
  }

  await browser.close();

  console.log('\\n=== Link Check Summary ===\\n');
  console.log(`Pages checked: ${checkedLinks.size}`);
  console.log(`Working: ${workingLinks.length}`);
  console.log(`Broken: ${brokenLinks.length}`);

  if (brokenLinks.length > 0) {
    console.log('\\nBroken links:');
    brokenLinks.forEach(l => {
      console.log(`  - ${l.path}: ${l.status || l.error}`);
    });
  }

  return { working: workingLinks, broken: brokenLinks };
}

// Main execution
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--links')) {
    await checkAllLinks();
  } else if (args.includes('--screenshots')) {
    await captureScreenshots();
  } else {
    // Run both
    await captureScreenshots();
    await checkAllLinks();
  }
}

main().catch(console.error);
