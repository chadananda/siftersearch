// Source resolution for RAW search: quoted words are served from their ORIGINAL source, with metadata saying what a
// passage is (original / quotation / recollection / commentary) and whose words it carries. Chad: "the raw search
// results should provide correct metadata and correct quotes and correct references. The chat layer only has the
// information it was given." Live 2026-09-25: Gleanings LXXXVIII was served from a pilgrim-notes book (authority 7)
// while canonical Gleanings sat outside the top 12.
// Judgment (whose words? quotation or recollection?) = ONE Jev call over the candidate passages. Choice of copy =
// deterministic: the speaker's own work, then authority, then the canonical site. Fails open.
// Deps: quote-text.js; Jev (scope-extract ENDPOINT); hybridSearch for the exact-words lookup (lazy, injectable).
import { quoteSpans, containsQuote, foldText } from './quote-text.js';
import { ENDPOINT as JEV_ENDPOINT } from './scope-extract.js';

// The figures whose words are quoted across the corpus, with how their names appear in author fields.
export const SPEAKERS = {
  'Bahá’u’lláh': ['bahaullah'],
  'The Báb': ['the bab', 'bab'],
  '‘Abdu’l-Bahá': ['abdul baha', 'abdulbaha'],
  'Shoghi Effendi': ['shoghi effendi'],
  'Universal House of Justice': ['universal house of justice'],
};
const KINDS = {
  original: 'the author’s OWN words (a scripture, tablet, talk, letter or book by the listed author)',
  quotation: 'reproduces another person’s words VERBATIM, usually in quotation marks — e.g. a biography or compilation quoting a Tablet',
  recollection: 'recalls or paraphrases what someone said — pilgrim notes, memoirs, reported conversations — not a published text',
  commentary: 'the author’s own discussion, history or explanation ABOUT a text, person or event',
};

const isSpeaker = (author, speaker) => {
  const a = foldText(author);
  return (SPEAKERS[speaker] || []).some((n) => a.includes(n));
};
const isCentral = (author) => Object.keys(SPEAKERS).some((s) => isSpeaker(author, s));

/** Worth checking? A passage quoting something, or any passage not written by a central figure. */
export function needsResolution(hit) {
  return quoteSpans(hit.text).length > 0 || !isCentral(hit.author);
}

// Copy ranking: the speaker's own work, then recorded authority, then the canonical site. Missing authority = 0.
const rank = (h, speaker) => [isSpeaker(h.author, speaker) ? 1 : 0, Number(h.authority) || 0, h.source_site === 'oceanlibrary.com' ? 1 : 0];
const better = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };

/** The most authoritative copy among candidates already VERIFIED to contain the words. */
export function pickOriginal(candidates, speaker) {
  let best = null;
  for (const c of candidates || []) if (!best || better(rank(c, speaker), rank(best, speaker))) best = c;
  return best;
}

/** ONE Jev call: for each candidate passage, its kind and whose words it carries. */
export async function jevClassify(passages, { apiKey = process.env.TYPESAFE_API_KEY, timeoutMs = 2500, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('no TYPESAFE_API_KEY');
  const state = passages.map((p, i) => `[${i + 1}] ${p.title || ''} — listed author: ${p.author || 'unknown'}\n${String(p.text || '').slice(0, 600)}`).join('\n\n');
  const speakers = { ...Object.fromEntries(Object.keys(SPEAKERS).map((s) => [s, `words of ${s}`])), author: 'the listed author’s own words', other: 'someone else, or unclear' };
  const questions = {};
  passages.forEach((_, i) => {
    questions[`k${i + 1}`] = { type: 'choice', instructions: `Passage [${i + 1}]: what kind of text is it?`, criteria: KINDS };
    questions[`s${i + 1}`] = { type: 'choice', instructions: `Passage [${i + 1}]: whose words does its central quoted or recalled content carry?`, criteria: speakers };
  });
  const res = await fetchImpl(JEV_ENDPOINT, {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'jev-latest', state, questions }), signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`jev HTTP ${res.status}`);
  const a = (await res.json()).answers || {};
  const pick = (x) => (x?.choice ?? x?.value ?? null);
  return passages.map((_, i) => ({ kind: pick(a[`k${i + 1}`]) || 'unknown', speaker: pick(a[`s${i + 1}`]) || 'other' }));
}

