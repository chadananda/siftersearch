// Dynamic Dialogue sitemap. Listed in the main sitemap-index alongside
// sitemap-0.xml and sitemap-library.xml. Includes only published dialogs +
// the dialogue index, assessment, RSS, category, and tag pages that have
// real content (≥1 published article).
//
// Prerendered at build time so the file lands as a static asset.

import { getCollection } from 'astro:content';

/* global Response */

export const prerender = true;

const SITE = 'https://siftersearch.com';

export async function GET() {
  const all = await getCollection('dialogs');
  const published = all.filter(d => d.data.published === true);

  const urls = [];

  // Dialogue hub pages — only emit if there's anything to point at
  if (published.length > 0) {
    urls.push({ loc: `${SITE}/dialogue/`, priority: 0.9, changefreq: 'weekly' });
    urls.push({ loc: `${SITE}/dialogue/assessment/`, priority: 0.5, changefreq: 'monthly' });
    urls.push({ loc: `${SITE}/dialogue/rss.xml`, priority: 0.4, changefreq: 'weekly' });
  }

  // Per-dialog pages — only published
  for (const d of published) {
    const slug = d.id.replace(/\.md$/, '');
    const lastmod = (d.data.updatedAt ?? d.data.publishedAt).toISOString().split('T')[0];
    urls.push({
      loc: `${SITE}/dialogue/${slug}/`,
      lastmod,
      priority: 0.8,
      changefreq: 'monthly',
    });
  }

  // Topic and tag landing pages — only emit when ≥1 published article uses them
  const topics = new Set(published.map(d => d.data.topic));
  for (const t of topics) {
    urls.push({ loc: `${SITE}/dialogue/category/${encodeURIComponent(t)}/`, priority: 0.6, changefreq: 'monthly' });
  }

  const tagCounts = new Map();
  for (const d of published) {
    for (const tag of d.data.tags) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
  }
  for (const [tag, count] of tagCounts) {
    if (count >= 2) {
      urls.push({ loc: `${SITE}/dialogue/tag/${encodeURIComponent(tag)}/`, priority: 0.5, changefreq: 'monthly' });
    }
  }

  const body = urls.map(u => {
    const lastmodLine = u.lastmod ? `\n    <lastmod>${u.lastmod}</lastmod>` : '';
    return `  <url>
    <loc>${u.loc}</loc>${lastmodLine}
    <changefreq>${u.changefreq}</changefreq>
    <priority>${u.priority}</priority>
  </url>`;
  }).join('\n');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>`;

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
