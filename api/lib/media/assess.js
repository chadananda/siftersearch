// WHOLE-TALK ASSESSMENT (Chad 10-22): AUDIENCE — "public <> internal, so that we know which ones would be good introductory
// material vs which ones are unintelligible except to a Bahá'í audience" (a tradition-agnostic rubric, per talk and per
// subheader section) — and MOMENTS — "interesting excerptable statements that make unique claims or otherwise characterize
// what is special about the talk", each a VERBATIM span of the clean words with exact times, verified to stand on its own.
// One model read of the whole talk proposes both; this module validates, locates and scores. Pure (model calls injected).
import { createHash } from 'crypto';
import { keyOf } from './vocab.js';

export const ASSESS_VERSION = 1;
export const LABELS = { 1: 'Open to all', 2: 'Good for newcomers', 3: 'For the community', 4: 'Deepened', 5: 'Internal' };
/** Listing presets (Chad: "Good for newcomers", "For Bahá'ís", "Internal"; the label names the tradition at display time). */
export const PRESETS = { newcomers: [1, 2], community: [3, 4], internal: [5] };
export const KINDS = ['claim', 'anecdote', 'insight', 'memorable line'];

export const RUBRIC = `AUDIENCE (1–5), for any religious tradition:
1 open / introductory — no prior knowledge needed; a stranger to the faith follows everything
2 seeker-friendly — some of the tradition's terms, but explained or clear from context
3 general community — assumes a member's ordinary familiarity (central figures, basic practices)
4 deepened — assumes study: scripture, history, covenant/authority questions, untranslated terms, unexplained names
5 internal / administrative — addressed to the community's own bodies or business, or only meaningful inside it: an
  address to delegates at a convention, the business of an assembly or council, plans, goals and statistics, fundraising
  appeals to members, membership or discipline matters (e.g. Covenant-breaking / excommunication and shunning)`;

const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const visible = (p) => p.words.map((w, i) => ({ ...w, i })).filter((w) => !w.hide);

/** Sections: the subheaders (else the chapters, else the whole talk) as paragraph ranges with times. */
export function sectionsOf(paragraphs, headings = [], chapters = []) {
  const starts = (headings.length ? headings.map((h) => ({ p: h.p, title: h.text, slug: h.slug }))
    : chapters.map((c) => ({ p: c.p, title: c.title }))).filter((s) => paragraphs.some((p) => p.n === s.p)).sort((a, b) => a.p - b.p);
  if (!starts.length || starts[0].p !== paragraphs[0]?.n) starts.unshift({ p: paragraphs[0]?.n, title: 'Opening' });
  return starts.map((s, k) => {
    const next = starts[k + 1];
    const ps = paragraphs.filter((p) => p.n >= s.p && (!next || p.n < next.p));
    return { k: k + 1, ...s, t0: ps[0]?.t0 ?? 0, t1: ps.at(-1)?.t1 ?? 0 };
  });
}

