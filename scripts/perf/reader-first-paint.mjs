// Reader first-paint audit (Chad 10-23 FOUC). Live site, headless Chromium: TTFB/FCP/LCP/CLS, is document text styled AT
// first paint, when text appears, and how many CSS/JS requests hit the network on a warm (same-context) reload.
// Usage: node scripts/perf/reader-first-paint.mjs [outDir] [--base=https://siftersearch.com] [--label=before]
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const outDir = args.find((a) => !a.startsWith('--')) || 'tmp/reader-perf';
const base = (args.find((a) => a.startsWith('--base=')) || '--base=https://siftersearch.com').slice(7);
const label = (args.find((a) => a.startsWith('--label=')) || '--label=run').slice(8);
mkdirSync(outDir, { recursive: true });

const PAGES = {
  iqan: '/library/bahai/bahaullah/bahaullah_the-kitab-i-iqan',
  gleanings: '/library/bahai/bahaullah/gleanings-from-the-writings-of-bahaullah',
  mahabharata: '/library/hindu/epics/krishna-dwaipayana_the-mahabharata-of-krishna-dwaipayana-vyasa-volume-1-english-translation',
};
const PROFILES = {
  desktop: { viewport: { width: 1280, height: 900 } },
  phone: { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 },
};

// Runs in the page before any script: paint/LCP/CLS observers + DOM state at the moment FCP is reported.
const INIT = () => {
  const m = (window.__m = { cls: 0, lcp: 0, fcp: 0, textAt: 0, atFcp: null });
  const snap = () => {
    const c = document.querySelector('.presentation-container');
    const p = document.querySelector('.paragraph-text');
    const links = [...document.querySelectorAll('link[rel=stylesheet]')].filter((l) => l.media !== 'print');
    return {
      paragraphs: document.querySelectorAll('.paragraph-text').length,
      spinner: !!document.querySelector('.loading-state'),
      readerBg: c ? getComputedStyle(c).backgroundColor : null,
      paraFont: p ? getComputedStyle(p).fontFamily.split(',')[0] : null,
      sheetsLoaded: [...document.styleSheets].filter((s) => s.href && !/googleapis/.test(s.href)).length,
      sheetsLinked: links.filter((l) => !/googleapis/.test(l.href)).length,
    };
  };
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (e.name === 'first-contentful-paint') { m.fcp = e.startTime; m.atFcp = snap(); } }).observe({ type: 'paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) m.lcp = e.startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
  new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  const mo = new MutationObserver(() => { if (!m.textAt && document.querySelector('.paragraph-text')) { m.textAt = performance.now(); mo.disconnect(); } });
  document.addEventListener('readystatechange', () => { if (!m.textAt && document.querySelector('.paragraph-text')) m.textAt = performance.now(); }, { once: true });
  mo.observe(document, { childList: true, subtree: true });
};

async function load(context, name, path, tag) {
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  const net = { css: { network: 0, cache: 0 }, js: { network: 0, cache: 0 }, htmlCache: null };
  cdp.on('Network.responseReceived', ({ type, response }) => {
    const k = type === 'Stylesheet' ? 'css' : type === 'Script' ? 'js' : null;
    if (type === 'Document') net.htmlCache = response.headers['x-sifter-cache'] || response.headers['X-Sifter-Cache'] || null;
    if (!k || !/siftersearch|workers\.dev|localhost/.test(response.url)) return;
    net[k][response.fromDiskCache || response.fromMemoryCache || response.fromPrefetchCache ? 'cache' : 'network']++;
  });
  cdp.on('Network.requestServedFromCache', () => {});
  await page.addInitScript(INIT);
  await page.goto(base + path, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.__m?.fcp > 0, null, { polling: 'raf', timeout: 30000 }).catch(() => {});
  const shot = `${outDir}/${label}-${name}-${tag}-fcp.png`;
  await page.screenshot({ path: shot });
  await page.waitForLoadState('load');
  await page.waitForSelector('.paragraph-text', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(1500);
  const r = await page.evaluate(() => {
    const nav = performance.getEntriesByType('navigation')[0];
    return { ttfb: nav.responseStart, ...window.__m, paragraphsFinal: document.querySelectorAll('.paragraph-text').length };
  });
  await page.screenshot({ path: `${outDir}/${label}-${name}-${tag}-settled.png` });
  await page.close();
  return { ...r, net, shot };
}

const rows = [];
const browser = await chromium.launch();
for (const [prof, opts] of Object.entries(PROFILES)) {
  for (const [name, path] of Object.entries(PAGES)) {
    const context = await browser.newContext({ ...opts, colorScheme: 'dark' });
    const cold = await load(context, name, path, `${prof}-cold`);
    const warm = await load(context, name, path, `${prof}-warm`);
    for (const [tag, r] of [['cold', cold], ['warm', warm]]) {
      rows.push({ page: name, profile: prof, load: tag, ttfb: Math.round(r.ttfb), fcp: Math.round(r.fcp), lcp: Math.round(r.lcp),
        textAt: Math.round(r.textAt), cls: +r.cls.toFixed(3), parasAtFcp: r.atFcp?.paragraphs ?? null, spinnerAtFcp: r.atFcp?.spinner ?? null,
        readerBgAtFcp: r.atFcp?.readerBg, sheets: r.atFcp ? `${r.atFcp.sheetsLoaded}/${r.atFcp.sheetsLinked}` : null,
        cssNet: r.net.css.network, cssCache: r.net.css.cache, jsNet: r.net.js.network, jsCache: r.net.js.cache, edge: r.net.htmlCache, shot: r.shot });
    }
    await context.close();
  }
}
// Theme check: the reader in light and dark OS schemes (the site pins data-theme=dark; the reader page is always light).
for (const scheme of ['light', 'dark']) for (const [prof, opts] of Object.entries(PROFILES)) {
  const context = await browser.newContext({ ...opts, colorScheme: scheme });
  const page = await context.newPage();
  await page.goto(base + PAGES.iqan, { waitUntil: 'networkidle' }).catch(() => {});
  await page.screenshot({ path: `${outDir}/${label}-theme-${scheme}-${prof}.png` });
  await context.close();
}
await browser.close();
writeFileSync(`${outDir}/${label}.json`, JSON.stringify(rows, null, 2));
console.table(rows.map(({ shot, ...r }) => r));
