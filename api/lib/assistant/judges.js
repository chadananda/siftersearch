// Tree-level model steps the pure tools no longer hold (Chad 11-09): holds (quotation_candidates), timeline (biography_search people), term script (Latin → Arabic for rendering_lookup).
// ONE call over the merged result, never per item. Seams (tests): decide / complete. Deps: source-hunt (quoteWindow, quoteRanges), systemone, ai, ctai-term. Not imported by tools.js (no-LLM ratchet).
import { quoteWindow, quoteRanges } from '../source-hunt.js';

const WORDING = 0.8;   // the quote's own words held (share) = holds without a model; the WORDING always counts (source-hunt.js)
const HOLDS_MAX = 24;

/** quotation_candidates passages → the same passages with verdict holds|partial|no|original and span [[start,end]]; 'no' passages are dropped. One System-1 call over the unsettled same-language candidates.
 *  decide(task, state, questions) → { answers } | null (default: systemone.ask, task sourcehunt-holds). No answer → the wording alone decides (score ≥ 0.5 = partial). */
export async function judgeHolds({ quotation, passages = [], decide = null } = {}) {
  const q = String(quotation || '');
  const judged = (p) => p.role === 'candidate' || p.role == null;   // the origin, its original and the works citing it are the tool's own finds; only a candidate (or a plain passage) needs the judgement
  const sameLang = (p) => judged(p) && !/^(ar|fa)/i.test(String(p.language || ''));
  const ask = passages.filter((p) => sameLang(p) && !((p.score ?? 0) >= WORDING)).slice(0, HOLDS_MAX);
  let answers = null;
  if (ask.length) {
    const excerpt = (p) => { const t = p.text || '', s = quoteWindow(t, q); if (t.length <= 900) return t; const a = Math.max(0, (s?.start ?? 0) - 350), b = Math.min(t.length, (s?.end ?? 550) + 350); return `${a > 0 ? '… ' : ''}${t.slice(a, b)}${b < t.length ? ' …' : ''}`; };
    const state = `QUOTATION:\n${q}\n\nPASSAGES:\n${ask.map((p, i) => `[p${i + 1}] ${excerpt(p)}`).join('\n\n')}`;
    const questions = Object.fromEntries(ask.map((p, i) => [`p${i + 1}`, { type: 'noul', instructions: `Does passage [p${i + 1}] contain the quoted sentence itself — the same words, or another TRANSLATION of the same original sentence? A passage that makes the same point in its own words does not, nor one on the same topic.` }]));
    const d = decide || (async (task, st, qs) => (await import('../systemone.js')).ask(task, st, qs, { timeoutMs: 4000, retries: 0 }));
    answers = (await Promise.resolve(d('sourcehunt-holds', state, questions)).catch(() => null))?.answers ?? null;
  }
  const index = new Map(ask.map((p, i) => [p, `p${i + 1}`]));
  const out = passages.map((p) => {
    if (p.role === 'source') { const sp = quoteRanges(p.text, q).length ? quoteRanges(p.text, q) : (() => { const w = quoteWindow(p.text, q); return w ? [[w.start, w.end]] : []; })(); return { ...p, verdict: 'holds', span: sp }; }
    if (!judged(p)) return { ...p, verdict: 'kept' };
    if (!sameLang(p)) return { ...p, verdict: 'original' };
    const n = answers && index.has(p) ? answers[index.get(p)]?.noul : undefined;
    const verdict = (p.score ?? 0) >= WORDING || n >= 0.5 ? 'holds' : n >= 0.25 || (p.score ?? 0) >= 0.5 ? 'partial' : 'no';
    const span = verdict === 'no' ? [] : quoteRanges(p.text, q).length ? quoteRanges(p.text, q) : (() => { const w = quoteWindow(p.text, q); return w ? [[w.start, w.end]] : []; })();
    return { ...p, verdict, span };
  });
  // a candidate the judge says holds the sentence (another translation) is the source when no source holds; otherwise it is a further holder
  const kept = out.filter((p) => p.verdict !== 'no');
  const hasSource = kept.some((p) => p.role === 'source');
  let promoted = hasSource;
  const final = kept.map((p) => (p.role !== 'candidate' ? p : p.verdict === 'holds' && !promoted ? ((promoted = true), { ...p, role: 'source' }) : { ...p, role: p.verdict === 'holds' ? 'holder' : 'near' }));
  return { passages: final, judged: !ask.length || !!answers, asked: ask.length };
}