/** The talk as the model reads it: section markers, then "[n @mm:ss] text" lines. */
export function assessLines(paragraphs, sections) {
  const at = new Map(sections.map((s) => [s.p, s]));
  return paragraphs.map((p) => `${at.has(p.n) ? `## §${at.get(p.n).k} ${at.get(p.n).title}\n` : ''}[${p.n} @${mmss(p.t0)}] ${visible(p).map((w) => w.w).join(' ')}`).join('\n');
}

export function assessPrompt(ctx, lines) {
  const about = [ctx.speaker && `Speaker: ${ctx.speaker}`, ctx.title && `Title: ${ctx.title}`, (ctx.date || ctx.year) && `Date: ${ctx.date || ctx.year}`,
    ctx.event && `Event: ${ctx.event}`, ctx.tradition && `Tradition: ${ctx.tradition}`].filter(Boolean).join('\n');
  return `You assess a transcript of a recorded talk for a public library of religious talks.
${about}

${RUBRIC}

1. Rate the whole talk and each section (§k) on the AUDIENCE scale. Judge from the words: how much is explained, what knowledge is assumed, the setting and the intended listeners. A rationale of at most two sentences. For each section give "intro": a short phrase naming what it would introduce to a newcomer, or null.
2. Choose 3–8 MOMENTS: the distinctive claims, memorable lines, vivid anecdotes and characteristic insights that show what is special about this talk. Each is 1–4 consecutive sentences copied EXACTLY from one paragraph (verbatim, same words; no paraphrase, no joining of separate places), that makes sense on its own and does not misrepresent the speaker when isolated. Give a context line of at most 15 words for a reader who has not heard the talk, a kind (claim | anecdote | insight | memorable line), 1–3 topics, and why it is notable (for the editors).

${lines}

Return JSON {"audience":{"score":1,"rationale":"…","signals":{"jargon":"low|some|high","assumed_knowledge":"…","setting":"…","listeners":"…"}},"sections":[{"k":1,"score":1,"rationale":"…","intro":"…|null"}],"moments":[{"p":0,"text":"exact words","context":"…","kind":"claim","topics":["…"],"why":"…"}]}`;
}

/** Whole-talk and per-section audience, validated. → { score, label, rationale, signals, sections: [...], intro: [...] } */
export function audienceOf(out, sections, { model = null, tradition = null } = {}) {
  const sc = (v) => { const n = Math.round(Number(v)); return n >= 1 && n <= 5 ? n : null; };
  const a = out?.audience || {};
  const byK = new Map((out?.sections || []).map((s) => [Number(s.k), s]));
  const secs = sections.map((s) => { const o = byK.get(s.k) || {}; return { k: s.k, p: s.p, title: s.title, slug: s.slug || null, t0: s.t0, t1: s.t1, score: sc(o.score),
    rationale: String(o.rationale || '').slice(0, 300) || null, intro: o.intro ? String(o.intro).slice(0, 120) : null }; });
  const score = sc(a.score);
  return { score, label: score ? LABELS[score] : null, rationale: String(a.rationale || '').slice(0, 400) || null,
    signals: a.signals && typeof a.signals === 'object' ? Object.fromEntries(Object.entries(a.signals).slice(0, 6).map(([k, v]) => [k, String(v).slice(0, 160)])) : {},
    tradition, model, version: ASSESS_VERSION, sections: secs, intro: introRanges(secs) };
}

/** Introductory clips: sections rated 1–2 lasting 2–25 minutes, best first. */
export function introRanges(sections, { min = 120, max = 1500 } = {}) {
  return sections.filter((s) => s.score && s.score <= 2 && s.intro && !/^none$/i.test(s.intro) && s.t1 - s.t0 >= min && s.t1 - s.t0 <= max)
    .sort((a, b) => a.score - b.score || (b.t1 - b.t0) - (a.t1 - a.t0)).slice(0, 2)
    .map((s) => ({ k: s.k, t0: s.t0, t1: s.t1, score: s.score, title: s.title, intro: s.intro }));
}

/** Find a verbatim run of words in a paragraph (letters compared, punctuation and case ignored) → [i0, i1) on p.words. */
export function locate(p, text) {
  const want = String(text || '').split(/\s+/).map(keyOf).filter(Boolean);
  const vis = visible(p).filter((w) => keyOf(w.w));
  if (want.length < 4) return null;
  for (let i = 0; i + want.length <= vis.length; i++) {
    let ok = true;
    for (let k = 0; k < want.length && ok; k++) ok = keyOf(vis[i + k].w) === want[k];
    if (ok) return [vis[i].i, vis[i + want.length - 1].i + 1];
  }
  return null;
}

/** A moment's stable short key: the same talk and words always give the same key. */
export const momentKey = (slug, text) => createHash('sha1').update(`${slug}|${String(text).split(/\s+/).map(keyOf).join(' ')}`).digest('base64url').slice(0, 8);

/**
 * Moments, located and checked. verify(moment, surroundingText) → { ok, why } (a strict second pass).
 * → { moments: [{ key, para, i0, i1, t0_ms, t1_ms, text, context, kind, topics, why, rank }], rejected }
 */
export async function momentsOf(out, paragraphs, { slug, verify = null, max = 8 } = {}) {
  const byN = new Map(paragraphs.map((p) => [p.n, p]));
  const moments = [], rejected = [], seen = new Set();
  for (const m of (out?.moments || []).slice(0, 12)) {
    const p = byN.get(Number(m?.p));
    const span = p && locate(p, m.text);
    if (!span) { rejected.push({ ...m, why_rejected: 'not verbatim in that paragraph' }); continue; }
    const words = p.words.slice(span[0], span[1]).filter((w) => !w.hide);
    const text = words.map((w) => w.w).join(' ');
    const sentences = (text.match(/[.!?]["”’)]*(\s|$)/g) || []).length;
    if (words.length > 120 || sentences > 5) { rejected.push({ ...m, why_rejected: 'too long' }); continue; }
    const key = momentKey(slug, text);
    if (seen.has(key)) continue;
    const ctxText = [byN.get(p.n - 1), p, byN.get(p.n + 1)].filter(Boolean).map((x) => visible(x).map((w) => w.w).join(' ')).join('\n');
    const mm = { key, para: p.n, i0: span[0], i1: span[1], t0_ms: Math.round(words[0].s * 1000), t1_ms: Math.round(words.at(-1).e * 1000), text,
      context: String(m.context || '').split(/\s+/).slice(0, 15).join(' ') || null, kind: KINDS.includes(m.kind) ? m.kind : 'insight',
      topics: (Array.isArray(m.topics) ? m.topics : []).slice(0, 3).map((x) => String(x).slice(0, 40)), why: String(m.why || '').slice(0, 200) || null };
    if (verify) { const v = await verify(mm, ctxText); if (!v?.ok) { rejected.push({ ...mm, why_rejected: v?.why || 'failed the out-of-context check' }); continue; } }
    seen.add(key); moments.push(mm);
  }
  return { moments: moments.slice(0, max).map((m, i) => ({ ...m, rank: i + 1 })), rejected };
}

export const verifyPrompt = (m, ctxText) => `A short excerpt will be shared on its own from a recorded religious talk. Answer strictly.
EXCERPT (verbatim): "${m.text}"
EDITORIAL CONTEXT LINE: "${m.context || ''}"
SURROUNDING TRANSCRIPT:
${ctxText}

Does the excerpt make sense out of context, AND does it represent the speaker faithfully when isolated (not reversing, not hedging away, not quoting someone the speaker disagrees with as if it were the speaker's view, not an unfinished thought), AND is the context line accurate?
Return JSON {"ok": true|false, "why": "one short sentence"}`;
