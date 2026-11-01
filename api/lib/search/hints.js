// Search hints from Anís's phrase step (assistant/phrases.js: {exact, names, spellings, author, work, tradition}) → what
// planned-search hunts beside its plan (exact wordings verbatim, names by keyword) and how it REORDERS — preferences, never filters.
// Pure. Deps: search/verbatim.js
import { foldVerbatim } from './verbatim.js';

const foldName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[‘’ʼʻ`']/g, '').replace(/[^a-zA-Z0-9]+/g, '').toLowerCase();
const nWords = (s) => String(s || '').split(/\s+/).filter(Boolean).length;
// "I think it's Bahá'u'lláh", "was it Jesus?" — a guessed author is no preference (misattribution fixtures)
const DOUBT = /\b(i\s+think|i\s+believe|maybe|perhaps|probably|not\s+sure|was\s+it|is\s+it|or\s+was|attributed|supposedly|apparently|someone\s+said|i\s+heard|i\s+read)\b/i;

/**
 * Which hints apply to this plan. → { exact:[], names:[], author, work, tradition } (empty when none).
 * exact: 4+ word wordings not already hunted verbatim; names (+ spellings): lookups only — in a quote they are topic words;
 * author: a quote whose plan has no author preference and whose question does not hedge it.
 */
export function hintPlan(hints, plan = {}, { verbatimQ = null, question = '' } = {}) {
  const none = { exact: [], names: [], author: null, work: null, tradition: null };
  if (!hints || typeof hints !== 'object') return none;
  const hunted = verbatimQ ? foldVerbatim(verbatimQ) : null;
  const exact = (hints.exact || []).filter((p) => nWords(p) >= 4 && foldVerbatim(p) !== hunted).slice(0, 2);
  const seen = new Set();
  const names = plan.shape === 'lookup' ? [...(hints.names || []), ...(hints.spellings || [])].filter((n) => { const k = foldName(n); return k && !seen.has(k) && seen.add(k); }).slice(0, 4) : [];
  const author = plan.shape === 'quote' && !plan.prefer && hints.author && !DOUBT.test(question) ? hints.author : null;
  const tradition = !plan.filters?.religion && !plan.comparative ? hints.tradition || null : null;
  return { exact, names, author, work: hints.work || null, tradition };
}

const leadBy = (list, test) => { const a = [], b = []; for (const h of list) (test(h) ? a : b).push(h); return [...a, ...b]; };
const union = (lists) => { const seen = new Set(), out = []; for (const l of lists) for (const h of l || []) if (h && !seen.has(h.id)) { seen.add(h.id); out.push(h); } return out; };

/**
 * Reorder hits by the applied hints. Order of strength: work/tradition/author (weak, stable partitions) < names < exact wording.
 * exactHits / nameHits are the extra keyword searches' results; at most 2 of each join when nothing in `hits` matches.
 */
export function applyHints(hits, h, { exactHits = [], nameHits = [], limit = 10 } = {}) {
  let out = [...hits];
  if (h.tradition) { const t = foldName(h.tradition).slice(0, 5); out = leadBy(out, (x) => t && foldName(x.religion).startsWith(t)); }
  if (h.author) { const a = foldName(h.author); out = leadBy(out, (x) => a && foldName(x.author).includes(a)); }
  if (h.work) { const w = foldName(h.work); out = leadBy(out, (x) => w && foldName(x.title).includes(w)); }
  if (h.names.length) {
    const ns = h.names.map(foldName).filter((n) => n.length >= 4);
    const names = (x) => ns.some((n) => foldName(`${x.title} ${x.text}`).includes(n));
    out = leadBy(union([out, nameHits.filter(names).slice(0, 4)]), names);
  }
  if (h.exact.length) {
    const ps = h.exact.map(foldVerbatim);
    const has = (x) => { const t = foldVerbatim(x.text); return ps.some((p) => t.includes(p)); };
    const pool = union([out, exactHits]);
    out = pool.some(has) ? leadBy(pool, has) : union([out.slice(0, Math.max(0, limit - 2)), exactHits.slice(0, 2), out]);
  }
  return out.slice(0, Math.max(limit, 1));
}
