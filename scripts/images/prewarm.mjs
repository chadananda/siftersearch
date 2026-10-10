#!/usr/bin/env node
// Pre-render every image size the public pages offer, so no visitor waits for a first render (Chad 10-10: "images are
// very slow to load"). Crawls the listing pages + the article pages they link, collects every siftersearch.com/img/ URL
// from src/srcset, and requests each once (Accept: webp) — the service then has the variant in R2 for every edge.
//   node scripts/images/prewarm.mjs [--pages /research,/dialogue,/biography] [--concurrency 6]
const arg = (k, d) => (process.argv.includes(`--${k}`) ? process.argv[process.argv.indexOf(`--${k}`) + 1] : d);
const ORIGIN = 'https://siftersearch.com';
const LISTS = arg('pages', '/research,/dialogue').split(',');
const CONC = Number(arg('concurrency', 6));

const html = async (path) => { try { const r = await fetch(ORIGIN + path); return r.ok ? await r.text() : ''; } catch { return ''; } };
const imgs = (h) => [...h.matchAll(/https:\/\/siftersearch\.com\/img\/[^"'\s,)]+/g)].map((m) => m[0].replace(/&amp;/g, '&'));

const pages = new Set(LISTS);
for (const list of LISTS) {
  const h = await html(list);
  for (const m of h.matchAll(new RegExp(`href="(${list}/[a-z0-9-]+)"`, 'g'))) pages.add(m[1]);
}
const urls = new Set();
for (const p of pages) for (const u of imgs(await html(p))) urls.add(u);
console.log(JSON.stringify({ pages: pages.size, images: urls.size }));

const tally = { miss: 0, r2: 0, edge: 0, error: 0 };
const queue = [...urls];
const t0 = Date.now();
await Promise.all(Array.from({ length: CONC }, async () => {
  while (queue.length) {
    const u = queue.shift();
    try {
      const r = await fetch(u, { headers: { Accept: 'image/webp,*/*' } });
      await r.arrayBuffer();
      tally[r.ok ? (r.headers.get('x-img-cache') || 'miss') : 'error']++;
    } catch { tally.error++; }
  }
}));
console.log(JSON.stringify({ ...tally, seconds: Math.round((Date.now() - t0) / 1000) }));
