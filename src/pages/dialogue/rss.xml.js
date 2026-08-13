// Dialogue RSS 2.0 feed. sitemap-dialogue.xml has advertised /dialogue/rss.xml since April, but the route
// never existed (302'd) — a feed URL in a sitemap that doesn't resolve is worse than no feed. Same two
// sources and merge rule as the sitemap: the markdown collection is authoritative for slugs that have a
// file, API-published conversations fill in the rest. SSR + edge cache, so a newly published dialog appears
// without a rebuild.

/* global Response */

export const prerender = false;

const SITE = 'https://siftersearch.com';
const API_BASE = import.meta.env.PUBLIC_API_URL || 'https://api.siftersearch.com';
const MAX_ITEMS = 50;

const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

// RFC-822 is what RSS readers expect; an ISO date makes some of them drop the item silently.
function rfc822(value) {
  const d = value ? new Date(String(value).replace(' ', 'T') + (String(value).includes('Z') ? '' : 'Z')) : new Date();
  return (isNaN(d.getTime()) ? new Date() : d).toUTCString();
}

export async function GET() {
  const items = [];

  try {
    const { getCollection } = await import('astro:content');
    for (const d of (await getCollection('dialogs')).filter((x) => x.data.published === true)) {
      items.push({
        slug: d.id.replace(/\.md$/, ''),
        title: d.data.title || d.data.question || d.id,
        description: d.data.description || d.data.excerpt || '',
        date: d.data.publishedAt || d.data.published_at || d.data.date,
        topic: d.data.topic,
      });
    }
  } catch { /* collection unavailable → API-only feed */ }

  try {
    const res = await fetch(`${API_BASE}/api/v1/conversations?tenant=siftersearch&limit=${MAX_ITEMS * 2}`,
      { headers: { Accept: 'application/json' } });
    if (res.ok) {
      const seen = new Set(items.map((i) => i.slug));
      for (const c of ((await res.json()).conversations || [])) {
        if (!c.slug || seen.has(c.slug)) continue;      // collection wins on a slug collision
        items.push({
          slug: c.slug,
          title: c.title || c.question || c.slug,
          description: c.description || c.excerpt || '',
          date: c.published_at || c.updated_at,
          topic: c.topic,
        });
      }
    }
  } catch { /* feed stays collection-only rather than erroring */ }

  items.sort((a, b) => new Date(rfc822(b.date)) - new Date(rfc822(a.date)));
  const latest = items.slice(0, MAX_ITEMS);

  const body = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>SifterSearch — Dialogue</title>
    <link>${SITE}/dialogue/</link>
    <description>Questions explored against the sources: sacred texts, histories and scholarship, cited so you can check them.</description>
    <language>en</language>
    <lastBuildDate>${rfc822(latest[0]?.date)}</lastBuildDate>
    <atom:link href="${SITE}/dialogue/rss.xml" rel="self" type="application/rss+xml" />
${latest.map((i) => `    <item>
      <title>${esc(i.title)}</title>
      <link>${SITE}/dialogue/${esc(i.slug)}/</link>
      <guid isPermaLink="true">${SITE}/dialogue/${esc(i.slug)}/</guid>
      <pubDate>${rfc822(i.date)}</pubDate>${i.topic ? `\n      <category>${esc(i.topic)}</category>` : ''}
      <description>${esc(i.description)}</description>
    </item>`).join('\n')}
  </channel>
</rss>`;

  return new Response(body, {
    headers: {
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': 'public, max-age=600, s-maxage=3600',
    },
  });
}
