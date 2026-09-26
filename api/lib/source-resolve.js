// Source resolution for RAW search: every quote served from its IDEAL source, duplicates from secondary sources
// dropped (listed as also_in), each checked passage labelled (original / quotation / recollection / commentary) with
// whose words it carries. Chad, 2026-09-25: "the raw search results should provide correct metadata, quotes and
// references"; "re-ranking, preferably with JEV"; "OceanLibrary is the primary source, all others are supplementary";
// "the source book comes before books quoting it — the Iqan comes before Gleanings for the same quote and both come
// before compilations".
// Flow: copies found DETERMINISTICALLY (exact words, verified containment) → ONE Jev call judges every passage and
// every group of copies → the choice is bounded by policy (an OceanLibrary copy always beats a supplementary one) →
// deterministic fallback when Jev abstains or fails. Deps (injectable): Jev, hybridSearch, docs-repo getLinkMeta.
import { quoteSpans, containsQuote, foldText } from './quote-text.js';
import { ENDPOINT as JEV_ENDPOINT } from './scope-extract.js';
import { linkFor } from './source-links.js';

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
// Selections/anthologies of one author's writings (Gleanings) and compilations: excellent sources, but not where the
// words first appear. Backstop only — Jev makes the judgment; this orders the fallback.
const SELECTION = /\bgleanings\b|\bselections?\s+from\b|\bcompil|\bcompiled\b|sacred writings|\blights of guidance\b|\bworld faith\b|\banthology\b/;

const isSpeaker = (author, speaker) => (SPEAKERS[speaker] || []).some((n) => foldText(author).includes(n));
const isCentral = (author) => Object.keys(SPEAKERS).some((s) => isSpeaker(author, s));
const speakerOf = (hits) => Object.keys(SPEAKERS).find((s) => hits.some((h) => isSpeaker(h.author, s)));

/** Worth checking? It quotes; or it is not by a central figure; or it is a central figure's text NOT on OceanLibrary;
 *  or it is on OceanLibrary but without the paragraph id (a duplicate of the OceanLibrary site copy, e.g. Paris Talks 8320). */
export function needsCheck(hit, tier, paraLevel = true) {
  return quoteSpans(hit.text).length > 0 || !isCentral(hit.author) || (tier ?? 5) > 1 || ((tier ?? 5) === 1 && !paraLevel);
}

// Policy ranking, most important first:
//   OceanLibrary (primary) above anything supplementary → the speaker's own work → the ORIGINAL work above a
//   selection/anthology/compilation of it → recorded authority (missing = 0, so uploader copies sink) → better tier.
//   A paragraph-level OceanLibrary link comes AFTER original-before-anthology, so it never lifts Gleanings over the Íqán.
const rank = (h, speaker, tiers, para = new Map()) => {
  const t = tiers.get(h.id) ?? 5;
  return [t === 1 ? 1 : 0, isSpeaker(h.author, speaker) ? 1 : 0, SELECTION.test(foldText(h.title)) ? 0 : 1,
    para.get(h.id) ? 1 : 0, Number(h.authority) || 0, -t];
};
const better = (a, b) => { for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return a[i] > b[i]; return false; };

/** Best copy by policy alone (the fallback when Jev abstains or fails). */
export function deterministicPick(options, speaker, tiers, para = new Map()) {
  let best = null;
  for (const o of options || []) if (!best || better(rank(o, speaker, tiers, para), rank(best, speaker, tiers, para))) best = o;
  return best;
}

const bookOf = (url) => String(url || '').split('?')[0].replace(/\/+$/, '');

// Jev chooses WITHIN policy: if any OceanLibrary copy exists, only OceanLibrary copies are eligible.
// Same OceanLibrary book held twice: serve the copy that carries OceanLibrary's paragraph ids.
function choose(options, choiceId, speaker, tiers, para = new Map()) {
  const primary = options.filter((o) => tiers.get(o.id) === 1);
  const eligible = primary.length ? primary : options;
  const best = eligible.find((o) => o.id === choiceId) || deterministicPick(eligible, speaker, tiers, para);
  if (best && !para.get(best.id)) {
    const twin = eligible.find((o) => o !== best && para.get(o.id) && bookOf(o.source_url) && bookOf(o.source_url) === bookOf(best.source_url));
    if (twin) return twin;
  }
  return best;
}

