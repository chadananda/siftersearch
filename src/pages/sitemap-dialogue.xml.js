// Dynamic Dialogue sitemap. Listed in the main sitemap-index alongside
// sitemap-0.xml and sitemap-library.xml. Includes:
//   1. Published dialogs from the content collection (built-in /dialogue/)
//   2. Dialogs persisted via POST /api/v1/chat/save (LOCAL mode for siftersearch tenant)
//   3. Hub pages (index, assessment, RSS), category and tag landing pages
//
// SSR — runs on each request so newly-saved conversations appear in the
// sitemap immediately, no rebuild needed. Edge-cached for an hour.

import { getCollection } from 'astro:content';

/* global Response, fetch */

export const prerender = false;

const SITE = 'https://siftersearch.com';
const API_BASE = import.meta.env.PUBLIC_API_URL || 'https://api.siftersearch.com';

export async function GET() {
  const all = await getCollection('dialogs');
  const collectionPublished = all.filter(d => d.data.published === true);

  // Fetch newly-saved conversations from the API. Tenant 'siftersearch'
  // means the dialogs we publish into our own /dialogue/ pool. Failure
  // here shouldn't break the sitemap — fall back to collection-only.
  let apiPublished = [];
  try {
    const res = await fetch(`${API_BASE}/api/v1/conversations?tenant=siftersearch&limit=500`, {
      headers: { Accept: 'application/json' }
    });
    if (res.ok) {
      const data = await res.json();
      apiPublished = (data.conversations || []).filter(c => !!c.slug);
    }
  } catch { /* sitemap stays static-collection-only */ }

  // Merge by slug (collection wins if slug collides — collection is the
  // authoritative source for /dialogue/ pages that have a markdown file).
  const seenSlugs = new Set(collectionPublished.map(d => d.id.replace(/\.md$/, '')));
  const apiOnly = apiPublished.filter(c => !seenSlugs.has(c.slug));
  const published = [
    ...collectionPublished.map(d => ({
      slug: d.id.replace(/\.md$/, ''),
      tags: d.data.tags || [],
      topic: d.data.topic,
      lastmod: (d.data.updatedAt ?? d.data.publishedAt).toISOString().split('T')[0]
    })),
    ...apiOnly.map(c => ({
      slug: c.slug,
      tags: c.tags || [],
      topic: c.topic,
      lastmod: c.updated_at?.split('T')[0] || c.published_at?.split('T')[0]
    }))
  ];

  const urls = [];

  // Dialogue hub pages — only emit if there's anything to point at
  if (published.length > 0) {
    urls.push({ loc: `${SITE}/dialogue/`, priority: 0.9, changefreq: 'weekly' });
    urls.push({ loc: `${SITE}/dialogue/assessment/`, priority: 0.5, changefreq: 'monthly' });
    urls.push({ loc: `${SITE}/dialogue/rss.xml`, priority: 0.4, changefreq: 'weekly' });
  }

  // Per-dialog pages
  for (const d of published) {
    urls.push({
      loc: `${SITE}/dialogue/${d.slug}/`,
      lastmod: d.lastmod,
      priority: 0.8,
      changefreq: 'monthly',
    });
  }

  // Topic and tag landing pages — only emit when ≥1 published article uses them
  const topics = new Set(published.map(d => d.topic).filter(Boolean));
  for (const t of topics) {
    urls.push({ loc: `${SITE}/dialogue/category/${encodeURIComponent(t)}/`, priority: 0.6, changefreq: 'monthly' });
  }

  const tagCounts = new Map();
  for (const d of published) {
    for (const tag of (d.tags || [])) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
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
