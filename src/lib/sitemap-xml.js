// Sitemap XML for the site's /sitemap-library*.xml endpoints (pure, worker-safe). Data: GET /api/library/sitemap[/:part]
// (api/lib/library/library-sitemap.js). Tests: tests/api/library-sitemap.test.js.
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
/** <urlset> for [[path, lastmod], …] (paths are encoded once: slugs are URL-safe, but a stray char must not break XML). */
export function urlsetXml(entries, site = 'https://siftersearch.com') {
  const urls = (entries || []).map(([p, lm]) => `<url><loc>${esc(site + encodeURI(p))}</loc>${lm ? `<lastmod>${lm}</lastmod>` : ''}</url>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`;
}
/** <sitemapindex> for the snapshot's index → /sitemap-library-<part>.xml. */
export function sitemapIndexXml(index, site = 'https://siftersearch.com') {
  const items = (index || []).map((p) => `<sitemap><loc>${esc(`${site}/sitemap-library-${p.part}.xml`)}</loc>${p.lastmod ? `<lastmod>${p.lastmod}</lastmod>` : ''}</sitemap>`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${items.join('\n')}\n</sitemapindex>\n`;
}
