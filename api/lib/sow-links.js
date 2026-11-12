// Star of the West range links (bahai-education.org viewer, spec: blogworks.ai sites/bahai-education.org
// apps/star-of-the-west/docs/highlight-links.md). linkFor emits "…/sifter-star-of-the-west/v{vol}.{issue}#~d={doc}~i={index}[~q=…]";
// the output pass (ocean-links.js) turns it into "…/v{vol}.{issue}-p{page}?hl={words}" from the paragraph's file id
// (block_attrs.id = para_N) and the site's page map. Map or paragraph missing → the issue page. Deps: block-attrs-repo (lazy).
import { encodeMarker } from './ool-range.js';

export const SOW_BASE = 'https://bahai-education.org/sifter-star-of-the-west';
export const SOW_MAP_URL = 'https://bahai-education.org/web/sow-page-map.json';
export const SOW_MARKER_URL = /https:\/\/bahai-education\.org\/sifter-star-of-the-west\/v(\d+)\.(\d+)#~d=(\d+)~i=(\d+)(?:~q=([^\s"'<>)\]]+))?/g;

/** { vol, issue } of a Star of the West issue document (title "Star of the West, v11, i9 …" or file "SOW, v11, i9 …"), else null. */
export function sowIssue(doc) {
  const m = String(doc?.title || '').match(/^Star of the West, v(\d+), i(\d+)\b/i) || String(doc?.filename || '').replace(/^.*\//, '').match(/^SOW, v(\d+), i(\d+)\b/i);
  return m ? { vol: Number(m[1]), issue: Number(m[2]) } : null;
}

// the magazine as a whole: one document per issue under this folder (the compilations titled "Star of the West…" are copies)
export const SOW_FOLDER = "Baha'i/News/Star of the West/";
/** A title naming the magazine (or a compilation of it), not one issue: "Star of the West", "Star of the West - Volumes X-XI …". */
export const isSowWork = (doc) => /^(the )?star of the west\b/i.test(String(doc?.title || '')) && !sowIssue(doc);

/** The reader named the magazine as a whole, not one issue: a magazine-level doc, or an issue the book finder picked from a name
 *  ("Star of the West") that carries no volume / issue number (11-12 live: "…maxwell birth … in Star of the West?" resolved to
 *  v1 i1 and searched that one issue). `said` = the name(s) given, else the message. Pure. */
export function sowWholeAsked(doc, said = '') {
  if (isSowWork(doc)) return true;
  const s = String(said || '');
  return !!sowIssue(doc) && /\bstar of the west\b/i.test(s) && !/\b(?:v|vol|volume|i|no|nos|issue|number)\.?\s*\d/i.test(s);
}

/** The magazine's issue document ids in reading order (volume, issue); one folder read, kept an hour. Deps: docs-repo (lazy). */
let issues = null;
export async function sowIssueIds({ list = null, now = Date.now() } = {}) {
  if (!list && issues && now - issues.at < 3600000) return issues.ids;
  const rows = await (list || (async () => (await import('./docs-repo.js')).docsInFolder(SOW_FOLDER)))();
  const ids = (rows || []).map((d) => ({ id: Number(d.id), at: sowIssue(d) })).filter((d) => d.at)
    .sort((a, b) => a.at.vol - b.at.vol || a.at.issue - b.at.issue).map((d) => d.id);
  if (!list) issues = { ids, at: now };
  return ids;
}

/** An issue's thumbnail: its page 1 scan on bahai-education.org's image worker, referenced in place (sized by `w=`, see coverAt). */
export function sowCoverUrl(doc) {
  const at = sowIssue(doc);
  return at ? `https://bahai-education.org/ix/x/sow/v${at.vol}i${at.issue}/page-001.webp?crop=top&warm=18&contrast=16&sharpen=24&descreen=1` : null;
}

/** The marker link linkFor hands out for a SoW paragraph (or the issue page when the paragraph is unknown). */
export function sowMarkerUrl(doc, paragraphIndex, quote = null) {
  const at = sowIssue(doc);
  if (!at) return null;
  const base = `${SOW_BASE}/v${at.vol}.${at.issue}`;
  const docId = doc.document_id ?? doc.doc_id ?? doc.id;
  if (docId == null || paragraphIndex == null) return base;
  return `${base}#~d=${docId}~i=${paragraphIndex}${quote ? `~q=${encodeMarker(String(quote).slice(0, 2000))}` : ''}`;
}

/** Normalized words of a passage (spec §3): markup out, split on space/hyphen/dash, NFD, marks stripped, a-z0-9 only. */
export function sowWords(text) {
  return String(text || '')
    .replace(/\[pdfpage_\d+\]/g, ' ').replace(/\{[^}]*\}/g, ' ').replace(/\]\([^)]*\)/g, ' ')
    .split(/[\s\-–—]+/)
    .map((w) => w.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(Boolean);
}

