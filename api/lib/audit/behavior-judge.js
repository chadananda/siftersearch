// behavior-judge — the improve judge for a behaviour scenario's `judge` checks (tests/behavior/run.mjs → POST /api/admin/anis/behavior/judge):
// one Opus call per reply grades every judge expectation of that scenario. Billed improve-behavior-judge (spend cap in ai.js).
// Pure apart from judgeBehavior's call. Deps: improve.js (role, costs) via strategy-design opusCall.
import { JUDGE_ROLE } from './improve.js';

export const BEHAVIOR_JUDGE_CALLER = 'improve-behavior-judge';
const clip = (s, n) => (s && s.length > n ? `${s.slice(0, n)}…` : s || '');

export const BEHAVIOR_JUDGE_SYSTEM = `You check one reply of Anís (a research assistant for a religious library) against numbered acceptance expectations.
Judge each expectation on its own, strictly, from the reply and the cited sources shown. An expectation the reply only partly meets fails.
Return JSON only: {"results":[{"i":1,"pass":true,"why":"one sentence"}]} — one entry per expectation, in order.`;

/** { question, reply, cited?, expects: [string] } → the user message. */
export function behaviorJudgeMessage({ question, reply, cited = [], expects = [] }) {
  const L = [`QUESTION: ${clip(question, 1500)}`, `REPLY:\n${clip(reply, 12000)}`];
  if (cited.length) L.push('CITED:', ...cited.slice(0, 15).map((c) => `  ${c.title || '?'}${c.author ? ` — ${c.author}` : ''}${c.tier ? ` [${c.tier}]` : ''}${c.language ? ` (${c.language})` : ''}`));
  L.push('EXPECTATIONS:', ...expects.map((e, i) => `  ${i + 1}. ${e}`));
  return L.join('\n');
}

/** Model text → [{ pass, why }] aligned to the n expectations (a missing or unparsed entry fails with why 'unjudged'). */
export function parseBehaviorJudge(text, n) {
  let j = null;
  try { const m = String(text || '').match(/\{[\s\S]*\}/); j = m ? JSON.parse(m[0]) : null; } catch { j = null; }
  const rows = Array.isArray(j?.results) ? j.results : [];
  return Array.from({ length: n }, (_, k) => {
    const r = rows.find((x) => Number(x?.i) === k + 1) || rows[k];
    return r && typeof r.pass === 'boolean' ? { pass: r.pass, why: clip(String(r.why || ''), 300) } : { pass: false, why: 'unjudged' };
  });
}

/** → { results: [{ pass, why }], usd }. A spend cap propagates (the caller answers 429). */
export async function judgeBehavior(input, { call = null } = {}) {
  const expects = (input.expects || []).filter((e) => typeof e === 'string' && e.trim()).slice(0, 8);
  if (!expects.length || !input.reply) return { results: expects.map(() => ({ pass: false, why: 'no reply' })), usd: 0 };
  const c = call || (await import('../assistant/strategy-design.js')).opusCall;
  const r = await c(JUDGE_ROLE, BEHAVIOR_JUDGE_SYSTEM, behaviorJudgeMessage({ ...input, expects }), 800, BEHAVIOR_JUDGE_CALLER);
  return { results: parseBehaviorJudge(r.text, expects.length), usd: r.usd || 0 };
}
