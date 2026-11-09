// Jev tuning experiment: re-ask one gate's logged calls with a variant and compare to baseline and to gold. LLM-class, async
// (run as a job from routes/jev-admin.js, never on the reply path). Pure orchestration — Jev, the bank and history are injected.
// Reports: accuracy vs gold (baseline / variant), flip matrix, fixed/broken, $ and ms. Billed to the improve group (systemone.rerun).
import { resolveVariant } from './variants.js';
import { chosenOf, matchesGold, goldMap } from '../repos/jev-calls-repo.js';

export const JEV_USD_PER_TOKEN = 0.000042 / 1000;   // model-registry 'jev-latest' (input $42/B tokens; output free)
const sig = (c) => JSON.stringify(c);

/** Cost of an N-call run from a gate's average input tokens (variants add tokens: pass extraTokens). calls = 2N unless baseline is stored. */
export const estimateUsd = (avgTokens, n, { extraTokens = 0, baseline = 'rerun' } = {}) => +(((baseline === 'rerun' ? 2 : 1) * n * (avgTokens + extraTokens) * JEV_USD_PER_TOKEN)).toFixed(4);

/** minConfidence (optional): also counts confidence_drops. deps: { sample(task, opts) → bank rows, rerun(task, state, questions) → {answers, tokens, ms}, history? }. `rows` (e.g. historic bank
 *  rows + a frozen synthetic set, each with src 'historic'|'synthetic') replaces the sample; accuracy is also reported per src. */
export async function runExperiment({ task, variant = 'baseline', n = 200, filter = {}, baseline = 'rerun', concurrency = 6, maxUsd = 2, rows: given = null, minConfidence = null }, deps) {
  const v = resolveVariant(variant), rows = given || await deps.sample(task, { n, ...filter });
  const bySrc = {};
  const srcOf = (row) => (bySrc[row.src || 'historic'] ||= { n: 0, base_right: 0, var_right: 0, fixed: 0, broken: 0 });
  const res = { task, variant: { id: v.id, params: v.params }, baseline_mode: baseline, sampled: rows.length, done: 0, errors: 0, skipped: 0, usd: 0, truncated: null,
    base: { right: 0, wrong: 0, ms: 0, tokens: 0 }, var: { right: 0, wrong: 0, ms: 0, tokens: 0 }, labelled: 0, fixed: 0, broken: 0, confidence_drops: 0, changed: 0, flips: {}, examples: [] };
  let next = 0, stop = false;
  const one = async (row) => {
    try {
      const b = baseline === 'stored' ? { answers: row.answers, tokens: 0, ms: row.ms || 0 } : await deps.rerun(task, row.state, row.questions);
      const mod = await v.apply({ state: row.state, questions: row.questions, row, params: v.params, deps });
      if (mod.skipped) { res.skipped++; return; }
      const w = await deps.rerun(task, mod.state, mod.questions);
      res.usd += (b.tokens + w.tokens) * JEV_USD_PER_TOKEN; res.done++;
      res.base.ms += b.ms; res.base.tokens += b.tokens; res.var.ms += w.ms; res.var.tokens += w.tokens;
      const cb = chosenOf(b.answers), cv = chosenOf(w.answers), bk = sig(cb), vk = sig(cv);
      const okB = matchesGold(b.answers, row.gold, row.questions), okV = matchesGold(w.answers, row.gold, row.questions);
      if (okB != null) {
        res.labelled++; res.base[okB ? 'right' : 'wrong']++; res.var[okV ? 'right' : 'wrong']++; if (!okB && okV) res.fixed++; if (okB && !okV) res.broken++;
        const t = srcOf(row); t.n++; if (okB) t.base_right++; if (okV) t.var_right++; if (!okB && okV) t.fixed++; if (okB && !okV) t.broken++;
      }
      // minConfidence: right at ≥ the floor before, still right, but below it now (Jev would fall to 'unmatched')
      if (minConfidence != null && okB && okV) {
        const conf = (a, q) => a?.[q]?.confidence ?? a?.[q]?.distribution?.[a?.[q]?.choice] ?? 0;
        if (Object.keys(goldMap(row.gold, row.questions) || {}).some((q) => conf(b.answers, q) >= minConfidence && conf(w.answers, q) < minConfidence)) { res.confidence_drops++; const t = srcOf(row); t.confidence_drops = (t.confidence_drops || 0) + 1; }
      }
      if (bk !== vk) {
        res.changed++;
        const f = `${Object.values(cb).join('/')} -> ${Object.values(cv).join('/')}`;
        res.flips[f] = (res.flips[f] || 0) + 1;
        if (res.examples.length < 30) res.examples.push({ id: row.id, ref: row.ref, baseline: cb, variant: cv, gold: row.gold ?? null });
      }
    } catch (e) {
      if (e?.code === 'SPEND_CAP') { stop = true; res.truncated = 'improve spend cap reached'; } else res.errors++;
    }
  };
  const worker = async () => {
    while (!stop && next < rows.length) {
      if (res.usd >= maxUsd) { stop = true; res.truncated = `maxUsd $${maxUsd} reached`; break; }
      await one(rows[next++]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, rows.length) || 1 }, worker));
  const acc = (s) => (res.labelled ? +(s.right / res.labelled).toFixed(3) : null), avg = (x, k) => (res.done ? Math.round(x[k] / res.done) : 0);
  return { ...res, usd: +res.usd.toFixed(6), accuracy: { baseline: acc(res.base), variant: acc(res.var), delta: res.labelled ? +((res.var.right - res.base.right) / res.labelled).toFixed(3) : null },
    avg_tokens: { baseline: avg(res.base, 'tokens'), variant: avg(res.var, 'tokens') }, avg_ms: { baseline: avg(res.base, 'ms'), variant: avg(res.var, 'ms') },
    by_src: Object.fromEntries(Object.entries(bySrc).map(([k, b]) => [k, { ...b, baseline: b.n ? +(b.base_right / b.n).toFixed(3) : null, variant: b.n ? +(b.var_right / b.n).toFixed(3) : null }])) };
}
