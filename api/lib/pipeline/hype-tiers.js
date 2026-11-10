// HyPE program tiers: core | gray | history | rest, decided PER PARAGRAPH (a mixed book splits by tier), primary docs before website copies.
// selectTier → the docs + paragraph ids to plan next; countTiers → ¶ / requests / $ per tier for dryRun and the report.
// Deps: docs-repo listDocs, hype-program-repo, authority doctrinalTier, profile detectGenre. Pure otherwise; every dep injectable.
import { listDocs } from '../docs-repo.js';
import { hypeParagraphs, paragraphTotals } from '../repos/hype-program-repo.js';
import { doctrinalTier } from '../authority.js';
import { paragraphAuthor } from '../authorship/effective.js';
import { detectGenre, PROFILE_OVERRIDES } from './profile.js';
import { HYPE_VERSION } from '../rag/enrich/retrieval.js';
import { canonicalTradition } from '../assistant/tradition-name.js';

export const TIER_ORDER = ['core', 'gray', 'history', 'rest'];
export const PASSES = ['primary', 'copy'];
/** Within every tier, Bahá'í docs first, then every other tradition (Chad 11-10: "Bahá'í core first"). Order, never a filter. */
export const FAITHS = ['bahai', 'other'];
export const DOCTRINAL_TIERS = ['core', 'gray'];
export const SLICE_TARGET = 1500, SLICE_OVER = 4000;   // retrieval.js: a ¶ over 4000 chars goes out as ~1500-char slices
const DOC_FIELDS = ['id', 'title', 'author', 'religion', 'collection', 'scope'];
const isBahai = (d) => /^bah/i.test(String(d.religion || '').trim());
export const isCopy = (d) => d.scope === 'supplemental';   // a website copy: it follows its primary twin (twin reuse copies the questions)
export const docGenre = (d) => PROFILE_OVERRIDES[d.id]?.genre || detectGenre(d);

/** The tier of one paragraph. Only Bahá'í docs decide by the paragraph's own writer (doctrinalTier ignores para elsewhere). */
export function paraTier(doc, authors = null) {
  const t = doctrinalTier(doc, isBahai(doc) ? { author: paragraphAuthor({ authors, author: doc.author }) } : null);
  if (t === 'core' || t === 'gray') return t;
  return /^(history|biography)$/.test(docGenre(doc)) ? 'history' : 'rest';
}

/** Requests one pending paragraph costs: 1, or one per ~1500-char slice when over 4000. */
export const requestsFor = (len) => (len > SLICE_OVER ? Math.ceil(len / SLICE_TARGET) : 1);

/** Next paragraphs to plan for (tier, pass), in doc-id order from `after`. → { docs:[{docId, ids}], paragraphs, cursor, exhausted }
 *  cursor = the last doc id such that every doc up to it has nothing pending in this tier (safe to start the next scan after it:
 *  docs just submitted stay behind it until they settle). skip = docs the planner refused (gated) — they never block the cursor. */
export async function selectTier({ tier, pass = 'primary', faith = null, limit = 10000, after = 0, skip = new Set(), version = HYPE_VERSION }, deps = {}) {
  const { docs: docsOf = listDocs, paras = hypeParagraphs } = deps;
  const out = { docs: [], paragraphs: 0, cursor: after, exhausted: false };
  // faith 'bahai' | 'other' (Chad 11-10: the Bahá'í core first): docs of the other faith are not this phase's work, so they never hold the cursor
  const ours = (d) => isCopy(d) === (pass === 'copy') && (!faith || (faith === 'bahai') === isBahai(d));
  let clean = true;
  for (let afterId = after; ;) {
    const page = (await docsOf({ scope: 'live', afterId, fields: DOC_FIELDS, limit: 1000, count: false })).docs || [];
    if (!page.length) { out.exhausted = true; return out; }
    afterId = page[page.length - 1].id;
    const mine = page.filter(ours);
    const bah = mine.filter(isBahai), rest = mine.filter((d) => !isBahai(d));
    const rows = [...(bah.length ? await paras(bah.map((d) => d.id), version, { authors: true, pendingOnly: true }) : []),
      ...(rest.length ? await paras(rest.map((d) => d.id), version, { pendingOnly: true }) : [])];
    const byDoc = new Map();
    for (const r of rows) (byDoc.get(r.doc_id) || byDoc.set(r.doc_id, []).get(r.doc_id)).push(r);
    for (const d of page) {
      if (!ours(d)) { if (clean) out.cursor = d.id; continue; }
      const ids = skip.has(d.id) ? [] : (byDoc.get(d.id) || []).filter((r) => paraTier(d, r.authors) === tier).map((r) => r.id);
      if (!ids.length) { if (clean) out.cursor = d.id; continue; }
      clean = false;
      const room = limit - out.paragraphs;
      if (room <= 0) return out;
      out.docs.push({ docId: d.id, ids: ids.slice(0, room) }); out.paragraphs += Math.min(ids.length, room);
    }
    if (out.paragraphs >= limit) return out;
  }
}