/** ONE Jev call: each passage's kind + speaker, and each copy group's ideal source. */
export async function jevJudge({ passages, groups }, { apiKey = process.env.TYPESAFE_API_KEY, timeoutMs = 3000, fetchImpl = fetch } = {}) {
  if (!apiKey) throw new Error('no TYPESAFE_API_KEY');
  const speakers = { ...Object.fromEntries(Object.keys(SPEAKERS).map((s) => [s, `words of ${s}`])), author: 'the listed author’s own words', other: 'someone else, or unclear' };
  const state = [
    ...passages.map((p, i) => `[P${i + 1}] ${p.title || ''} — listed author: ${p.author || 'unknown'}\n${String(p.text || '').slice(0, 500)}`),
    ...groups.map((g) => `[${g.key}] documents that all contain the SAME words: “${g.span.slice(0, 120)}”`),
  ].join('\n\n');
  const questions = {};
  passages.forEach((_, i) => {
    questions[`k${i + 1}`] = { type: 'choice', instructions: `Passage [P${i + 1}]: what kind of text is it?`, criteria: KINDS };
    questions[`s${i + 1}`] = { type: 'choice', instructions: `Passage [P${i + 1}]: whose words does its central quoted or recalled content carry?`, criteria: speakers };
  });
  for (const g of groups) {
    questions[g.key] = {
      type: 'choice',
      instructions: `[${g.key}]: which document is the SOURCE to cite for these words? OceanLibrary is the primary library; others are supplementary. The source is the ORIGINAL work in which the words first appear (e.g. the Kitáb-i-Íqán), which comes before a selection or anthology of the same author's writings (e.g. Gleanings), which comes before compilations, biographies, study guides, pilgrim notes, periodicals, and older or provisional translations.`,
      criteria: Object.fromEntries(g.options.map((o) => [`c${o.id}`,
        `${o.title || 'Untitled'} — ${o.author || 'unknown author'} — ${o.site}${o.collection ? ` — ${o.collection}` : ''}`])),
    };
  }
  const res = await fetchImpl(JEV_ENDPOINT, {
    method: 'POST', headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: 'jev-latest', state, questions }), signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`jev HTTP ${res.status}`);
  const a = (await res.json()).answers || {};
  const pick = (x) => (x?.choice ?? x?.value ?? null);
  return {
    verdicts: passages.map((_, i) => ({ kind: pick(a[`k${i + 1}`]) || 'unknown', speaker: pick(a[`s${i + 1}`]) || 'other' })),
    choices: Object.fromEntries(groups.map((g) => [g.key, Number(String(pick(a[g.key]) || '').replace(/^c/, '')) || null])),
  };
}

async function defaultPhraseSearch(span, { religion } = {}) {
  const { hybridSearch } = await import('./search.js');
  const r = await hybridSearch(span, { limit: 20, semanticRatio: 0, federate: false, filters: religion ? { religion } : {} });
  return r.hits || [];
}
async function defaultLinkMeta(ids) {
  const { getLinkMeta } = await import('./docs-repo.js');
  return getLinkMeta(ids);
}

const ref = (h) => ({ doc_id: h.doc_id, paragraph_index: h.paragraph_index, title: h.title, author: h.author });
// Opening words of a passage — how a central figure's text finds its OceanLibrary copy when it has no quotation marks.
const opening = (text) => String(text || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, 14).join(' ');

/**
 * @param {Array} hits  engine hits (id, doc_id, paragraph_index, text, title, author, authority, source_url, religion…)
 * @returns {{ hits, resolved, error? }}
 */