/** Exact-words lookup across the whole corpus (pure keyword, unfederated — one ranked list). */
async function defaultPhraseSearch(span, { religion } = {}) {
  const { hybridSearch } = await import('./search.js');
  const r = await hybridSearch(span, { limit: 20, semanticRatio: 0, federate: false, filters: religion ? { religion } : {} });
  return r.hits || [];
}

/**
 * @param {Array} hits  engine hits (text, title, author, authority, doc_id, paragraph_index, source_site…)
 * @returns {{ hits, resolved, error? }}  hits carry `_source` { kind, speaker, resolved, quoted_in? } where checked
 */
export async function resolveSources(hits, { classify = jevClassify, phraseSearch = defaultPhraseSearch, maxCandidates = 8 } = {}) {
  const idx = hits.map((h, i) => (needsResolution(h) ? i : -1)).filter((i) => i >= 0).slice(0, maxCandidates);
  if (!idx.length) return { hits: collapseCopies(hits), resolved: 0 };
  let verdicts;
  try { verdicts = await classify(idx.map((i) => hits[i])); }
  catch (err) { return { hits, resolved: 0, error: err.message }; }

  const out = [...hits];
  let resolved = 0;
  await Promise.all(idx.map(async (i, k) => {
    const hit = hits[i];
    const v = verdicts[k] || { kind: 'unknown', speaker: 'other' };
    const source = { kind: v.kind, speaker: v.speaker, resolved: false };
    if (v.kind !== 'original' && SPEAKERS[v.speaker]) {
      // Trace each quoted span (longest first) to the most authoritative copy that VERIFIABLY contains it.
      // A recollection with no quotation marks has nothing verbatim to trace — it stays, labelled.
      const spans = quoteSpans(hit.text).sort((a, b) => b.length - a.length).slice(0, 3);
      const traced = [];
      for (const span of spans) {
        const cands = (await phraseSearch(span, { religion: hit.religion }).catch(() => []))
          .filter((c) => containsQuote(c.text, span));
        const best = pickOriginal(cands, v.speaker);
        if (best && best.doc_id !== hit.doc_id && better(rank(best, v.speaker), rank(hit, v.speaker))) traced.push({ span, best });
      }
      const refs = traced.map(({ span, best }) => ({ span, doc_id: best.doc_id, paragraph_index: best.paragraph_index,
        title: best.title, author: best.author, source_url: best.source_url || null }));
      // A passage that IS a quotation is replaced by its original; commentary keeps its place with references.
      if (v.kind === 'quotation' && traced.length) {
        out[i] = { ...traced[0].best, _source: { ...source, resolved: true, quote_sources: refs,
          quoted_in: { doc_id: hit.doc_id, paragraph_index: hit.paragraph_index, title: hit.title, author: hit.author } } };
        resolved++;
        return;
      }
      if (refs.length) { out[i] = { ...hit, _source: { ...source, quote_sources: refs } }; resolved++; return; }
    }
    out[i] = { ...hit, _source: source };
  }));
  // A resolved original may already be in the list — keep the first occurrence only.
  const seen = new Set();
  return { hits: collapseCopies(out.filter((h) => (seen.has(h.id) ? false : seen.add(h.id)))), resolved };
}

/**
 * Same words, several documents (canonical, compilation, uploader copies): keep the best copy in the FIRST copy's
 * position and list the rest as `_source.also_in`. "Same" = one folded text contains the other's opening 160 chars.
 */
export function collapseCopies(hits) {
  const key = (h) => foldText(h.text).slice(0, 160);
  const groups = [];
  for (const h of hits) {
    const k = key(h), f = foldText(h.text);
    const g = k.length >= 60 && groups.find((x) => x.full.includes(k) || f.includes(x.key));
    if (g) g.members.push(h); else groups.push({ key: k, full: f, members: [h] });
  }
  return groups.map(({ members }) => {
    if (members.length === 1) return members[0];
    const speaker = members.find((m) => m._source?.speaker && SPEAKERS[m._source.speaker])?._source.speaker
      || Object.keys(SPEAKERS).find((s) => members.some((m) => isSpeaker(m.author, s)));
    const best = pickOriginal(members, speaker);
    const also_in = members.filter((m) => m !== best).map((m) => ({ doc_id: m.doc_id, paragraph_index: m.paragraph_index, title: m.title, author: m.author }));
    return { ...best, _source: { ...(best._source || {}), also_in } };
  });
}
