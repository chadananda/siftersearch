// /sitemap-biography.xml — one URL per biography page, by slug (GET /api/v1/people/sitemap). 503 (never an empty set) on failure.
import { urlsetXml } from '../lib/sitemap-xml.js';

export const prerender = false;
const API_BASE = import.meta.env.PUBLIC_API_URL || 'https://api.siftersearch.com';

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/api/v1/people/sitemap`);
    if (!res.ok) throw new Error(`api ${res.status}`);
    const { people } = await res.json();
    if (!people?.length) throw new Error('no people');
    return new Response(urlsetXml(people.map((p) => [`/biography/${p.slug}`])), {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
    });
  } catch (err) {
    console.error('sitemap-biography:', err?.message || err);
    return new Response('sitemap temporarily unavailable', { status: 503, headers: { 'Retry-After': '600', 'Cache-Control': 'no-store' } });
  }
}
