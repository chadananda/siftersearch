// Live SEO checks on the SSR HTML (no JS): exactly ONE <link rel="canonical"> per library page, and the library sitemap
// (an index of parts) actually lists URLs. Target: SITE_URL (default production). Run: npx playwright test seo-canonical
import { test, expect } from '@playwright/test';

const SITE = process.env.SITE_URL || 'https://siftersearch.com';
const canonicals = (html) => [...html.matchAll(/<link[^>]*rel=["']canonical["'][^>]*>/g)].map((m) => /href=["']([^"']+)/.exec(m[0])?.[1]);

test.describe('one canonical per page (SSR HTML)', () => {
  for (const [path, want] of [
    ['/library', '/library'],
    ['/library/jain', '/library/jain'],
    ['/library/jain/agamas/', '/library/jain/agamas'],            // trailing slash → one canonical without it
    ['/library/jain/agamas/akaranga-sutra-book-1', '/library/jain/agamas/tr-hermann-jacobi_akaranga-sutra-book-1'],   // alias → stored path
    ['/research', '/research'],
  ]) {
    test(path, async ({ request }) => {
      const html = await (await request.get(`${SITE}${path}?nocache=1`)).text();
      expect(canonicals(html)).toEqual([`https://siftersearch.com${want}`]);
      expect(html.match(/property=["']og:url["']/g) || []).toHaveLength(1);
    });
  }
});

test('the library sitemap index lists parts, and the parts list reader URLs', async ({ request }) => {
  const idx = await request.get(`${SITE}/sitemap-library.xml`);
  expect(idx.status()).toBe(200);
  const parts = [...(await idx.text()).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(parts.length).toBeGreaterThan(1);
  expect(parts.some((u) => /sitemap-library-collections\.xml$/.test(u))).toBe(true);
  const docPart = parts.find((u) => !/collections/.test(u));
  const x = await (await request.get(docPart.replace('https://siftersearch.com', SITE))).text();
  const urls = [...x.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  expect(urls.length).toBeGreaterThan(0);
  expect(urls.length).toBeLessThanOrEqual(50_000);
  expect(urls.every((u) => /^https:\/\/siftersearch\.com\/library\/[^/]+\/[^/]+\/[^/]+$/.test(u))).toBe(true);
  expect(await (await request.get(`${SITE}/robots.txt`)).text()).toContain('Sitemap: https://siftersearch.com/sitemap-library.xml');
});
