// The library sitemap as a SNAPSHOT: built out of process by siftersearch-reports (pipeline-snapshot-job →
// data/library-sitemap.json, from pipeline-snapshot-repo.sitemapRows) and only READ by GET /api/library/sitemap[/:part],
// which the site's /sitemap-library*.xml endpoints render. Parts: one per tradition, split at CHUNK URLs (< the 50k
// protocol limit), plus 'collections' (tradition + collection pages). shapeLibrarySitemap is pure; the XML is
// src/lib/sitemap-xml.js (worker-safe).
import { readFileSync, statSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { slugifyPath } from '../slug.js';

export const LIBRARY_SITEMAP_FILE = 'library-sitemap.json';
export const CHUNK = 25_000;
const DEFAULT_PATH = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'data', LIBRARY_SITEMAP_FILE);

const day = (ts) => { const t = Date.parse(String(ts || '').replace(' ', 'T') + (/[zZ]|[+-]\d\d:?\d\d$/.test(String(ts)) ? '' : 'Z')); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null; };
const later = (a, b) => (!a ? b : !b ? a : a > b ? a : b);

/**
 * rows [{religion, collection, slug, updated_at}] (live, non-duplicate docs) → { generated_at, chunk, index, parts }.
 * index: [{ part, count, lastmod }]; parts: { [part]: [[path, lastmod], …] }. Paths are the reader's canonical
 * /library/<religion>/<collection>/<slug> (as the page's <link rel="canonical"> names it). Hidden traditions, dot-
 * collections and rows without a slug are left out; a path listed twice keeps its latest lastmod.
 */
export function shapeLibrarySitemap(rows, { hidden = new Set(), chunk = CHUNK, now = Date.now() } = {}) {
  const byReligion = new Map();   // religion slug → Map(path → lastmod)
  const pages = new Map();        // tradition / collection page path → lastmod
  for (const r of rows || []) {
    if (!r?.religion || !r.collection || !r.slug || hidden.has(r.religion) || String(r.collection).startsWith('.')) continue;
    const rs = slugifyPath(r.religion), cs = slugifyPath(r.collection);
    if (!rs || !cs) continue;
    const lm = day(r.updated_at);
    const path = `/library/${rs}/${cs}/${r.slug}`;
    if (!byReligion.has(rs)) byReligion.set(rs, new Map());
    const docs = byReligion.get(rs);
    docs.set(path, later(docs.get(path), lm));
    pages.set(`/library/${rs}`, later(pages.get(`/library/${rs}`), lm));
    pages.set(`/library/${rs}/${cs}`, later(pages.get(`/library/${rs}/${cs}`), lm));
  }
  const parts = {}, index = [];
  const add = (part, entries) => {
    parts[part] = entries;
    index.push({ part, count: entries.length, lastmod: entries.reduce((m, [, lm]) => later(m, lm), null) });
  };
  if (pages.size) add('collections', [...pages].sort(([a], [b]) => (a < b ? -1 : 1)));
  for (const rs of [...byReligion.keys()].sort()) {
    const entries = [...byReligion.get(rs)].sort(([a], [b]) => (a < b ? -1 : 1));
    for (let i = 0; i < entries.length; i += chunk) add(`${rs}-${i / chunk + 1}`, entries.slice(i, i + chunk));
  }
  return { generated_at: new Date(now).toISOString(), chunk, total: index.reduce((n, p) => n + p.count, 0), index, parts };
}

let cache = { path: null, mtime: -1, data: null };
/** The latest snapshot, or null when siftersearch-reports has not written one yet (never queries). */
export function readLibrarySitemap(path = DEFAULT_PATH) {
  try {
    const m = statSync(path).mtimeMs;
    if (cache.path !== path || m !== cache.mtime) cache = { path, mtime: m, data: JSON.parse(readFileSync(path, 'utf8')) };
    return cache.data;
  } catch {
    return cache.path === path ? cache.data : null;
  }
}

