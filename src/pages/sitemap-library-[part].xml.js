// /sitemap-library-<part>.xml — one child of the library sitemap index: '<tradition>-<n>' (reader URLs with lastmod =
// updated_at) or 'collections' (tradition + collection pages). Data: GET /api/library/sitemap/:part; edge-cached as 'xml'.
import { urlsetXml } from '../lib/sitemap-xml.js';

export const prerender = false;
const API_BASE = import.meta.env.PUBLIC_API_URL || 'https://api.siftersearch.com';   // SSR fetch — absolute origin

export async function GET({ params }) {
  const part = String(params.part || '');
  if (!/^[a-z0-9-]+$/.test(part)) return new Response('not found', { status: 404 });
  try {
    const res = await fetch(`${API_BASE}/api/library/sitemap/${part}`);
    if (res.status === 404) return new Response('not found', { status: 404 });
    if (!res.ok) throw new Error(`api ${res.status}`);
    const { urls } = await res.json();
    if (!urls?.length) throw new Error('empty part');
    return new Response(urlsetXml(urls), {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
    });
  } catch (err) {
    console.error(`sitemap-library ${part}:`, err?.message || err);
    return new Response('sitemap temporarily unavailable', { status: 503, headers: { 'Retry-After': '600', 'Cache-Control': 'no-store' } });
  }
}
