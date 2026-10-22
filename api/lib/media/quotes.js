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
  return { id: use.id, doc_id: use.doc_id, title: use.title, author: use.author, url: link?.url || link?.reader_url || null, language: use.language, via, text: use.text };
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
    let pick = null, why = null;
    for (const o of cands) {
      // the citation job's gate, at the SPOKEN threshold first: its writer/own-work/compilation/mirror checks are kept
      const a = acceptSource({ ...o, overlap: Math.max(Number(o.overlap) || 0, GATES.printed.verbatim) }, null, -1, o.collection);
      if (!a.basis) { why = why || a.reason; continue; }
      const g = gateOf(o.overlap);
      if (!g) { why = why || 'weak-wording'; continue; }
      pick = { o, ...g }; break;
    }
    if (!pick) { rejected.push({ ...c, said, why: why || 'not accepted', top: { title: r.origin.title, author: r.origin.author, overlap: r.origin.overlap } }); continue; }
    const src = await englishLink(d, pick.o.id, said).catch(() => null);
    const w0 = p.words[span.i0], w1 = p.words[span.i1 - 1];
    linked.push({ kind: 'quote', para: p.n, i0: span.i0, i1: span.i1, t0: w0.s, t1: w1.e, said, writer: writerName(c.writer) || pick.o.author || null,
      overlap: Number(pick.o.overlap) || 0, basis: pick.basis, gate: pick.gate, source: src && { id: src.id, doc_id: src.doc_id, title: src.title, author: src.author, via: src.via },
      found_id: pick.o.id, url: src?.url || r.origin.url || null, cite: citeOf(src || pick.o), excerpt: String(src?.text || r.origin.text || '').slice(0, 400) });
    log.push({ said: said.slice(0, 80), source: pick.o.title, overlap: pick.o.overlap, gate: pick.gate });
  }
  return { linked, rejected };
}

/**
 * Attributed teachings → a canonical passage that STATES them: candidates from the HyPE questions, the concept claims and
 * the phrase layer, restricted to the writer's own words; the model verifies yes/no; best confident yes wins (≥ minConf).
 * → [{ kind: 'concept', para, t0, writer, claim, said, source, url, cite, excerpt, confidence }] + rejected
 */
export async function linkTeachings(paragraphs, teachings, verify, deps = {}, { minConf = 0.7, perQuery = 6, pauseMs = 800, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
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
    const rows = (await d.paragraphsByIds(ids)).filter((r) => (r.text || '').length > 60 && /^en/i.test(r.language || 'en'));
    if (!rows.length) { rejected.push({ ...t, why: 'no candidate passages' }); continue; }
    const answers = await verify({ writer, claim: t.claim, words: t.words }, rows.map((r) => ({ title: r.title, author: r.author, text: r.text })));
    const yes = answers.filter((a) => a.states && Number(a.confidence) >= minConf).sort((a, b) => b.confidence - a.confidence)[0];
    if (!yes) { rejected.push({ ...t, why: 'no passage states it', best: answers.sort((a, b) => b.confidence - a.confidence)[0] || null }); continue; }
    const r = rows[Number(yes.i)];
    const link = d.linkFor(r, r.paragraph_index, { quote: yes.excerpt || null });
    const span = t.words ? locateSpan(p.words, t.words) : null;
    linked.push({ kind: 'concept', para: p.n, t0: span ? p.words[span.i0].s : p.t0, i0: span?.i0 ?? null, i1: span?.i1 ?? null, writer, claim: t.claim, said: t.words || null,
      source: { id: r.id, doc_id: r.doc_id, title: r.title, author: r.author }, url: link?.url || link?.reader_url || null, cite: citeOf(r),
      excerpt: String(yes.excerpt || r.text).slice(0, 500), confidence: Number(yes.confidence) });
  }
  return { linked, rejected };
}

/** A quote or teaching as the breakout shown after its paragraph (quotes show their source text too). */
export const breakoutsOf = (items) => items.filter((x) => x.url && x.excerpt).map((x) => ({ para: x.para, kind: x.kind, excerpt: x.excerpt.length > 420 ? `${x.excerpt.slice(0, 400).replace(/\s+\S*$/, '')}…` : x.excerpt, cite: x.cite, url: x.url }));

export const paragraphOf = (paragraphs, n) => paragraphText(paragraphs.find((p) => p.n === n) || { words: [] });
