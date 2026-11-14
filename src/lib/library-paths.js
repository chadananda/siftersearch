// siftersearch reader links (/library/<religion>/<collection>/<slug>) → their documents, so a page on the Anís host can route them
// through the link policy (anisUrl's doc: collaborator first, else /doc). One GET /api/library/resolve-paths per 100 paths. Edge-safe.
const SEG = "[^/\\s\"'<>?#&]+";
const PATH = new RegExp(`(?:https?://(?:www\\.)?siftersearch\\.com)?(/library/${SEG}/${SEG}/${SEG})`, 'g');
const pathOf = (u) => { try { return new URL(String(u), 'https://siftersearch.com').pathname.replace(/\/$/, ''); } catch { return null; } };

/** The distinct reader paths in some HTML or a list of URLs (absolute siftersearch.com or site-relative). */
export function libraryPaths(input) {
  const out = new Set();
  for (const s of Array.isArray(input) ? input : [input]) for (const m of String(s ?? '').matchAll(PATH)) if (!/^\/library\/view\//.test(m[1])) out.add(pathOf(m[1]));
  return [...out].filter(Boolean);
}

/** paths → Map(path → { id, title, author }) of the ones the library knows; a failed call → what resolved so far (never throws). */
export async function resolveLibraryPaths(paths, { api = 'https://api.siftersearch.com', fetch = globalThis.fetch } = {}) {
  const map = new Map(), list = [...new Set(paths || [])];
  for (let i = 0; i < list.length; i += 100) {
    const q = list.slice(i, i + 100).map((p) => `p=${encodeURIComponent(p)}`).join('&');
    try {
      const r = await fetch(`${api}/api/library/resolve-paths?${q}`, { signal: AbortSignal.timeout(8000) });
      if (!r.ok) continue;
      for (const [p, d] of Object.entries((await r.json())?.docs || {})) if (d?.id) map.set(p, d);
    } catch { /* unresolved: the link keeps today's fallback */ }
  }
  return map;
}

/** A resolved map → docOf(url): the document a reader link names, or null (for anisHref / anisUrl's doc). */
export const docOfPath = (map) => (u) => map?.get(pathOf(u)) ?? null;
