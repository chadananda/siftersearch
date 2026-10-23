// THE COPY-EDIT PASS (Chad 10-22: "the LLM pass must clean SPELLING and ASR artifacts too, not only names"): per chunk of
// paragraphs the model (role media-clean) proposes small edits, each with a KIND and a confidence; a guard accepts only
// edits whose kind it can verify — a filler or stutter dropped, a looped repeat or a subtitle hallucination removed, a
// misspelling or homophone fixed (sounds alike), a capital or a sentence boundary changed (same letters), a broken word
// joined — and never a paraphrase. Dropped words are HIDDEN, not deleted (each keeps its time, so click-to-play and the
// highlight stay aligned); replaced words share their span's time. Every change is logged; low-confidence ones are only
// flagged for review. The verbatim words are kept beside the clean ones. Pure, except cleanParagraphs (model call injected).
// 10-22 (Chad: "you had the right context to see the obvious error"): the model reads ~12-minute chunks with neighbouring
// paragraphs, framed with who is speaking, the title and date, and uses its OWN knowledge of Bahá'í history, texts, names
// and Shoghi Effendi's transliteration to respell misheard names and titles (kind 'name'); it also returns the works and
// people the talk names (mentions) for the link stage. Every respelling still passes the guard; nothing is ever added.
import { keyOf, levenshtein, findSpan, applyEdits, addsWords } from './vocab.js';
import { sentencesOf } from './paragraphs.js';

export const FILLERS = new Set(['um', 'uh', 'umm', 'uhm', 'er', 'erm', 'ah', 'hmm', 'mm', 'mhm', 'eh']);
export const HALLUCINATION = /thanks? (?:you )?for watching|please subscribe|like and subscribe|subtitles? by|captions? by|transcri(?:bed|ption) by|amara\.org|translated by|www\.[a-z]+\.(?:com|org)|copyright ©/i;
export const KINDS = ['filler', 'stutter', 'repeat', 'hallucination', 'spelling', 'homophone', 'capitalisation', 'punctuation', 'broken', 'name'];
const DROPS = new Set(['filler', 'stutter', 'repeat', 'hallucination']);

const tokens = (s) => String(s || '').trim().split(/\s+/).filter(Boolean);
const keys = (s) => tokens(s).map(keyOf).filter(Boolean);
const letters = (s) => keyOf(String(s || '').replace(/\s+/g, ''));

/** A crude English sound key: vowels after the first letter dropped, common digraphs folded ("their" ~ "there", "two" ~ "too"). */
export function soundKey(w) {
  const k = keyOf(w).replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/gh/g, '').replace(/wh/g, 'w').replace(/kn/g, 'n').replace(/wr/g, 'r').replace(/(.)\1+/g, '$1');
  return k ? k[0] + k.slice(1).replace(/[aeiouy]/g, '') : '';
}

/**
 * Judge one proposed edit against the paragraph's words. → { ok: { i0, i1, to, kind, hide? } } or { refused: why } or
 * { flagged: why } (plausible but not certain: left for a person).
 */
