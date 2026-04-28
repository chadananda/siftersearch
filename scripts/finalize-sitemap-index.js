// @astrojs/sitemap auto-generates sitemap-index.xml referencing only the
// urlset it produced (sitemap-0.xml). We have two additional sitemaps:
//   - sitemap-library.xml  (server-rendered, pulls from API at request time)
//   - sitemap-dialogue.xml (prerendered from the published dialog collection)
// Search engines find these via the index, so this script rewrites
// dist/sitemap-index.xml after `astro build` to reference all three.

import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITE = 'https://siftersearch.com';
const SITEMAPS = ['sitemap-0.xml', 'sitemap-library.xml', 'sitemap-dialogue.xml'];

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${SITEMAPS.map(s => `  <sitemap><loc>${SITE}/${s}</loc></sitemap>`).join('\n')}
</sitemapindex>
`;

const out = join(__dirname, '..', 'dist', 'sitemap-index.xml');
writeFileSync(out, xml);
console.log(`✓ sitemap-index.xml rewritten with ${SITEMAPS.length} sitemaps`);
