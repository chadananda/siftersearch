import { defineMiddleware } from 'astro:middleware';

// Server-side gate for the admin area. The browser sends the httpOnly `refresh_token` cookie
// (scoped to .siftersearch.com), which the edge validates against the API's read-only
// /api/auth/session endpoint and requires tier === 'admin'. Unauthorized requests are redirected
// home and the page never renders — gating lives on the server, not in the browser.
const API_BASE = import.meta.env.PUBLIC_API_URL || '';

export const onRequest = defineMiddleware(async (context, next) => {
  const { pathname } = context.url;
  if (!pathname.startsWith('/admin')) return next();

  const cookie = context.request.headers.get('cookie') || '';
  let isAdmin = false;
  if (cookie) {
    try {
      const res = await fetch(`${API_BASE}/api/auth/session`, {
        headers: { cookie },
        // server-to-server; no caching of an auth decision
        cf: { cacheTtl: 0 },
      });
      if (res.ok) {
        const data = await res.json();
        isAdmin = data?.authenticated === true && data?.tier === 'admin';
      }
    } catch {
      isAdmin = false; // fail closed
    }
  }

  if (!isAdmin) return context.redirect('/?signin=1', 302);
  return next();
});
