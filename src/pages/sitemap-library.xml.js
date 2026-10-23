// /sitemap-library.xml — the library's SITEMAP INDEX: one child per tradition chunk (≤25k URLs) + 'collections'.
// Data: GET /api/library/sitemap (reports-built snapshot); edge-cached as kind 'xml' (worker/edge-cache.js). A failed
// fetch answers 503 (never an empty index — that is what cost us every library URL until 10-23, and is never cached).
import { sitemapIndexXml } from '../lib/sitemap-xml.js';

export const prerender = false;
const API_BASE = import.meta.env.PUBLIC_API_URL || 'https://api.siftersearch.com';   // SSR fetch — absolute origin

export async function GET() {
  try {
    const res = await fetch(`${API_BASE}/api/library/sitemap`);
    if (!res.ok) throw new Error(`api ${res.status}`);
    const { parts } = await res.json();
    if (!parts?.length) throw new Error('no parts');
    return new Response(sitemapIndexXml(parts), {
      headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=3600, s-maxage=3600' },
    });
  } catch (err) {
    console.error('sitemap-library index:', err?.message || err);
    return new Response('sitemap temporarily unavailable', { status: 503, headers: { 'Retry-After': '600', 'Cache-Control': 'no-store' } });
  }
}
