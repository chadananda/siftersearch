// Ops reports over the internal API — the ONLY way scripts and agents ask production about library health. Runs are
// queued here and executed by siftersearch-reports; nothing in this route scans a table. Auth: requireInternal.
import { join, dirname } from 'path';
import { requireInternal } from '../lib/auth.js';
import { enqueue, getRun, latest, recent, failed, cancel } from '../lib/repos/ops-report-repo.js';
import { reportNames } from '../lib/ops/reports.js';
import { ApiError } from '../lib/errors.js';
import { readDeployStatus } from '../lib/ops/deploy-status.js';
import deweyJobsOps from './dewey-jobs-ops.js';
import mediaOps from './media-ops.js';

export default async function opsReportRoutes(fastify) {
  await fastify.register(mediaOps);   // media progress / status / add / redo over the stage ledger (api/routes/media-ops.js)
  await fastify.register(deweyJobsOps);   // Dewey's job registry + worker contract (api/routes/dewey-jobs-ops.js)
  const known = (name) => { if (!reportNames().includes(name)) throw ApiError.notFound?.(`unknown report ${name}`) ?? Object.assign(new Error(`unknown report ${name}`), { statusCode: 404 }); };
  // Biography slugs, minted in small batches through the single writer (never one large UPDATE): call repeatedly until left = 0.
  fastify.post('/ops/bio-slugs/backfill', { preHandler: requireInternal }, async (req) => {
    const limit = Math.min(Math.max(Number(req.body?.limit) || 25, 1), 50);
    const { listBioPersons } = await import('../lib/bio.js');
    const { unslugged, ensureBioSlug, slugsFor } = await import('../lib/repos/bio-slug-repo.js');
    const ids = (await listBioPersons()).persons.map((p) => p.id);
    const todo = await unslugged(ids, limit); const minted = [];
    for (const id of todo) minted.push({ id, slug: await ensureBioSlug(id) });
    const have = await slugsFor(ids);
    return { minted, with_slug: have.size, total: ids.length, left: ids.length - have.size };
  });
  // Dewey email allowlist (ops.mjs dewey-allow add|remove|list): pre-approve addresses; verified sign-ins get dewey_access
  fastify.get('/ops/dewey-allow', { preHandler: requireInternal }, async () => ({ allowlist: await (await import('../lib/repos/contributors-repo.js')).list() }));
  fastify.post('/ops/dewey-allow', { preHandler: requireInternal }, async (req) => (await import('../lib/repos/contributors-repo.js')).allow(req.body?.email, req.body?.note || null));
  fastify.post('/ops/dewey-allow/remove', { preHandler: requireInternal }, async (req) => (await import('../lib/repos/contributors-repo.js')).disallow(req.body?.email, !!req.body?.revoke));
  // Index coverage (planning/index-coverage-plan.md): every layer by tradition × scope, or one document — ledger reads only
  fastify.get('/ops/coverage', { preHandler: requireInternal }, async () => (await import('../lib/repos/coverage-repo.js')).coverageSummary());
  fastify.get('/ops/coverage/:docId', { preHandler: requireInternal }, async (req) => ({ doc_id: Number(req.params.docId),
    layers: await (await import('../lib/repos/coverage-repo.js')).docCoverage(req.params.docId) }));
  // WHAT IS SIFTERSEARCH WORKING ON (Chad 10-19: "I cannot see what siftersearch is working on"; "a coordinator service and
  // an internal API with health for each service"): every service's heartbeat (version, health, work in flight), the ops
  // jobs running now, and the Anís answers being researched (api/lib/service-heartbeat.js, jobs/async-jobs.js)
  // DEPLOY STATUS: every updater attempt (deployed|refused|pending + reason) so the pushing agent can check its own commit — scripts/ops/deploy-check.mjs
  fastify.get('/ops/deploy', { preHandler: requireInternal }, async () => readDeployStatus(join(process.cwd(), 'data', 'run', 'deploy-status.json')));
  fastify.get('/ops/services', { preHandler: requireInternal }, async () => {
    const { readServices, headCommit } = await import('../lib/service-heartbeat.js');
    // the job store's own view: a record whose process died or that outran MAX_RUNNING_MS is reaped as 'lost', not listed
    let answers = [];
    try {
      answers = (await import('../lib/jobs/async-jobs.js')).jobStore().active()
        .map((j) => ({ key: j.key, kind: j.kind, running_s: Math.round((Date.now() - j.started_at) / 1000) }));
    } catch { /* no jobs yet */ }
    const runs = (await recent(40)).filter((r) => r.status === 'running' || r.status === 'queued')
      .map((r) => ({ id: r.id, name: r.name, status: r.status, started_at: r.started_at, requested_at: r.requested_at }));
    const { powerState, powerLine } = await import('../lib/power-mode.js');
    // the paid-GPU ledger (Chad 10-24): rented vs busy minutes per pod, $ rented vs $ productive, the lane's last beat, the reaper's last pass
    let cloud_gpu = null;
    try {
      const C = await import('../lib/media/cloud.js'), { ledgerSummary } = await import('../lib/media/pod-ledger.js'), fs = await import('fs/promises');
      const st = JSON.parse(await fs.readFile(C.STATE_FILE, 'utf8')), beat = Number(await fs.readFile(`${C.STATE_FILE}.beat`, 'utf8').catch(() => 0));
      if (beat > (st.updated || 0)) st.updated = beat;
      const reaper = await fs.readFile((await import('../lib/media/pod-reaper.js')).REAPER_FILE, 'utf8').then(JSON.parse).catch(() => null);
      cloud_gpu = { ...ledgerSummary(st, Date.now(), C.spendOf, C.CLOUD.capUsd()), rentals_paused: await C.rentalPauseReason(), reaper: reaper ? { at: reaper.at, seen: reaper.seen, reaped: reaper.history?.slice(0, 5) || [] } : null };
    } catch { /* no cloud run yet */ }
    let host_memory = null;
    try { host_memory = JSON.parse(await (await import('fs/promises')).readFile(join(dirname((await import('../lib/media/cloud.js')).STATE_FILE), 'host-memory.json'), 'utf8')); host_memory.age_s = Math.round((Date.now() - host_memory.at) / 1000); } catch { /* not written yet */ }
    let remaster_quality = null;
    try { remaster_quality = JSON.parse(await (await import('fs/promises')).readFile(join(dirname((await import('../lib/media/cloud.js')).STATE_FILE), 'remaster-quality.json'), 'utf8')); remaster_quality.review = remaster_quality.review?.length; remaster_quality.unrepairable = remaster_quality.unrepairable?.length; } catch { /* not run yet */ }
    const { attempts: _a, ...deploy } = readDeployStatus(join(process.cwd(), 'data', 'run', 'deploy-status.json'));
    return { head: headCommit(), deploy, power: powerState() ? { ...powerState(), line: powerLine() } : { mode: 'normal' }, services: readServices(), ops_jobs: runs, anis_answers: answers, cloud_gpu, remaster_quality, host_memory };
  });
  // NIGHT SCHEMA MAINTENANCE (10-24): named steps only — scripts/ops/db-maintenance.sh calls them one at a time with the
  // writers drained around each (a DROP frees a whole b-tree inside the single writer). No arbitrary SQL. maintenance-repo.js
  fastify.get('/ops/maintenance', { preHandler: requireInternal }, async () => {
    const { MAINTENANCE_STEPS, existing } = await import('../lib/repos/maintenance-repo.js');
    const present = new Set(await existing(MAINTENANCE_STEPS.filter((s) => s.kind === 'index' || s.kind === 'table').map((s) => s.name)));
    return { steps: MAINTENANCE_STEPS.map((s) => ({ name: s.name, kind: s.kind, why: s.why, ...(s.kind === 'index' || s.kind === 'table' ? { exists: present.has(s.name) } : {}) })) };
  });
  fastify.post('/ops/maintenance/:step', { preHandler: requireInternal }, async (req) =>
    (await import('../lib/repos/maintenance-repo.js')).runMaintenanceStep(req.params.step));
  // MEDIA SUPERSEDE (Chad 10-28): replace a published talk's source audio, keep the old original + meta (original-superseded/vN), revert any time.
  // Body { slug, newSource, evidence: { duration_s, sample_text|overlap }, reason, by, force, write }. write=false answers the plan only.
  const supersede = async (req, action) => (await import('../lib/media/supersede.js')).mediaSupersede({ ...(req.body || {}), action, by: req.body?.by || req.user?.email || 'internal' });
  fastify.post('/ops/media/supersede', { preHandler: requireInternal }, async (req) => supersede(req, req.body?.write ? 'apply' : 'plan'));
  fastify.post('/ops/media/supersede/revert', { preHandler: requireInternal }, async (req) => supersede(req, 'revert'));
  fastify.get('/ops/media/supersede/:slug', { preHandler: requireInternal }, async (req) => (await import('../lib/media/supersede.js')).mediaSupersede({ action: 'history', slug: req.params.slug }));
  // Failed ops jobs (the same ones that email "FAILED"): `ops.mjs failures [--hours N]` so nobody pastes mail.
  fastify.get('/ops/failures', { preHandler: requireInternal }, async (req) => ({ failures: await failed(req.query?.hours, req.query?.limit) }));
  fastify.get('/ops/reports', { preHandler: requireInternal }, async () => ({ reports: reportNames(), recent: await recent(20) }));
  fastify.post('/ops/reports/:name', { preHandler: requireInternal }, async (req) => {
    known(req.params.name);
    return enqueue(req.params.name, req.body?.params ?? null, req.user?.email || 'internal');
  });
  fastify.get('/ops/reports/:name/latest', { preHandler: requireInternal }, async (req) => { known(req.params.name); return (await latest(req.params.name)) || { status: 'none' }; });
  fastify.get('/ops/reports/runs/:id', { preHandler: requireInternal }, async (req) => (await getRun(Number(req.params.id))) || { status: 'none' });
  fastify.delete('/ops/reports/runs/:id', { preHandler: requireInternal }, async (req) => (await cancel(Number(req.params.id))) || { status: 'none' });
}
