// Quotations and cross-references in a transcript (Chad 10-21, a firm requirement): recited Writings → their ENGLISH
// source via SourceHunt + the citation job's acceptance gates (writer, own work, not a compilation or mirror; overlap gate);
// attributed teachings ("the Guardian taught that…") → a canonical passage that STATES it (HyPE/concept/phrase search in
// the writer's own works, then a strict yes/no). The speaker's words never change: a quote is a word span that carries a
// link; a teaching becomes a breakout (kind 'concept') after its paragraph. Deps injected; defaults are the live ones.
import { acceptSource } from '../ops/source-links-build-job.js';
import { keyOf } from './vocab.js';
import { paragraphText } from './paragraphs.js';

export const GATES = { printed: { verbatim: 0.6, translation: 0.3 }, spoken: { verbatim: 0.45, translation: 0.25 } };
const WRITER_KEYS = { bahaullah: 'Bahá’u’lláh', thebab: 'The Báb', bab: 'The Báb', abdulbaha: '‘Abdu’l-Bahá', shoghieffendi: 'Shoghi Effendi', guardian: 'Shoghi Effendi', master: '‘Abdu’l-Bahá', universalhouseofjustice: 'Universal House of Justice' };
export const writerName = (w) => WRITER_KEYS[keyOf(w).replace(/^the(?=guardian|master|universal)/, '')] || null;

/** Where `text` (the model's copy of the recited words) sits in the paragraph's words: the best-overlapping window. → { i0, i1, share } or null */
export function locateSpan(words, text) {
  const want = String(text || '').split(/\s+/).map(keyOf).filter(Boolean);
  if (want.length < 3) return null;
  const keys = words.map((w) => keyOf(w.w));
  const n = want.length;
  let best = null;
  for (let i = 0; i + 1 <= keys.length; i++) {
    for (const len of [n - 1, n, n + 1, n + 2].filter((l) => l >= 3 && i + l <= keys.length)) {
      const win = keys.slice(i, i + len);
      // share of the wanted words found IN ORDER (a greedy subsequence) — robust to a dropped or extra word
      let j = 0, hit = 0;
      for (const k of win) { if (j < n && k === want[j]) { hit++; j++; } else if (want.indexOf(k, j) >= 0 && want.indexOf(k, j) - j <= 2) { j = want.indexOf(k, j) + 1; hit++; } }
      const share = hit / n;
      if (!best || share > best.share + 1e-9 || (Math.abs(share - best.share) < 1e-9 && len < best.i1 - best.i0)) best = { i0: i, i1: i + len, share };
    }
  }
  if (!best || best.share < 0.7) return null;
  // trim edges that are not wanted words
  while (best.i0 < best.i1 && !want.includes(keys[best.i0])) best.i0++;
  while (best.i1 > best.i0 && !want.includes(keys[best.i1 - 1])) best.i1--;
  return best.i1 - best.i0 >= 3 ? best : null;
}

/** Under which gate an accepted source counts: 'printed' (the citation job's), 'spoken' (looser, measured), or null. */
export function gateOf(overlap) {
  const ov = Number(overlap) || 0;
  if (ov >= GATES.printed.verbatim) return { gate: 'printed', basis: 'verbatim' };
  if (ov >= GATES.printed.translation) return { gate: 'printed', basis: 'translation' };
  if (ov >= GATES.spoken.translation) return { gate: 'spoken', basis: ov >= GATES.spoken.verbatim ? 'verbatim' : 'translation' };
  return null;
}

