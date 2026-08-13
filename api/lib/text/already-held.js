// "Do we already hold this?" for the missing-books triage. The library lists the same work under
// several doc rows — an archival husk ("1898, May Maxwell — An Early Pilgrimage") alongside the
// real ingested text ("An Early Pilgrimage", author May Maxwell) — so an exact title match misses
// it and the husk gets reported as missing. Match on TOKEN CONTAINMENT instead: every significant
// word of the candidate (title + author) must appear in a held doc's title+author. Deps: clean-title.
import { cleanTitle } from './clean-title.js';

// Dropped because they carry no identity: grammar, archival scaffolding, honorifics, and the
// date/box/chapter numbers that distinguish an archive slot rather than a work.
const NOISE = new Set([
  'the', 'and', 'for', 'with', 'from', 'his', 'her', 'its', 'that', 'this', 'was', 'were', 'are',
  'mr', 'mrs', 'ms', 'dr', 'sir', 'esq',
  'new', 'copy', 'scan', 'file', 'files', 'html', 'pdf', 'doc', 'docx', 'draft', 'untitled',
  'box', 'folder', 'part', 'pt', 'vol', 'volume', 'chapter', 'ch', 'page', 'pages', 'section',
  'notes', 'note', 'letter', 'letters', 'transcript', 'excerpt', 'excerpts', 'compilation',
]);

const MIN_TOKENS = 3;   // fewer than three identifying words cannot safely claim a match

export function titleTokens(title, author) {
  const flat = `${cleanTitle(title)} ${cleanTitle(author)}`
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ');
  const out = new Set();
  for (const t of flat.split(' ')) {
    if (t.length < 3) continue;         // initials, "of", "in"
    if (/^\d+$/.test(t)) continue;      // years, box numbers, bahai-library node ids
    if (NOISE.has(t)) continue;
    out.add(t);
  }
  return out;
}

/**
 * @param {Array<{title:string, author?:string}>} heldDocs docs that actually hold their text
 * @returns {{isHeld: (title:string, author?:string) => boolean, size: number}}
 */
export function buildHeldIndex(heldDocs) {
  const held = [];
  const byToken = new Map();            // token → indices, so a candidate probes its rarest word only
  for (const d of heldDocs) {
    const toks = titleTokens(d.title, d.author);
    if (toks.size < MIN_TOKENS) continue;
    const i = held.push(toks) - 1;
    for (const t of toks) {
      if (!byToken.has(t)) byToken.set(t, []);
      byToken.get(t).push(i);
    }
  }
  const isHeld = (title, author) => {
    const cand = titleTokens(title, author);
    if (cand.size < MIN_TOKENS) return false;
    let probe = null;
    for (const t of cand) {
      const n = byToken.get(t)?.length ?? 0;
      if (n === 0) return false;                       // a word no held doc has ⇒ no containment
      if (probe === null || n < probe.n) probe = { t, n };
    }
    return byToken.get(probe.t).some((i) => {
      const h = held[i];
      for (const t of cand) if (!h.has(t)) return false;
      return true;
    });
  };
  return { isHeld, size: held.length };
}