const FUNCTION = new Set('a an the in on at to of or and but nor for so as by is are was were be been am him his her he she it its they them their we us our you your i me my this that these those there here who whom whose which what do does did not no if than then from with into onto upon up out off over'.split(' '));
export function judgeEdit(words, e, { minConfidence = 0.7 } = {}) {
  const kind = String(e?.kind || '').toLowerCase().replace('capitalization', 'capitalisation');
  let from = String(e?.from || '').trim(), to = String(e?.to ?? '').trim();
  // same word count: identical words at either end are context, not the edit (10-22: "all of a sudden He said" → "… he
  // said" was refused as too long; the edit is the one word "He")
  {
    const a = from.split(/\s+/), b = to.split(/\s+/);
    if (to && a.length === b.length && a.length > 1 && !DROPS.has(kind)) {
      while (a.length > 1 && a[0] === b[0]) { a.shift(); b.shift(); }
      while (a.length > 1 && a.at(-1) === b.at(-1)) { a.pop(); b.pop(); }
      from = a.join(' '); to = b.join(' ');
    }
  }
  if (!KINDS.includes(kind)) return { refused: `unknown kind "${e?.kind}"` };
  if (!from) return { refused: 'empty' };
  const fw = tokens(from), tw = tokens(to);
  const drop = DROPS.has(kind);
  if (fw.length > (drop ? 40 : 4)) return { refused: 'span too long' };
  const i0 = findSpan(words, from);
  if (i0 < 0) return { refused: 'not in the text' };
  const i1 = i0 + fw.length;
  const fk = keys(from), tk = keys(to);
  if (Number(e.confidence ?? 1) < minConfidence) return { flagged: `low confidence (${e.confidence})`, i0, i1, from, to, kind };

  if (kind === 'filler') {
    if (fk.length && fk.every((k) => FILLERS.has(k)) && !tk.length) return { ok: { i0, i1, kind, hide: true } };
    return { refused: 'not a filler' };
  }
  if (kind === 'hallucination') return HALLUCINATION.test(from) && !tk.length ? { ok: { i0, i1, kind, hide: true } } : { refused: 'not a known hallucination' };
  if (kind === 'stutter' || kind === 'repeat') {
    // what stays must be the end of the span (the last saying), and everything dropped must repeat it or start it
    if (!tk.length || tk.length >= fk.length) return { refused: 'nothing dropped' };
    const tail = fk.slice(fk.length - tk.length);
    if (tail.join(' ') !== tk.join(' ')) return { refused: 'the kept words are not the last saying' };
    const dropped = fk.slice(0, fk.length - tk.length);
    const repeats = dropped.every((k, i) => tk.includes(k) || tk.some((t) => t.startsWith(k) && k.length >= 1) || k === dropped[i - 1]);
    if (!repeats) return { refused: 'dropped words are not a repeat' };
    return { ok: { i0, i1: i0 + dropped.length, kind, hide: true } };
  }
  if (kind === 'capitalisation') return fk.join(' ') === tk.join(' ') && fw.length === tw.length ? { ok: { i0, i1, kind, to } } : { refused: 'not only the case' };
  if (kind === 'punctuation') return fk.join('') === tk.join('') && fw.length === tw.length ? { ok: { i0, i1, kind, to } } : { refused: 'letters changed' };
  if (kind === 'broken') return letters(from) === letters(to) && tw.length < fw.length ? { ok: { i0, i1, kind, to } } : { refused: 'not a broken word' };
  if (kind === 'name') {
    // a misheard proper name or title respelt: never more words than heard, and it must sound like what was heard
    if (addsWords(from, to)) return { refused: 'adds words the speaker did not say' };
    const a = fk.join(''), b = tk.join('');
    const allowed = Math.max(2, Math.ceil(Math.max(a.length, b.length) * 0.45));
    if (!a || !b || (levenshtein(a, b, allowed) > allowed && soundKey(a) !== soundKey(b))) return { refused: 'does not sound alike' };
    return { ok: { i0, i1, kind, to } };
  }
  if (kind === 'spelling' || kind === 'homophone') {
    if (fw.length !== tw.length || fw.length > 4) return { refused: 'a spelling fix keeps the word count' };
    // a FUNCTION word swapped for another ("is in" → "is him", "or" → "are": QA 10-22, the copy-edit worse than the ASR) —
    // ASR hears these reliably; a change between two of them is a guess
    // (a true homophone — their/there, to/too — sounds the same and still passes)
    if (fk.some((k, i) => k !== tk[i] && FUNCTION.has(k) && FUNCTION.has(tk[i]) && soundKey(k) !== soundKey(tk[i]))) return { refused: 'a function word swapped for another' };
    for (let i = 0; i < fk.length; i++) {
      const a = fk[i], b = tk[i];
      const close = levenshtein(a, b, 9) <= Math.max(2, Math.ceil(Math.max(a.length, b.length) * 0.34));
      const sound = soundKey(a) && soundKey(a) === soundKey(b);
      if (!(kind === 'spelling' ? close : (sound || close))) return { refused: 'does not sound alike' };
    }
    return { ok: { i0, i1, kind, to } };
  }
  return { refused: 'unhandled' };
}