// THE PASSAGE GATE (Chad 10-22: a "quote" card showed a table of contents from a scraped PDF, cited by its file slug): a linked
// source must be a sentence-level passage of a properly catalogued work — never a heading, contents/front matter, index or
// numbered list, never a document whose title or author is a file name.
const slugish = (s) => !s || /_|^pdf-|\.(pdf|docx?|html?|txt)$/i.test(s) || /^[a-z0-9]+(?:-[a-z0-9]+)+$/.test(s);
/** Excerpt text without markup ("* *", "**", "#", links). Pure. */
export const cleanExcerpt = (t) => String(t ?? '').replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/(\*\*|__)(?=\S)(.+?)\1/g, '$2').replace(/(\*|_)(?=\S)([^*_]+?)\1/g, '$2')
  .replace(/^[\s*#>_-]+/, '').replace(/(?:^|\s)[*#]+(?=\s|$)/g, ' ').replace(/\s+/g, ' ').trim();
/** null when the passage may be linked, else the reason. row: { text, blocktype, heading, title, author }. Pure. */
export function passageGate(row) {
  if (!row?.text) return 'no passage';
  if (/heading|toc|title|contents|index|list/i.test(String(row.blocktype || ''))) return 'a heading or contents block';
  if (slugish(row.title) || slugish(row.author)) return 'not a properly catalogued work (file-name title or author)';
  const t = cleanExcerpt(row.text);
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 8) return 'too short to be a passage';
  const sentences = (t.match(/[.!?;:]["”’)\]]*(?=\s|$)/g) || []).length;
  if (!sentences) return 'no sentence';
  if (/^(?:preface|contents|table of contents|index|foreword|bibliography|acknowledg)/i.test(t) || (/\b(?:preface|table of contents|contents)\b/i.test(t.slice(0, 80)) && sentences < 3)) return 'front matter';
  if ((t.match(/(?:^|\s)(?:[IVXL]+|\d{1,3})\.\s+[A-Z]/g) || []).length >= 3) return 'numbered entries (contents)';
  const long = words.filter((w) => w.replace(/[^\p{L}]/gu, '').length > 3);
  const caps = long.filter((w) => /^[\p{Lu}]/u.test(w.replace(/^[^\p{L}]+/u, ''))).length;
  if (long.length >= 12 && caps / long.length > 0.55) return 'heading-like (title case)';
  if (words.length >= 40 && sentences / words.length < 1 / 45) return 'not a sentence-level passage';
  return null;
}

/** "Gleanings from the Writings of Bahá’u’lláh, ¶ 112" style citation. */
export const citeOf = (o) => [o.author && !String(o.title || '').includes(o.author) ? o.author : null, o.title].filter(Boolean).join(', ');

async function liveDeps() {
  const { sourceHunt } = await import('../source-hunt.js');
  const { paragraphsByIds } = await import('../paragraphs-repo.js');
  const { linkFor } = await import('../source-links.js');
  const { resolveLinks } = await import('../passage-links.js');
  const q = await import('../search/qdrant-layers.js');
  return { sourceHunt, paragraphsByIds, linkFor, resolveLinks, searchHype: q.searchHypeQdrant, searchConcepts: q.searchConceptsQdrant, searchPhrases: q.searchPhrases };
}

/** The English link for an accepted source paragraph: itself when English; else its held English translation; else itself. */
async function englishLink(d, id, quote) {
  const [p] = await d.paragraphsByIds([id]);
  if (!p) return null;
  let use = p, via = null;
  if (p.language && !/^en/i.test(p.language)) {
    const links = await d.resolveLinks([id], { quotedBy: false }).catch(() => new Map());
    const tr = (links.get(id)?.translations || []).find((t) => /^en/i.test(t.document?.language || t.language || 'en'));
    if (tr) { const [tp] = await d.paragraphsByIds([tr.id]); if (tp) { use = tp; via = 'translation'; } }
  }
  const link = d.linkFor(use, use.paragraph_index, { quote: via ? null : quote });
  return { id: use.id, doc_id: use.doc_id, title: use.title, author: use.author, url: link?.url || link?.reader_url || null, language: use.language, via, text: use.text, blocktype: use.blocktype, heading: use.heading };
}

/**
 * Link the model's quotation candidates. paragraphs: corrected [{ n, words }]. → [{ kind: 'quote', para, i0, i1, t0, t1,
 * said, writer, source: { id, doc_id, title, author, url }, overlap, basis, gate, cite, url }] and the rejected ones.
 */
export async function linkQuotes(paragraphs, candidates, deps = {}, { pauseMs = 1500, sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = [] } = {}) {
  const d = { ...(deps.sourceHunt ? {} : await liveDeps()), ...deps };
  const byN = new Map(paragraphs.map((p) => [p.n, p]));
  const linked = [], rejected = [];
  for (const [k, c] of candidates.entries()) {
    const p = byN.get(Number(c.p));
    const span = p && locateSpan(p.words, c.text);
    if (!span) { rejected.push({ ...c, why: 'not found in the transcript' }); continue; }
    const said = p.words.slice(span.i0, span.i1).map((w) => w.w).join(' ');
    if (span.i1 - span.i0 < 6) { rejected.push({ ...c, said, why: 'too short' }); continue; }
    if (k && pauseMs) await sleep(pauseMs);   // one hunt at a time with a breath between — search must not slow for readers
    const r = await d.sourceHunt(said, {}, {}).catch((e) => ({ error: e.message }));
    if (r?.error || !r?.origin) { rejected.push({ ...c, said, why: r?.error ? `hunt failed: ${r.error}` : 'no source found' }); continue; }
    const cands = [r.origin, ...(r.considered || []).filter((x) => x.id !== r.origin.id).map((x) => ({ id: x.id, documentId: x.documentId, title: x.title, author: x.writer, bookAuthor: x.bookAuthor, site: x.site === 'library' ? null : x.site, overlap: x.overlap, collection: x.collection }))];
    let pick = null, why = null, src = null;
    for (const o of cands) {
      // the citation job's gate, at the SPOKEN threshold first: its writer/own-work/compilation/mirror checks are kept
      const a = acceptSource({ ...o, overlap: Math.max(Number(o.overlap) || 0, GATES.printed.verbatim) }, null, -1, o.collection);
      if (!a.basis) { why = why || a.reason; continue; }
      const g = gateOf(o.overlap);
      if (!g) { why = why || 'weak-wording'; continue; }
      // the PASSAGE gate on the paragraph we would link (its English form): a real passage of a catalogued work
      const s = await englishLink(d, o.id, said).catch(() => null);
      const bad = passageGate(s);
      if (bad) { why = why || bad; continue; }
      pick = { o, ...g }; src = s; break;
    }
    if (!pick) { rejected.push({ ...c, said, why: why || 'not accepted', top: { title: r.origin.title, author: r.origin.author, overlap: r.origin.overlap } }); continue; }
    const w0 = p.words[span.i0], w1 = p.words[span.i1 - 1];
    linked.push({ kind: 'quote', para: p.n, i0: span.i0, i1: span.i1, t0: w0.s, t1: w1.e, said, writer: writerName(c.writer) || pick.o.author || null,
      overlap: Number(pick.o.overlap) || 0, basis: pick.basis, gate: pick.gate, source: src && { id: src.id, doc_id: src.doc_id, title: src.title, author: src.author, via: src.via },
      found_id: pick.o.id, url: src?.url || r.origin.url || null, cite: citeOf(src || pick.o), excerpt: cleanExcerpt(src?.text || r.origin.text || '').slice(0, 400) });
    log.push({ said: said.slice(0, 80), source: pick.o.title, overlap: pick.o.overlap, gate: pick.gate });
  }
  return { linked, rejected };
}

/**
 * Attributed teachings → a canonical passage that STATES them: candidates from the HyPE questions, the concept claims and
 * the phrase layer, restricted to the writer's own words; the model verifies yes/no; best confident yes wins (≥ minConf).
 * → [{ kind: 'concept', para, t0, writer, claim, said, source, url, cite, excerpt, confidence }] + rejected
 */
export async function linkTeachings(paragraphs, teachings, verify, deps = {}, { minConf = 0.7, minAuthority = 7, perQuery = 6, pauseMs = 800, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  const d = { ...(deps.searchHype ? {} : await liveDeps()), ...deps };
  const byN = new Map(paragraphs.map((p) => [p.n, p]));
  const linked = [], rejected = [];
  for (const [k, t] of teachings.entries()) {
    const p = byN.get(Number(t.p));
    const writer = writerName(t.writer);
    if (!p || !writer || writer === 'Universal House of Justice') { rejected.push({ ...t, why: !p ? 'no such paragraph' : 'writer not one of the four' }); continue; }
    if (k && pauseMs) await sleep(pauseMs);
    const filters = { author: writer, religion: "Baha'i", writerOnly: true };
    const opts = { limit: perQuery, filters, timeoutMs: 10000 };
    const hits = (await Promise.all([d.searchHype(t.claim, opts), d.searchConcepts(t.claim, opts), d.searchPhrases(t.claim, opts)].map((x) => x.catch(() => ({ hits: [] })))))
      .flatMap((r) => r.hits || []);
    const ids = [...new Set(hits.map((h) => h.paragraph_id))].slice(0, 12);
    const rows = (await d.paragraphsByIds(ids)).filter((r) => (r.text || '').length > 60 && /^en/i.test(r.language || 'en') && !passageGate(r));
    if (!rows.length) { rejected.push({ ...t, why: 'no candidate passages' }); continue; }
    const answers = await verify({ writer, claim: t.claim, words: t.words }, rows.map((r) => ({ title: r.title, author: r.author, text: r.text })));
    // a CANONICAL passage (the writer's own authoritative works and letters: book authority ≥ minAuthority) — the pilot
    // linked "‘Abdu’l-Bahá's Visit to California" (a visitor's account) for a teaching; the most authoritative yes wins
    const auth = (a) => Number(rows[Number(a.i)]?.book_authority ?? rows[Number(a.i)]?.authority ?? 0);
    const yes = answers.filter((a) => a.states && Number(a.confidence) >= minConf && auth(a) >= minAuthority)
      .sort((a, b) => auth(b) - auth(a) || b.confidence - a.confidence)[0];
    if (!yes) { rejected.push({ ...t, why: answers.some((a) => a.states && Number(a.confidence) >= minConf) ? 'stated only outside the canonical works' : 'no passage states it', best: answers.sort((a, b) => b.confidence - a.confidence)[0] || null }); continue; }
    const r = rows[Number(yes.i)];
    const link = d.linkFor(r, r.paragraph_index, { quote: yes.excerpt || null });
    const span = t.words ? locateSpan(p.words, t.words) : null;
    linked.push({ kind: 'concept', para: p.n, t0: span ? p.words[span.i0].s : p.t0, i0: span?.i0 ?? null, i1: span?.i1 ?? null, writer, claim: t.claim, said: t.words || null,
      source: { id: r.id, doc_id: r.doc_id, title: r.title, author: r.author }, url: link?.url || link?.reader_url || null, cite: citeOf(r),
      excerpt: cleanExcerpt(yes.excerpt || r.text).slice(0, 500), confidence: Number(yes.confidence) });
  }
  return { linked, rejected };
}

/** A quote or teaching as the breakout shown after its paragraph (quotes show their source text too). */
export const breakoutsOf = (items) => items.filter((x) => x.url && x.excerpt).map((x) => ({ para: x.para, kind: x.kind, excerpt: x.excerpt.length > 420 ? `${x.excerpt.slice(0, 400).replace(/\s+\S*$/, '')}…` : x.excerpt, cite: x.cite, url: x.url }));

export const paragraphOf = (paragraphs, n) => paragraphText(paragraphs.find((p) => p.n === n) || { words: [] });
