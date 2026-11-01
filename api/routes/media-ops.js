// The media internal API (X-Internal-Key; mounted by ops-reports.js under /api/admin): progress, per-talk status from the stage ledger,
// talks by stage, add, redo, worker-image promotion. Logic in api/lib/media/media-status.js (shared with Dewey). Plan: planning/media-ledger-plan-20261030.md
import { join, dirname } from 'path';
import { requireInternal } from '../lib/auth.js';
import { mediaProgress, mediaStatus, mediaAdd, mediaRedo } from '../lib/media/media-status.js';

export default async function mediaOps(fastify) {
  const guard = { preHandler: requireInternal };
  const by = (req) => String(req.headers['x-by'] || req.body?.by || 'ops').slice(0, 60);
  fastify.get('/ops/media/progress', guard, async () => mediaProgress());
  // per-host load history (gauge-log.js): ?host=Podsprocket&hours=6&rows=1 → summary (+ raw rows)
  fastify.get('/ops/media/gauges', guard, async (req) => {
    const q = req.query || {}, G = await import('../lib/media/gauge-log.js'), { STATE_FILE } = await import('../lib/media/cloud.js');
    const hours = Math.min(Number(q.hours) || 6, 24 * G.KEEP_DAYS), now = Date.now();
    const rows = await G.readGaugeLog(join(dirname(STATE_FILE), 'gauges'), { sinceMs: now - hours * 3600_000, host: q.host || '', now });
    return { hours, hosts: G.summarizeGauges(rows), ...(q.rows === '1' ? { rows: rows.slice(-2000) } : {}) };
  });
  // held remasters (Chad 10-31): the counts, the reasons and the rejudge tallies (no signed audio: the page has those)
  fastify.get('/ops/media/held', guard, async () => {
    const R = await import('../lib/media/remaster-rejudge.js'), h = await R.heldList({ repo: await import('../lib/repos/media-repo.js'), sign: () => '' });
    const rows = (a) => a.map((x) => ({ slug: x.slug, title: x.title, speaker: x.speaker, reason: x.reason, problems: x.problems, nisqa: x.scores?.nisqa }));
    return { counts: h.counts, rejudge: JSON.parse(await (await import('fs/promises')).readFile(R.COUNTS_FILE, 'utf8').catch(() => 'null')), held: rows(h.held), archived: rows(h.archived) };
  });
  fastify.post('/ops/media/rejudge', guard, async (req) => ({ queued: await (await import('../lib/repos/ops-report-repo.js')).enqueue('media-remaster-rejudge', { ids: [].concat(req.body?.ids || []), force: !!req.body?.force }, by(req)) }));
  fastify.get('/ops/media/items', guard, async (req) => {
    const q = req.query || {};
    if (q.q) return { matches: await (await import('../lib/repos/media-ledger-repo.js')).findTalks(String(q.q)) };
    if (!q.stage) return { error: 'stage (with status or missing=1) or q required' };
    return { items: await (await import('../lib/repos/media-ledger-repo.js')).itemsByStage({ stage: String(q.stage), status: String(q.status || 'done'), missing: q.missing === '1' || q.missing === 'true', afterId: q.after, limit: q.limit }) };
  });
  fastify.get('/ops/media/items/:ref', guard, async (req, reply) => {
    const r = await mediaStatus(req.params.ref);
    return r.item || r.matches?.length ? r : reply.code(404).send({ error: 'no such talk', ...r });
  });
  fastify.post('/ops/media/items', guard, async (req, reply) => {
    const r = await mediaAdd({ urls: [].concat(req.body?.urls || req.body?.url || []), paths: [].concat(req.body?.paths || req.body?.path || []), by: by(req) });
    return r.error ? reply.code(400).send(r) : r;
  });
  // THE STAGE REGISTRY (api/lib/media/stages.js): every stage with class, bundle, after, tool + settings + fp, required, blocksAir, feed
  fastify.get('/ops/media/stages', guard, async () => ({ stages: (await import('../lib/media/stages.js')).describeRegistry() }));
  // RE-RUN ONE STAGE across the library: { stage, where: 'fp!=current' | 'tool=X' | 'fp=…' | 'all', mode: 'dry' | 'canary' | 'full', limit } — dry + canary answer inline, full is a report run
  fastify.post('/ops/media/rerun', guard, async (req, reply) => {
    const b = req.body || {}, mode = ['dry', 'canary', 'full'].includes(b.mode) ? b.mode : 'dry';
    const p = { stage: String(b.stage || ''), where: b.where || 'fp!=current', mode, ...(b.limit ? { limit: Number(b.limit) } : {}) };
    try {
      if (mode === 'full') return { queued: await (await import('../lib/repos/ops-report-repo.js')).enqueue('media-rerun', p, by(req)), ...p };
      return await (await import('../lib/ops/media-jobs.js')).mediaRerunJob(p);
    } catch (e) { return reply.code(400).send({ error: e.message }); }
  });
  fastify.post('/ops/media/items/:id/redo', guard, async (req, reply) => {
    const r = await mediaRedo({ ids: [req.params.id], stages: [].concat(req.body?.stages || []), by: by(req) });
    return r.error ? reply.code(400).send(r) : r;
  });
  // the typed pod plan (Chad 10-31): R_prep / R_finish / R_pod (measured or prior), supportable, target, binding, the R2 buffer over time, refusals, $/audio-h
  fastify.get('/ops/media/pod-plan', guard, async () => {
    const C = await import('../lib/media/cloud.js'), st = await C.loadState();
    const live = Object.values(st.pods || {}).filter((p) => !p.terminated);
    const doneH = (st.done || []).reduce((a, d) => a + (st.items?.[d.id]?.duration_s || 0), 0) / 3600;
    const spent = C.spendOf(st, Date.now());
    return { plan: st.pod_plan || null, buffer_log: (st.buffer_log || []).slice(-30), rental_refusals: (st.rental_refusals || []).slice(-10), last_error: st.last_error || null,
      pods: live.map((p) => ({ id: p.id, name: p.name, status: p.status, cost_per_hr: p.costPerHr, leased: st.q_last?.leased?.[`pod-${p.name}`] || 0, gpu: p.gauge?.gpu ?? null, created: p.created })),
      spent_usd: spent, usd_per_audio_hour: doneH ? Math.round((spent / doneH) * 100) / 100 : null };
  });
  // the lane's health (Chad 10-31): each loop section's beat judged by its own cadence + the progress checks, computed NOW from the state
  // file (a dead loop shows its sections going stale); system-checks raises the failing ones
  fastify.get('/ops/media/health', guard, async () => {
    const C = await import('../lib/media/cloud.js'), LH = await import('../lib/media/loop-health.js'), st = await C.loadState();
    const now = Date.now(), machines = Object.fromEntries(Object.entries(st.machine_health || {}).map(([k, h]) => [k, { ok: h.ok, polled_s_ago: Math.round((now - h.at) / 1000),
      ...(h.ok ? {} : { unreachable_for_s: Math.round((now - (h.down_since || h.at)) / 1000), last_ok_s_ago: h.ok_at ? Math.round((now - h.ok_at) / 1000) : null, error: h.error }),
      latency_ms: h.latency_ms, ...(h.pod ? { pod: h.pod } : {}), health: h.data || null }]));
    // machines: each one's latest GET /health as tower polled it (health-poll.js) — the only source for machine load. stalled_jobs: jobs whose
    // container shows ~0 CPU and no progress (the agent's stallOf), so a hung job (10-31: 2530, 1 h 40 m) is seen in minutes
    const stalled_jobs = Object.entries(st.machine_health || {}).flatMap(([m, h]) => (h.ok ? h.data?.jobs || [] : []).filter((j) => j.stalled_s != null).map((j) => ({ machine: m, id: j.id, type: j.type, stage: j.stage, stalled_s: j.stalled_s })));
    return { ...LH.evaluate(st, now), updated: st.updated || null, loop_updated_at: st.health?.at || null, stalled_jobs, machines, machine_poll_at: st.machine_health_at || null,
      ...(st.health_poll_error ? { machine_poll_error: st.health_poll_error } : {}), ...(st.last_words_error ? { last_words_error: st.last_words_error } : {}) };
  });
  // a machine's health history (health-poll.js, data/run/health/): ?machine=boss&from=<ISO|ms>&to=… → its polls (and last words), oldest first
  fastify.get('/ops/media/health-history', guard, async (req) => {
    const q = req.query || {}, HP = await import('../lib/media/health-poll.js'), { STATE_FILE } = await import('../lib/media/cloud.js');
    const t = (x, d) => (x == null || x === '' ? d : /^\d+$/.test(String(x)) ? Number(x) : Date.parse(x));
    const to = t(q.to, Date.now()), from = t(q.from, to - 3600_000);
    if (!Number.isFinite(from) || !Number.isFinite(to)) return { error: 'from/to: ISO time or ms' };
    const rows = await HP.readHistory(join(dirname(STATE_FILE), 'health'), { machine: String(q.machine || ''), from, to, limit: Math.min(Number(q.limit) || 2000, 20000) });
    return { machine: q.machine || null, from: new Date(from).toISOString(), to: new Date(to).toISOString(), n: rows.length, rows };
  });
  // rentals valve: { pause: "reason" | false, maxPods?: 1-6 } → the pause file + the capacity file the lane reads every tick
  fastify.post('/ops/media/rentals', guard, async (req, reply) => {
    const b = req.body || {}, C = await import('../lib/media/cloud.js');
    try {
      if (b.pause !== undefined) await C.setRentalPause(b.pause ? `${b.pause} (${by(req)} ${new Date().toISOString()})` : null);
      const capacity = b.maxPods != null ? await C.setRentalCapacity({ maxPods: Number(b.maxPods) }) : undefined;
      return { paused: await C.rentalPauseReason(), ...(capacity ? { capacity } : {}) };
    } catch (e) { return reply.code(400).send({ error: e.message }); }
  });
  // rent ONE CPU pod by hand (Chad 10-31: never automatic): it runs cpu-prep + cpu-finish overflow from the edge queue and ends itself when
  // idle. { vcpu?: 32, flavor?: 'cpu5c' } → the pod id, its host name and RunPod's own $/h. Honors the rentals pause.
  // repair: every talk off the air (state ≠ done) loses published_at → { cleared, ids } (11-01: 2187/2188 duplicates still dated as published)
  fastify.post('/ops/media/off-air-published', guard, async (req) => {
    const r = await (await import('../lib/repos/media-repo.js')).clearOffAirPublished();
    req.log.info({ cleared: r.cleared, by: by(req) }, 'off-air published_at cleared');
    return r;
  });
  fastify.post('/ops/media/cpu-pod', guard, async (req, reply) => {
    const b = req.body || {}, C = await import('../lib/media/cloud.js');
    try {
      const publicKey = (await import('fs/promises')).readFile(join((await import('os')).homedir(), '.ssh', 'id_ed25519.pub'), 'utf8').then((s) => s.trim()).catch(() => '');
      const pod = await C.createCpuPod({ publicKey: await publicKey, queueKey: (await import('../lib/repos/media-queue-repo.js')).machineKey(), vcpu: Number(b.vcpu) || 32, flavor: String(b.flavor || 'cpu5c').replace(/[^\w-]/g, '') });
      req.log.info({ pod, by: by(req) }, 'cpu pod rented');
      return pod;
    } catch (e) { return reply.code(400).send({ error: e.message }); }
  });
  // promote an Aorus-accepted whole-recording image (the pods' immutable image; never an ssh edit of data/run on tower)
  fastify.post('/ops/media/worker-image', guard, async (req, reply) => {
    const b = req.body || {}, r = await (await import('../lib/media/cloud.js')).promoteWorker({ image: b.image, evidence: b.evidence, home_image: b.home_image, quiet_hosts: b.quiet_hosts, by: by(req) });
    return r.error ? reply.code(400).send(r) : r;
  });
}