/** Apply judged edits to a paragraph's words → new words. Hidden words keep text and time with hide: true; replacements
 *  keep a token-for-token time when the count matches, else share the span's time (applyEdits). */
export function applyClean(words, oks) {
  let ws = words.map((w) => ({ ...w }));
  const replace = [];
  for (const e of oks) {
    if (e.hide) {
      for (let k = e.i0; k < e.i1; k++) ws[k] = { ...ws[k], hide: true };
      // a stutter keeps the LAST saying: it takes the case of the first ("wrapped in In a paper" → "wrapped in a paper")
      const first = words[e.i0]?.w || '', kept = ws[e.i1];
      if (e.kind === 'stutter' && kept && /^\p{Ll}/u.test(first) && /^\p{Lu}\p{Ll}*$/u.test(kept.w) && first.toLowerCase().startsWith(kept.w.toLowerCase().slice(0, 1)) && e.i0 > 0 && !/[.!?]["”’)]*$/.test(words[e.i0 - 1]?.w || ''))
        ws[e.i1] = { ...kept, w: kept.w[0].toLowerCase() + kept.w.slice(1), v: kept.v ?? kept.w };
      continue;
    }
    const tw = tokens(e.to);
    // a respelling or a capital keeps the word's own edge punctuation unless the edit is about punctuation
    const keepPunct = !['punctuation', 'broken'].includes(e.kind);
    const edge = (orig, t) => {
      if (!keepPunct) return t;
      const head = (orig.match(/^[("“‘'\[]+/) || [''])[0], tail = (orig.match(/[)"”’'\],.;:!?؟]+$/) || [''])[0];
      return `${/^[("“‘'\[]/.test(t) ? '' : head}${t}${/[)"”'\],.;:!?؟]$/.test(t) ? '' : tail}`;
    };
    if (tw.length === e.i1 - e.i0) tw.forEach((t0, j) => { const o = ws[e.i0 + j].w, t = edge(o, t0); if (o !== t) ws[e.i0 + j] = { ...ws[e.i0 + j], w: t, v: ws[e.i0 + j].v ?? o }; });
    else replace.push({ i0: e.i0, i1: e.i1, to: e.to });
  }
  if (replace.length) ws = applyEdits(ws, replace);
  return ws;
}

/** Judge a paragraph's proposals: non-overlapping accepted edits, refusals and flags. */
export function judgeAll(words, proposals, opts) {
  const ok = [], refused = [], flagged = [], used = new Set();
  for (const e of proposals || []) {
    const j = judgeEdit(words, e, opts);
    if (j.refused) { refused.push({ from: e?.from, to: e?.to, kind: e?.kind, why: j.refused }); continue; }
    if (j.flagged) { flagged.push({ from: e.from, to: e.to, kind: e.kind, why: j.flagged }); continue; }
    const span = [...Array(j.ok.i1 - j.ok.i0).keys()].map((k) => j.ok.i0 + k);
    if (span.some((k) => used.has(k))) { refused.push({ from: e.from, to: e.to, kind: e.kind, why: 'overlaps another edit' }); continue; }
    span.forEach((k) => used.add(k));
    ok.push({ ...j.ok, from: words.slice(j.ok.i0, j.ok.i1).map((w) => w.w).join(' ') });
  }
  return { ok: ok.sort((a, b) => b.i0 - a.i0), refused, flagged };
}

const displayText = (p) => p.words.filter((w) => !w.hide).map((w) => w.w).join(' ');
const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

/** Chunks of ~chunkSeconds of audio (paragraph numbers), each with up to 2 paragraphs before and 1 after as read-only context. */
export function chunksOf(paragraphs, { chunkSeconds = 720 } = {}) {
  const out = [];
  let cur = [], t0 = null;
  for (const p of paragraphs) {
    if (t0 == null) t0 = p.t0;
    cur.push(p.n);
    if (p.t1 - t0 >= chunkSeconds) { out.push(cur); cur = []; t0 = null; }
  }
  if (cur.length) out.push(cur);
  const idx = new Map(paragraphs.map((p, i) => [p.n, i]));
  return out.map((ns) => {
    const a = idx.get(ns[0]), b = idx.get(ns[ns.length - 1]);
    return { edit: ns, before: paragraphs.slice(Math.max(0, a - 2), a).map((p) => p.n), after: paragraphs.slice(b + 1, b + 2).map((p) => p.n) };
  });
}

/** The framing prompt for one chunk. ctx: { speaker, title, date, year, event, place, language, summary }. */
export function cleanPrompt(ctx, lines) {
  const about = [ctx.speaker && `Speaker: ${ctx.speaker}`, ctx.title && `Title: ${ctx.title}`, (ctx.date || ctx.year) && `Date: ${ctx.date || ctx.year}`,
    ctx.series && `Series: ${ctx.series}${ctx.part ? ` (part ${ctx.part})` : ''} — its title and the work it studies are named often; spell them exactly`,
    ctx.event && `Event: ${ctx.event}`, ctx.place && `Place: ${ctx.place}`, ctx.summary && `About: ${ctx.summary}`].filter(Boolean).join('\n');
  return `You copy-edit a speech-recognition transcript of a recorded Bahá'í talk.
${about}

Use your own knowledge of Bahá'í history, the Writings, the names of people, places and works, and Shoghi Effendi's system of transliteration (as printed in Bahá'í books: Bahá’u’lláh, ‘Abdu’l-Bahá, the Báb, Ṭáhirih, Mullá Ḥusayn, Nabíl’s Narrative, Kitáb-i-Íqán) to correct OBVIOUS mishearings, e.g. "Nabips Narrative" → "Nabíl’s Narrative", "the Baab" → "the Báb".
Keep it VERBATIM-FAITHFUL: never paraphrase, summarise, reorder, add words or improve the speaker's wording; never add titles, dates, volume numbers or explanations; quotations stay exactly as spoken.
Edit kinds:
- name: a misheard or misspelt proper name, title of a work, or religious term → its correct spelling (as few words as possible; never more words than were heard)
- filler: drop "um", "uh", "er", "ah", "hmm" (to = "")
- stutter: a false start or stammer ("the the", "I- I think") → only the last saying
- repeat: an ASR loop (the same phrase repeated by mistake) → one copy
- hallucination: an invented line in a silence ("Thank you for watching", subtitle credits) → to = ""
- spelling: a misspelt ordinary word (same number of words)
- homophone: a mis-heard ordinary word that sounds alike, clear from context
- capitalisation: wrong capitals only. House style for pronouns: capitalise He / Him / His only for God and the Manifestations and Central Figures (Bahá’u’lláh, the Báb, Christ, Muḥammad, and by usage ‘Abdu’l-Bahá); never for Shoghi Effendi or anyone else. Decide from context who "he" refers to.
- punctuation: a wrong sentence boundary → same words, corrected punctuation and capitals
- broken: one word split apart → joined
Each edit: "p" = paragraph number, "from" = the exact words from that paragraph (as few as possible), "to", "kind", "confidence" 0-1 (below 0.7 when unsure — only flagged for a person). Only edit paragraphs marked EDIT; lines marked CONTEXT are for reading only.
Also list MENTIONS in the EDIT paragraphs: every work the speaker names (a book, tablet, prayer, letter, compilation) and every historical person named or referred to by a title ("the Master", "the Guardian", "the Blessed Beauty"): "p", "text" = the words as they will read after your edits, "kind" = "work" or "person", "canonical" = the work's full title or the person's full name in Shoghi Effendi's spelling, "section" = the chapter or part referred to, if any, "confidence" 0-1.

${lines}

Return JSON {"edits":[{"p":0,"from":"…","to":"…","kind":"…","confidence":0.0}],"mentions":[{"p":0,"text":"…","kind":"work","canonical":"…","section":null,"confidence":0.0}]}`;
}

async function pool(items, n, fn) {
  const out = new Array(items.length);
  let next = 0;
  const worker = async () => { for (let i = next++; i < items.length; i = next++) out[i] = await fn(items[i], i); };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(n, items.length)) }, worker));
  return out;
}

/** The pass over a transcript. ask(prompt) → parsed JSON { edits, mentions }. ctx: talk framing (cleanPrompt).
 *  → { paragraphs, log, stats, mentions } */
export async function cleanParagraphs(paragraphs, ask, { chunkSeconds = 720, ctx = {}, fanout = Number(process.env.MEDIA_LLM_FANOUT) || 4 } = {}) {
  const byN = new Map(paragraphs.map((p) => [p.n, { ...p, words: p.words.map((w) => ({ ...w })) }]));
  const log = [], stats = { applied: 0, hidden_words: 0, refused: 0, flagged: 0, by_kind: {}, mentions: 0 };
  const mentions = [];
  // every chunk reads the VERBATIM words (its context lines too), so the calls run at once (10-22: ~113 s one after another);
  // the edits are applied chunk by chunk, in order
  const chunks = chunksOf(paragraphs, { chunkSeconds });
  const line = (pn, tag) => { const p = byN.get(pn); return `[${pn} @${mmss(p.t0)} ${tag}] ${displayText(p)}`; };
  const prompts = chunks.map((ch) => cleanPrompt(ctx, [...ch.before.map((n) => line(n, 'CONTEXT')), ...ch.edit.map((n) => line(n, 'EDIT')), ...ch.after.map((n) => line(n, 'CONTEXT'))].join('\n')));
  const outs = await pool(prompts, fanout, (pr) => ask(pr));
  for (const [ci, ch] of chunks.entries()) {
    const out = outs[ci];
    const own = new Set(ch.edit);
    const byP = new Map();
    for (const e of out?.edits || []) { const pn = Number(e?.p); if (!own.has(pn)) continue; if (!byP.has(pn)) byP.set(pn, []); byP.get(pn).push(e); }
    for (const [pn, edits] of byP) {
      const p = byN.get(pn);
      const j = judgeAll(p.words, edits);
      for (const e of j.ok) {
        log.push({ p: pn, at: p.words[e.i0]?.s ?? null, kind: e.kind, from: e.from, to: e.hide ? '' : e.to });
        stats.applied++; stats.by_kind[e.kind] = (stats.by_kind[e.kind] || 0) + 1;
        if (e.hide) stats.hidden_words += e.i1 - e.i0;
      }
      stats.refused += j.refused.length; stats.flagged += j.flagged.length;
      for (const f of j.flagged) log.push({ p: pn, flagged: true, kind: f.kind, from: f.from, to: f.to, why: f.why });
      for (const r of j.refused) log.push({ p: pn, refused: true, kind: r.kind, from: r.from, to: r.to, why: r.why });
      p.words = applyClean(p.words, j.ok);
    }
    // mentions are located on the EDITED words (their text is as it will read); unlocatable ones are dropped
    for (const m of out?.mentions || []) {
      const pn = Number(m?.p), p = byN.get(pn);
      if (!own.has(pn) || !p || !m.text || !['work', 'person'].includes(m.kind)) continue;
      const vis = p.words.map((w, i) => ({ ...w, i })).filter((w) => !w.hide);
      const k = findSpan(vis, String(m.text));
      if (k < 0) continue;
      const n = String(m.text).trim().split(/\s+/).length;
      mentions.push({ para: pn, i0: vis[k].i, i1: vis[k + n - 1].i + 1, text: vis.slice(k, k + n).map((w) => w.w).join(' '), kind: m.kind,
        canonical: String(m.canonical || '').slice(0, 200) || null, section: m.section ? String(m.section).slice(0, 120) : null, confidence: Number(m.confidence) || 0 });
    }
  }
  stats.mentions = mentions.length;
  // the paragraph's sentences are word ranges: applyEdits may change the count (a broken word joined) — rebuild them
  const fixed = paragraphs.map((p0) => {
    const p = byN.get(p0.n);
    if (p.words.length === p0.words.length) return p;
    return { ...p, sentences: sentencesOf(p.words).map((x) => [x.i0, x.i1]) };
  });
  return { paragraphs: fixed, log, stats, mentions };
}