/** The hl parameter: ≤12 words joined, else first 6 .. last 6. */
export function sowHl(text) {
  const w = sowWords(text);
  return w.length <= 12 ? w.join('-') : `${w.slice(0, 6).join('-')}..${w.slice(-6).join('-')}`;
}

/** Page of paragraph N in an issue's map entry: mapped number, a [s,e] span estimated by `frac`, an unmapped
 *  paragraph → the end page of the nearest earlier mapped one, none → 1. */
export function sowPage(issueMap, paraN, frac = 0) {
  const paras = issueMap?.paras || {};
  const own = paras[paraN];
  if (typeof own === 'number') return own;
  if (Array.isArray(own)) return Math.max(own[0], Math.min(own[1], own[0] + Math.floor(Math.max(0, frac) * (own[1] - own[0] + 1))));
  for (let k = Number(paraN) - 1; k > 0; k--) { const v = paras[k]; if (v != null) return Array.isArray(v) ? v[1] : v; }
  return 1;
}

const fold = (s) => sowWords(s).join(' ');
/** The finished link for a paragraph row { text, block_attrs } of issue vol.issue, with an optional quote inside it. */
export function sowRangeUrl(map, vol, issue, row, quote = null) {
  let paraN = null;
  try { paraN = String(JSON.parse(row?.block_attrs || '{}').id || '').match(/^para_(\d+)$/)?.[1] ?? null; } catch { /* no attrs */ }
  const issueMap = map?.issues?.[`${vol}.${issue}`];
  if (!paraN || !issueMap) return null;
  const text = String(row.text || '');
  // where the quote starts in the paragraph, as a fraction (only matters for a paragraph that spans pages)
  const at = quote ? fold(text).indexOf(fold(quote)) : 0;
  const frac = at > 0 ? at / Math.max(1, fold(text).length) : 0;
  const hl = sowHl(quote || text);
  return `${SOW_BASE}/v${vol}.${issue}-p${sowPage(issueMap, paraN, frac)}${hl ? `?hl=${hl}` : ''}`;
}

// The page map: static JSON fetched once per process, refreshed daily; a failed fetch retries after an hour.
let mapState = { at: 0, map: null, ok: false };
const DAY_MS = 864e5, RETRY_MS = 36e5;
export async function sowPageMap({ fetchImpl = globalThis.fetch, now = Date.now() } = {}) {
  if (now - mapState.at < (mapState.ok ? DAY_MS : RETRY_MS)) return mapState.map;
  try {
    const r = await fetchImpl(SOW_MAP_URL, { signal: AbortSignal.timeout(8000) });
    const j = r.ok ? await r.json() : null;
    mapState = j?.issues ? { at: now, map: j, ok: true } : { at: now, map: mapState.map, ok: false };
  } catch { mapState = { at: now, map: mapState.map, ok: false }; }
  return mapState.map;
}
export const resetSowPageMap = () => { mapState = { at: 0, map: null, ok: false }; };

const rowsCache = new Map();   // doc id → { at, rows }
async function rowsOf(docId, loadRows) {
  const hit = rowsCache.get(docId);
  if (hit && Date.now() - hit.at < 36e5) return hit.rows;
  let rows = [];
  try { rows = await (loadRows || (await import('./repos/block-attrs-repo.js')).olRowsForDoc)(docId); } catch { /* unreadable: issue page */ }
  rowsCache.set(docId, { at: Date.now(), rows });
  if (rowsCache.size > 500) rowsCache.delete(rowsCache.keys().next().value);
  return rows;
}

/** Output pass: every SoW marker link in `s` → its page + highlight link (or the issue page). */
export async function upgradeSowLinks(s, { loadRows, fetchImpl } = {}) {
  const found = [...String(s).matchAll(SOW_MARKER_URL)];
  if (!found.length) return s;
  const map = await sowPageMap({ fetchImpl });
  const ids = [...new Set(found.map((m) => Number(m[3])))];
  const rows = new Map(await Promise.all(ids.map(async (id) => [id, map ? await rowsOf(id, loadRows) : []])));
  return String(s).replace(SOW_MARKER_URL, (whole, vol, issue, docId, index, q) => {
    let quote = null;
    try { quote = q ? decodeURIComponent(q) : null; } catch { /* malformed marker: whole paragraph */ }
    const row = (rows.get(Number(docId)) || []).find((r) => Number(r.paragraph_index) === Number(index));
    return (row && sowRangeUrl(map, vol, issue, row, quote)) || `${SOW_BASE}/v${vol}.${issue}`;
  });
}
