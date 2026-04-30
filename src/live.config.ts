// Live Content Collections — fetched from our admin API at request time.
// Astro 5 experimental flag (`experimental.liveContentCollections: true` in
// astro.config.mjs); becomes stable in Astro 6 with this same syntax.
//
// Each `getLiveEntry()` call hits the API; Cloudflare edge cache holds responses
// for 5 min (s-maxage=300) with stale-while-revalidate=86400 — origin sees ~1%
// of requests on hot pages. Editing a doc via the admin API → cache invalidates
// → next request fetches the new version → user sees the update.

import { defineLiveCollection, z } from 'astro:content';

const API_BASE = import.meta.env.PUBLIC_API_URL || 'https://api.siftersearch.com';

// Loader contract: Astro calls our loader with `{ entry, collection, filter }`.
// We translate that to an HTTP call against the content API. On error we
// return null so the page can render a 404 rather than crash.
async function fetchJson(url: string, init?: RequestInit) {
  try {
    const res = await fetch(url, init);
    if (!res.ok) return null;
    return await res.json();
  } catch (err) {
    console.error('live-content fetch failed', url, err);
    return null;
  }
}

const docs = defineLiveCollection({
  type: 'live',
  loader: {
    async loadEntry({ filter }) {
      const slug = filter?.slug;
      if (typeof slug !== 'string') return null;
      const data = await fetchJson(`${API_BASE}/api/v1/pages/${encodeURIComponent(slug)}`);
      if (!data?.doc) return null;
      return { id: data.doc.slug, data: data.doc };
    },
    async loadCollection({ filter }) {
      const qs = filter?.section ? `?section=${encodeURIComponent(filter.section)}` : '';
      const data = await fetchJson(`${API_BASE}/api/v1/pages${qs}`);
      if (!data?.docs) return [];
      return data.docs.map((d: any) => ({ id: d.slug, data: d }));
    }
  },
  schema: z.object({
    slug: z.string(),
    section: z.string().nullable().optional(),
    nav_label: z.string().nullable().optional(),
    sort_order: z.number().optional(),
    title: z.string(),
    description: z.string().nullable().optional(),
    body_html: z.string().optional(),
    layout: z.string().optional(),
    active_section: z.string().nullable().optional(),
    updated_at: z.string().optional()
  })
});

const conversations = defineLiveCollection({
  type: 'live',
  loader: {
    async loadEntry({ filter }) {
      const slug = filter?.slug;
      const tenant = filter?.tenant || 'siftersearch';
      if (typeof slug !== 'string') return null;
      const data = await fetchJson(
        `${API_BASE}/api/v1/conversations/${encodeURIComponent(tenant)}/${encodeURIComponent(slug)}`
      );
      if (!data?.conversation) return null;
      return { id: data.conversation.slug, data: data.conversation };
    }
  },
  schema: z.object({
    slug: z.string(),
    tenant_id: z.string(),
    title: z.string(),
    description: z.string().nullable().optional(),
    question: z.string(),
    topic: z.string().nullable().optional(),
    tags_json: z.string().nullable().optional(),
    keywords_json: z.string().nullable().optional(),
    excerpt: z.string().nullable().optional(),
    hero_image: z.string().nullable().optional(),
    rounds_json: z.string().nullable().optional(),
    body_html: z.string().nullable().optional(),
    published_at: z.string().optional(),
    updated_at: z.string().optional()
  })
});

export const collections = { docs, conversations };