/** ¶ and requests per tier × pass: { tier: { primary|copy: { docs, total, done, pending, requests } } }. Aggregates for single-tier docs,
 *  row level (with authors) for Bahá'í docs. Whole-library scan: an ops job (heavy lane), never a request path.
 *  Also `traditions`: { tradition: { total, done, pending, ready } } over the DOCTRINAL tiers (core + gray, primary + copy) — the signal that
 *  a tradition's doctrinal works have their HyPE, so its question testing may start (Chad 11-10). */
export async function countTiers({ version = HYPE_VERSION } = {}, deps = {}) {
  const { docs: docsOf = listDocs, paras = hypeParagraphs, totals = paragraphTotals } = deps;
  const res = Object.fromEntries(TIER_ORDER.map((t) => [t, Object.fromEntries(PASSES.map((p) => [p, { docs: 0, total: 0, done: 0, pending: 0, requests: 0 }]))]));
  const trad = {};
  const doctrinal = (d, tier, total, done, pending) => {
    if (!DOCTRINAL_TIERS.includes(tier)) return;
    const k = canonicalTradition(d.religion) || 'Other', e = trad[k] ||= { total: 0, done: 0, pending: 0 };
    e.total += total; e.done += done; e.pending += pending;
  };
  for (let afterId = 0; ;) {
    const page = (await docsOf({ scope: 'live', afterId, fields: DOC_FIELDS, limit: 1000, count: false })).docs || [];
    if (!page.length) {
      res.traditions = Object.fromEntries(Object.entries(trad).sort((a, b) => b[1].total - a[1].total).map(([k, e]) => [k, { ...e, ready: e.pending === 0 }]));
      return res;
    }
    afterId = page[page.length - 1].id;
    const bah = page.filter(isBahai), rest = page.filter((d) => !isBahai(d));
    const tot = rest.length ? await totals(rest.map((d) => d.id), version) : new Map();
    for (const d of rest) {
      const t = tot.get(d.id); if (!t) continue;
      const b = res[paraTier(d)][isCopy(d) ? 'copy' : 'primary'];
      b.docs++; b.total += t.total; b.done += t.done; b.pending += t.pending; doctrinal(d, paraTier(d), t.total, t.done, t.pending);
      b.requests += t.pending - t.longN + (t.longChars ? Math.ceil(t.longChars / SLICE_TARGET) : 0);
    }
    const rows = bah.length ? await paras(bah.map((d) => d.id), version, { authors: true }) : [];
    const docOf = new Map(bah.map((d) => [d.id, d])), seen = new Set();
    for (const r of rows) {
      const d = docOf.get(r.doc_id), b = res[paraTier(d, r.authors)][isCopy(d) ? 'copy' : 'primary'];
      const k = `${r.doc_id}|${paraTier(d, r.authors)}`;
      if (!seen.has(k)) { seen.add(k); b.docs++; }
      b.total++; if (r.done) b.done++; else { b.pending++; b.requests += requestsFor(r.len); }
      doctrinal(d, paraTier(d, r.authors), 1, r.done ? 1 : 0, r.done ? 0 : 1);
    }
  }
}
