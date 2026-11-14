// CONTENT MAP (Chad 11-14, media-remaster-rules §8): the model marks which paragraphs are the talk and which are songs/prayers/MC/intros/thanks; this pure module
// turns the marks into cuts (recording seconds, word-snapped) that trim.js removes from the web copies. Deps: none (the model call is llm.js contentTalk).
export const CONTENT_V = 1;
export const KINDS = ['content', 'music', 'prayer', 'reading', 'mc', 'introduction', 'thanks', 'announcement', 'other'];
export const MARGIN_S = 0.3, GAP_MAX_S = 3, GAP_KEEP_S = 1.2, MAX_CUT_FRAC = 0.6, MIN_CUT_S = 1;

/** The prompt (lines = "[n @mm:ss S1] text" from llm.js; sound = [{a,b}] sustained music seconds from the quiet pass, optional). */
export function contentPrompt(lines, { hints = {}, minutes = 0, sound = [] } = {}) {
  const mm = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
  return `A transcript of a recorded event (${minutes} min; lines: [paragraph @time voice] text). Talk: ${JSON.stringify(hints)}.
Divide it into consecutive segments by what each is, so the recording can be cut down to its CONTENT: the talk(s) and the question-and-answer. Kinds:
content = the talk itself or its Q&A (also a speaker's own stories, jokes and asides) · music = singing, chanting, instruments, applause for a song · prayer = a devotional prayer or chant recited · reading = scripture or a text read aloud as a devotion, not quoted by the speaker inside the talk · mc = master of ceremonies remarks, logistics, housekeeping · introduction = someone introducing a speaker · thanks = thanks, farewells, closing remarks of the event · announcement = notices about other events · other = anything else that is not the talk.
Quotations the speaker uses to make a point stay content. When unsure, choose content. Cover every paragraph exactly once, in order.${sound.length ? `\nSound analysis heard sustained music at: ${sound.map((s) => `${mm(s.a)}-${mm(s.b)}`).join(', ')}.` : ''}
${lines}
Return JSON {"segments": [{"from_n": first paragraph number, "to_n": last paragraph number, "kind": "${KINDS.join('|')}", "why": "at most 8 words"}]}`;
}

/** Model output → clean segments over the real paragraph numbers, in order. Unknown kinds → other; paragraphs the model left uncovered stay content. Pure. */
export function parseSegments(raw, paragraphs) {
  const ns = paragraphs.map((p) => p.n), idx = new Map(ns.map((n, i) => [n, i]));
  const kind = new Array(ns.length).fill(null), why = new Array(ns.length).fill('');
  for (const s of Array.isArray(raw?.segments) ? raw.segments : []) {
    const a = idx.get(Number(s?.from_n)), b = idx.get(Number(s?.to_n));
    if (a == null || b == null || b < a) continue;
    const k = KINDS.includes(s.kind) ? s.kind : 'other';
    for (let i = a; i <= b; i++) if (kind[i] == null) { kind[i] = k; why[i] = String(s.why || '').slice(0, 80); }
  }
  const out = [];
  for (let i = 0; i < ns.length; i++) {
    const k = kind[i] ?? 'content', w = kind[i] == null ? 'not marked' : why[i], last = out[out.length - 1];
    if (last && last.kind === k && last.why === w) last.to_n = ns[i]; else out.push({ from_n: ns[i], to_n: ns[i], kind: k, why: w });
  }
  return out;
}

const wordsOf = (p) => (p.words || []).filter((w) => w && w.s != null && w.e != null);
const r2 = (x) => Math.round(x * 100) / 100;

/** The dead-gap cuts inside kept speech: two kept words with no cut between them and more than GAP_MAX_S apart lose their middle (GAP_KEEP_S stays). */
function gapCuts(keptWords, cuts) {
  const out = [], half = GAP_KEEP_S / 2;
  for (let i = 1; i < keptWords.length; i++) {
    const a = keptWords[i - 1], b = keptWords[i];
    if (b.s - a.e <= GAP_MAX_S) continue;
    if (cuts.some((c) => c.from < b.s && c.to > a.e)) continue;
    out.push({ from: r2(a.e + half), to: r2(b.s - half), kind: 'gap', why: `${(b.s - a.e).toFixed(1)} s of silence` });
  }
  return out;
}

/** Segments → cuts in recording seconds. Never inside a word (margins MARGIN_S from the nearest kept word); a safety fallback (cuts only the leading/trailing
 *  music and dead gaps, review recorded) when no content was marked or more than MAX_CUT_FRAC of the words would go. → { cuts, kept_s, review }. Pure. */