export async function resolveSources(hits, { judge = jevJudge, phraseSearch = defaultPhraseSearch, linkMeta = defaultLinkMeta, maxChecks = 8, deadline = null } = {}) {
  const tiers = new Map();
  const para = new Map();   // id → carries a paragraph-level link
  const tierFor = async (list) => {
    const need = list.filter((h) => !tiers.has(h.id));
    if (!need.length) return;
    const meta = await linkMeta(need.map((h) => h.doc_id)).catch(() => new Map());
    for (const h of need) {
      const m = meta.get(Number(h.doc_id)) || meta.get(h.doc_id) || {};
      const l = linkFor({ ...m, ...h, source_url: h.source_url || m.source_url || null, metadata: m.metadata }, h.paragraph_index);
      tiers.set(h.id, l.tier);
      para.set(h.id, l.tier === 1 ? l.paragraph_level : false);
    }
  };
  const t0 = Date.now();
  const left = () => (deadline ? deadline - Date.now() : Infinity);
  const ms = {};
  await tierFor(hits);
  ms.meta = Date.now() - t0;

  const checkIdx = hits.map((h, i) => (needsCheck(h, tiers.get(h.id), para.get(h.id)) ? i : -1)).filter((i) => i >= 0).slice(0, maxChecks);
  if (!checkIdx.length) return { hits: collapseCopies(hits, tiers, para), resolved: 0, ms };

  // 1. Copies, deterministically: exact words, containment verified. mode 'quote' = words it quotes; 'copy' = the
  //    passage itself (a central figure's text held outside OceanLibrary).
  const groups = [];
  await Promise.all(checkIdx.map(async (i) => {
    const hit = hits[i];
    const spans = quoteSpans(hit.text).sort((a, b) => b.length - a.length).slice(0, 3).map((s) => ({ span: s, mode: 'quote' }));
    const t = tiers.get(hit.id) ?? 5;
    const olWithoutPara = t === 1 && !para.get(hit.id);
    if (!spans.length && ((isCentral(hit.author) && t > 1) || olWithoutPara)) spans.push({ span: opening(hit.text), mode: 'copy' });
    for (const [s, { span, mode }] of spans.entries()) {
      if (span.split(' ').length < 5) continue;
      // Bounded by the deadline: a copy check that cannot finish in time is skipped, not waited for.
      const budget = Math.max(100, left());
      const found = (await Promise.race([phraseSearch(span, { religion: hit.religion }).catch(() => []),
        new Promise((r) => setTimeout(() => r([]), budget))])).filter((c) => containsQuote(c.text, span));
      const options = [hit, ...found].filter((o, k, arr) => arr.findIndex((x) => x.id === o.id) === k);
      if (options.length > 1) groups.push({ key: `g${i}_${s}`, i, span, mode, options });
    }
  }));
  ms.phrase = Date.now() - t0 - ms.meta;
  await tierFor(groups.flatMap((g) => g.options));
  for (const g of groups) g.options = g.options.map((o) => ({ ...o, site: tiers.get(o.id) === 1 ? 'oceanlibrary.com' : tiers.get(o.id) === 5 ? 'siftersearch.com' : 'supplementary' }));

  // 2. ONE Jev call for every passage and group.
  const passages = checkIdx.map((i) => hits[i]);
  let verdicts = passages.map(() => ({ kind: 'unknown', speaker: 'other' }));
  let choices = {};
  let error = null;
  try {
    // Bounded by the search deadline: a late judge degrades to the deterministic policy pick, never a slow answer.
    const t2 = Date.now();
    const j = await judge({ passages, groups: groups.map(({ key, span, options }) => ({ key, span, options })) },
      // Floor 600ms: below that the judge times out on nearly every query and quote re-sourcing silently stops
      // (measured 2026-09-26: plan+embedding+engine already spend the 1s before the judge starts).
      deadline ? { timeoutMs: Math.max(600, left()) } : undefined);
    ms.judge = Date.now() - t2;
    verdicts = j.verdicts || verdicts;
    choices = j.choices || {};
  } catch (err) { error = err.message; }

  // 3. Apply, bounded by policy.
  const out = [...hits];
  let resolved = 0;
  checkIdx.forEach((i, k) => {
    const hit = hits[i];
    const v = verdicts[k] || { kind: 'unknown', speaker: 'other' };
    const source = { kind: v.kind, speaker: v.speaker, resolved: false };
    const mine = groups.filter((g) => g.i === i);
    const speaker = SPEAKERS[v.speaker] ? v.speaker : speakerOf(mine.flatMap((g) => g.options)) || speakerOf([hit]);

    const copy = mine.find((g) => g.mode === 'copy');
    if (copy) {
      const best = choose(copy.options, choices[copy.key], speaker, tiers, para);
      if (best && best.id !== hit.id) {
        out[i] = { ...best, _source: { ...source, kind: v.kind === 'unknown' ? 'original' : v.kind, resolved: true,
          also_in: copy.options.filter((o) => o.id !== best.id).map(ref) } };
        resolved++;
        return;
      }
    }
    const quoteGroups = mine.filter((g) => g.mode === 'quote');
    if (quoteGroups.length && v.kind !== 'original' && SPEAKERS[v.speaker]) {
      const picks = quoteGroups.map((g) => ({ g, best: choose(g.options.filter((o) => o.doc_id !== hit.doc_id), choices[g.key], speaker, tiers, para) }))
        .filter((x) => x.best);
      const refs = picks.map(({ g, best }) => ({ span: g.span, ...ref(best), source_url: best.source_url || null }));
      if (v.kind === 'quotation' && picks.length) {
        const { g, best } = picks[0];
        out[i] = { ...best, _source: { ...source, resolved: true, quote_sources: refs, quoted_in: ref(hit),
          also_in: g.options.filter((o) => o.id !== best.id && o.id !== hit.id).map(ref) } };
        resolved++;
        return;
      }
      if (refs.length) { out[i] = { ...hit, _source: { ...source, quote_sources: refs } }; resolved++; return; }
    }
    out[i] = { ...hit, _source: source };
  });

  const seen = new Set();
  const unique = out.filter((h) => (seen.has(h.id) ? false : seen.add(h.id)));
  return { hits: collapseCopies(unique, tiers, para), resolved, ms, ...(error ? { error } : {}) };
}

/**
 * Same words, several documents among the results: keep the policy-best copy in the FIRST copy's position and list the
 * rest as `_source.also_in`. "Same" = one folded text contains the other's opening 160 characters.
 */
export function collapseCopies(hits, tiers = new Map(), para = new Map()) {
  const groups = [];
  for (const h of hits) {
    const f = foldText(h.text);
    const k = f.slice(0, 160);
    const g = k.length >= 60 && groups.find((x) => x.full.includes(k) || f.includes(x.key));
    if (g) g.members.push(h); else groups.push({ key: k, full: f, members: [h] });
  }
  return groups.map(({ members }) => {
    if (members.length === 1) return members[0];
    const speaker = members.find((m) => SPEAKERS[m._source?.speaker])?._source.speaker || speakerOf(members);
    const best = deterministicPick(members, speaker, tiers, para);
    const prior = best._source?.also_in || [];
    const also_in = [...prior, ...members.filter((m) => m !== best).map(ref)];
    return { ...best, _source: { ...(best._source || {}), also_in } };
  });
}
