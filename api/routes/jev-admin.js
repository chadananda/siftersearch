// Jev decision-gate bank + tuning harness (Chad 11-04: "query each Jev decision and its context … focus on one gate"). requireInternal
// (X-Internal-Key); CLI: scripts/ops/ops.mjs jev-gates | jev-bank | jev-label | jev-try. The call log lives behind jev-calls-repo.
//   GET  /jev/gates?days=7           per gate: calls, answer distribution, gold coverage/accuracy, shadow agreement, $ of a 200-call experiment
//   GET  /jev/calls?task&chosen&q&gold=any|none|right|wrong&since=7d|ISO&ref&id&limit   the bank (state, questions, answers, turn question)
//   POST /jev/label {id, answer, q?, basis?}      gold for one call
//   GET  /jev/variants                            the variant registry
//   POST /jev/experiment {task, variant, n, filter, baseline, maxUsd} → job (async-jobs); GET /jev/experiment/:key polls it
// Deps: repos/jev-calls-repo, jev-tuning/{experiment,variants}, systemone.rerun (billed to the improve group), async-jobs.
import { requireInternal } from '../lib/auth.js';
import * as repo from '../lib/repos/jev-calls-repo.js';
import { VARIANTS } from '../lib/jev-tuning/variants.js';
import { runExperiment, estimateUsd } from '../lib/jev-tuning/experiment.js';
import { anisThreadMessages } from '../lib/repos/anis-threads-repo.js';

/** '7d' | '12h' | ISO date | epoch ms → epoch ms (0 = no bound). Pure. */
export function sinceMs(v, now = Date.now()) {
  if (v == null || v === '') return 0;
  const m = /^(\d+)([dh])$/.exec(String(v));
  if (m) return now - Number(m[1]) * (m[2] === 'd' ? 86400000 : 3600000);
  const t = /^\d+$/.test(String(v)) ? Number(v) : Date.parse(v);
  return Number.isFinite(t) ? t : 0;
}
const splitRef = (ref) => { const i = String(ref || '').lastIndexOf(':'); return i > 0 && /^\d+$/.test(ref.slice(i + 1)) ? { thread: ref.slice(0, i), round: Number(ref.slice(i + 1)) } : null; };
const clip = (s, n = 400) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n)}…` : t; };

export default async function jevAdminRoutes(fastify, { deps = {} } = {}) {
  const r = deps.repo || repo, messages = deps.messages || anisThreadMessages;
  let jobs = null;
  const store = async () => (jobs ||= deps.jobs || (await import('../lib/jobs/async-jobs.js')).jobStore());
  const rerun = deps.rerun || (async (...a) => (await import('../lib/systemone.js')).rerun(...a));

  // the turn's user question + earlier turns, from the chat log (one read per thread)
  const threads = new Map();
  const thread = async (id) => { if (!threads.has(id)) threads.set(id, messages(id).catch(() => [])); return threads.get(id); };
  const questionOf = async (ref) => { const t = splitRef(ref); return t ? clip((await thread(t.thread)).find((m) => m.role === 'user' && m.round_index === t.round)?.content) : null; };
  const history = async (row, turns) => {
    const t = splitRef(row.ref);
    if (!t) return null;
    const prior = (await thread(t.thread)).filter((m) => m.round_index < t.round).slice(-2 * turns);
    return prior.length ? prior.map((m) => `${m.role === 'user' ? 'User' : 'Anís'}: ${clip(m.content, 500)}`).join('\n') : null;
  };

  fastify.get('/jev/gates', { preHandler: requireInternal }, async (request) => {
    const days = Math.min(90, parseInt(request.query?.days, 10) || 7);
    // cost_200_usd: a 200-call experiment = 400 Jev calls (baseline + variant re-asked) at this gate's measured average input tokens
    return { days, gates: r.gateStats({ days }).map((g) => ({ ...g, cost_200_usd: estimateUsd(g.avg_tokens, 200) })) };
  });

  fastify.get('/jev/calls', { preHandler: requireInternal }, async (request, reply) => {
    const q = request.query || {};
    if (!q.task && !q.id && !q.ref) return reply.code(400).send({ error: 'task (the gate), id or ref is required' });
    const calls = r.listCalls({ task: q.task, chosen: q.chosen, q: q.q, gold: q.gold, since: sinceMs(q.since), ref: q.ref, id: q.id, limit: q.limit });
    for (const c of calls) c.question = await questionOf(c.ref).catch(() => null);
    return { count: calls.length, calls };
  });

  fastify.post('/jev/label', { preHandler: requireInternal }, async (request, reply) => {
    const b = request.body || {};
    if (!b.id || b.answer == null) return reply.code(400).send({ error: 'id and answer are required' });
    const out = r.labelCall(b.id, String(b.answer), { q: b.q, basis: b.basis || 'manual' });
    return out.ok ? out : reply.code(400).send(out);
  });

  fastify.get('/jev/variants', { preHandler: requireInternal }, async () => ({ variants: Object.entries(VARIANTS).map(([id, v]) => ({ id, describe: v.describe })) }));

  fastify.post('/jev/experiment', { preHandler: requireInternal }, async (request, reply) => {
    const b = request.body || {};
    if (!b.task) return reply.code(400).send({ error: 'task (the gate) is required' });
    const spec = { task: b.task, variant: b.variant || 'baseline', n: Math.min(Number(b.n) || 200, 1000), filter: { ...(b.sample?.filter || b.filter || {}), since: sinceMs((b.sample?.filter || b.filter || {}).since) },
      baseline: b.baseline === 'stored' ? 'stored' : 'rerun', maxUsd: Number(b.maxUsd) || 2 };
    try { (await import('../lib/jev-tuning/variants.js')).resolveVariant(spec.variant); } catch (e) { return reply.code(400).send({ error: e.message }); }
    const key = `jev-try-${spec.task}-${typeof spec.variant === 'string' ? spec.variant : spec.variant.id}-${Date.now().toString(36)}`;
    const rec = (await store()).start(key, () => runExperiment(spec, { sample: async (t, o) => r.sampleBank(t, o), rerun, history }), { kind: 'jev_try', spec });
    return { key: rec.key, status: rec.status, poll: `/api/admin/jev/experiment/${rec.key}` };
  });

  fastify.get('/jev/experiment/:key', { preHandler: requireInternal }, async (request, reply) => {
    const rec = (await store()).get(request.params.key);
    return rec || reply.code(404).send({ error: 'no such experiment' });
  });
}