export function planCuts({ segments = [], paragraphs = [], duration = 0 } = {}) {
  const ps = paragraphs.filter((p) => wordsOf(p).length);
  const kindOf = new Map();
  for (const s of segments) for (const p of paragraphs) if (p.n >= s.from_n && p.n <= s.to_n) kindOf.set(p.n, { kind: s.kind, why: s.why });
  const total = ps.reduce((a, p) => a + wordsOf(p).length, 0);
  const build = (isCut) => {
    const cuts = [], kept = ps.filter((p) => !isCut(p));
    // runs of consecutive cut paragraphs of one kind → one cut, bounded by the neighbouring words
    let i = 0;
    while (i < ps.length) {
      if (!isCut(ps[i])) { i++; continue; }
      const k = kindOf.get(ps[i].n)?.kind || 'other';
      let j = i;
      while (j + 1 < ps.length && isCut(ps[j + 1]) && (kindOf.get(ps[j + 1].n)?.kind || 'other') === k) j++;
      const prev = i > 0 ? wordsOf(ps[i - 1]).at(-1) : null, next = j + 1 < ps.length ? wordsOf(ps[j + 1])[0] : null;
      const prevCut = i > 0 && isCut(ps[i - 1]), nextCut = j + 1 < ps.length && isCut(ps[j + 1]);
      // beside a cut of another kind the boundary is the midpoint of the silence between them; beside kept speech, MARGIN_S clear of its word
      const from = !prev ? 0 : prevCut ? (prev.e + wordsOf(ps[i])[0].s) / 2 : prev.e + MARGIN_S;
      const to = !next ? duration : nextCut ? (wordsOf(ps[j]).at(-1).e + next.s) / 2 : next.s - MARGIN_S;
      const why = [...new Set(ps.slice(i, j + 1).map((p) => kindOf.get(p.n)?.why).filter(Boolean))].slice(0, 3).join('; ');
      if (to - from >= MIN_CUT_S) cuts.push({ from: r2(from), to: r2(to), kind: k, why, pn: [ps[i].n, ps[j].n] });   // pn: the paragraphs it removes (ASR times can overlap a neighbour; the text follows the paragraphs)
      i = j + 1;
    }
    const keptWords = kept.flatMap(wordsOf);
    cuts.push(...gapCuts(keptWords, cuts));
    cuts.sort((a, b) => a.from - b.from);
    return { cuts, kept };
  };
  const isNon = (p) => (kindOf.get(p.n)?.kind || 'content') !== 'content';
  let res = build(isNon), review = null;
  const cutWords = ps.filter(isNon).reduce((a, p) => a + wordsOf(p).length, 0);
  if (!ps.some((p) => !isNon(p))) review = 'no content segment marked';
  else if (total && cutWords / total > MAX_CUT_FRAC) review = `cuts would remove ${Math.round((cutWords / total) * 100)} % of the words`;
  if (review) {
    // only the music before the first / after the last non-music paragraph, plus the dead gaps
    const first = ps.findIndex((p) => kindOf.get(p.n)?.kind !== 'music'), last = ps.length - 1 - [...ps].reverse().findIndex((p) => kindOf.get(p.n)?.kind !== 'music');
    const edge = new Set(first < 0 ? [] : ps.filter((p, i) => kindOf.get(p.n)?.kind === 'music' && (i < first || i > last)).map((p) => p.n));
    res = build((p) => edge.has(p.n));
  }
  const cuts = res.cuts.map((c) => ({ ...c, from: Math.max(0, c.from), to: Math.min(duration || c.to, c.to) })).filter((c) => c.to > c.from);
  const merged = [];
  for (const c of cuts) { if (merged.length && c.from < merged[merged.length - 1].to) merged[merged.length - 1].to = Math.max(merged[merged.length - 1].to, c.to); else merged.push({ from: c.from, to: c.to }); }
  return { cuts, kept_s: r2(Math.max(0, duration - merged.reduce((a, c) => a + (c.to - c.from), 0))), review };
}

/** The whole meta.content record from the model's raw JSON. Pure. */
export function contentRecord({ raw, paragraphs, duration, at = new Date().toISOString() }) {
  const segments = parseSegments(raw, paragraphs);
  const { cuts, kept_s, review } = planCuts({ segments, paragraphs, duration });
  return { v: CONTENT_V, segments, cuts, kept_s, ...(review ? { review } : {}), at };
}

/** The label a reader sees for a cut ("Opening song skipped"); where = 'opening' | 'closing' | null. */
export const CUT_LABEL = { music: 'song', prayer: 'prayer', reading: 'reading', mc: 'announcements', introduction: 'introduction', thanks: 'closing remarks', announcement: 'announcements', gap: 'silence', other: 'break' };
export const cutLabel = (c, duration = 0) => {
  const what = CUT_LABEL[c.kind] || 'break', where = c.from < 1 ? 'Opening ' : duration && c.to >= duration - 1 ? 'Closing ' : '';
  return `${where ? `${where}${what}` : what.charAt(0).toUpperCase() + what.slice(1)} skipped`;
};

const inCut = (t, cuts) => cuts.some((c) => t >= c.from && t < c.to);
/** The transcript a reader (and the search index, headings, quotes) sees: every word whose middle falls inside a cut is removed, a partly cut paragraph is shortened
 *  (t0/t1 follow its words), an emptied paragraph disappears. Times stay recording time; the input is not changed. Pure. */
export function contentParagraphs(paragraphs = [], cuts = []) {
  if (!cuts?.length) return paragraphs;
  const out = [];
  for (const p of paragraphs) {
    if (cuts.some((c) => c.pn && p.n >= c.pn[0] && p.n <= c.pn[1])) continue;
    const words = (p.words || []).filter((w) => !(w && w.s != null && w.e != null && inCut((w.s + w.e) / 2, cuts)));
    if (!words.length) continue;
    if (words.length === (p.words || []).length) { out.push(p); continue; }
    const ws = words.filter((w) => w.s != null && w.e != null);
    out.push({ ...p, words, t0: ws.length ? ws[0].s : p.t0, t1: ws.length ? ws.at(-1).e : p.t1, ...(p.text != null ? { text: words.map((w) => w.w).join(' ') } : {}) });
  }
  return out;
}

/** One divider per cut that took something out of the transcript or sits between kept paragraphs: [{ before_n, cut }] (before_n = the first kept paragraph after the cut; null at the very end). Pure. */
export function cutDividers(kept = [], cuts = [], duration = 0) {
  return (cuts || []).filter((c) => c.kind !== 'gap').map((c) => ({ before_n: kept.find((p) => p.t0 >= c.to - 1e-6)?.n ?? null, cut: c, label: cutLabel(c, duration) }));
}

/** meta → the cuts the listening copy actually has (meta.trim.cuts: what trim applied), else none. Pure. */
export const cutsOfMeta = (meta = {}) => meta?.trim?.cuts || [];