const TL_SYS = `You answer a question about people in early Bábí/Bahá'í history from a CATALOG of cited claims — one person per line: "id|name: • statement « verbatim proof » [period] • …" (from God Passes By and The Dawn-Breakers).
A person qualifies ONLY if one of their claims, AS SHOWN BY ITS VERBATIM PROOF, DIRECTLY satisfies the QUERY — the right act AND place AND period. Reject mere group membership. Reject "promised/prophesied/expected" when the query asks who actually DID or MET something. For a place/period query the proof must name that place/period.
For each qualifying person output {"id":<number>, "clause":"<a SHORT phrase answering the query for this person — PREFER the book's OWN wording taken verbatim from their « proof », lightly trimmed to a clean phrase>"}.
Also output "lead": one short sentence stating the overall answer.
Return ONLY JSON: {"lead":"...","matches":[{"id","clause"}]} — most relevant first, clear matches only.`;
const looseParse = (txt) => {
  const whole = String(txt || '').match(/\{[\s\S]*\}/);
  if (whole) { try { return JSON.parse(whole[0]); } catch { /* salvage below */ } }
  const out = {}; const lead = (String(txt).match(/"lead"\s*:\s*"((?:[^"\\]|\\.)*)"/) || [])[1]; if (lead) out.lead = lead;
  const objs = []; const re = /\{[^{}]*\}/g; let o; while ((o = re.exec(String(txt)))) { try { objs.push(JSON.parse(o[0])); } catch { /* skip */ } }
  if (objs.length) out.matches = objs.filter((x) => x && x.id != null);
  return out;
};
const cl = (s) => String(s || '').replace(/\s+/g, ' ').trim();
const CHUNK = 12;   // measured 08-08: a 40-person ask balloons the model's hidden reasoning to empty content; bound the ask, judge the chunks in parallel, merge

/** biography_search people (typed, with evidence) → { people (only those that qualify, each with `clause`), lead, judged }. One DeepSeek call per 12 people, in parallel (one step, not per person).
 *  complete(messages, opts) → { content } (default: ai.chatCompletion, role bio-timeline). A failed or empty answer = judged:false, people untouched (fail open, flagged). */
export async function judgeTimeline({ query, people = [], complete = null } = {}) {
  const usable = people.filter((p) => p?.id != null && Array.isArray(p.evidence) && p.evidence.length).slice(0, 40);
  if (!usable.length) return { people, lead: '', judged: false };
  const call = complete || (async (messages, opts) => { const [{ chatCompletion }, { modelFor }] = await Promise.all([import('../ai.js'), import('../model-roles.js')]); return chatCompletion(messages, { ...modelFor('bio-timeline'), ...opts }); });
  const line = (p) => `${p.id}|${p.name}: ${p.evidence.slice(0, 8).map((e) => `• ${cl(e.statement || e.relation)} « ${cl(e.proof || e.quote).slice(0, 140)} »${e.when || e.year ? ` [${e.when || e.year}]` : ''}`).join(' ')}`;
  const chunks = []; for (let i = 0; i < usable.length; i += CHUNK) chunks.push(usable.slice(i, i + CHUNK));
  const results = await Promise.all(chunks.map(async (c) => { try { const r = await call([{ role: 'system', content: TL_SYS }, { role: 'user', content: `QUERY: ${query}\n\nCATALOG:\n${c.map(line).join('\n')}` }], { temperature: 0, maxTokens: 6000, responseFormat: { type: 'json_object' } }); return r?.content?.trim() ? looseParse(r.content) : null; } catch { return null; } }));
  if (results.every((r) => r === null)) return { people, lead: '', judged: false };
  const clause = new Map(); for (const m of results.flatMap((r) => (Array.isArray(r?.matches) ? r.matches : []))) if (m?.id != null && !clause.has(String(m.id))) clause.set(String(m.id), cl(m.clause).slice(0, 160).replace(/[\s.;,]+$/, ''));
  const keep = people.filter((p) => clause.has(String(p.id))).map((p) => ({ ...p, clause: clause.get(String(p.id)) }));
  return { people: keep, lead: results.find((r) => r?.lead)?.lead || '', judged: true };
}

const memo = new Map();   // folded Latin → Arabic script, once resolved (the pure tier: a repeat never asks the model again)
const foldLatin = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’‘`ʻʼ-]/g, '').toLowerCase().trim();
/** A term in Arabic script: already Arabic → itself; memo hit → the earlier answer; else ONE Jev/model call (ctai-term resolveTerm). → { term_arabic, via: 'script'|'memo'|'model' } | null. */
export async function termScript(term, { complete = null } = {}) {
  const t = String(term || '').trim();
  if (!t) return null;
  if (/[؀-ۿ]/.test(t)) return { term_arabic: t, via: 'script' };
  const k = foldLatin(t);
  if (memo.has(k)) return { term_arabic: memo.get(k), via: 'memo' };
  const word = await (await import('./ctai-term.js')).resolveTerm(t, complete ? { complete } : {}).catch(() => null);
  if (!word) return null;
  memo.set(k, word);
  return { term_arabic: word, via: 'model' };
}
export const _resetTermMemo = () => memo.clear();
