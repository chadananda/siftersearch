// grounding — the internal HTTP control plane for the entity-grounding pipeline. THIN wrappers over the shared
// executor (api/lib/pipeline/run-grounding.js via the complete-book CLI) + state (api/lib/pipeline/state.js) +
// the entity store: live status/queue reads, idempotent start/stop, reversible merge, entity backup. Operator,
// orchestrator, and UI drive grounding through this ONE surface instead of ad-hoc SSH/SQL.
// Mounted at /api/admin (requireInternal — X-Internal-Key === DEPLOY_SECRET or admin JWT). Writes route to the
// single writer (the API process sets SIFTER_WRITER_URL), so no direct-write contention.
import { spawn } from 'child_process';
import fs from 'node:fs';
import { requireInternal } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import * as state from '../lib/pipeline/state.js';
import { makeStore } from '../lib/rag-adapter/store.js';
import { getIntegrationProgress } from '../lib/bio.js';
import { logger } from '../lib/logger.js';

const parseRun = (rj) => { try { return rj ? JSON.parse(rj) : null; } catch { return null; } };
// Live only if the run heartbeated within 150s (executor refreshes every 30s). A crashed/killed book stops
// heartbeating → treated as not-running so /start can relaunch it instead of 409-ing on a stale marker.
const isLive = (run) => {
  if (!run || !run.stage || run.stage === 'done') return false;
  const ts = run.updatedAt ? Date.parse(run.updatedAt) : 0;
  return Date.now() - ts < 150000;
};

export default async function groundingRoutes(fastify) {
  const admin = { preHandler: requireInternal };

  // LIVE status — the full roadmap + the driver-reported active book (the same payload the UI reads).
  fastify.get('/grounding/status', admin, async () => getIntegrationProgress());

  // The enabled worklist in priority order: each doc's coarse stage status + live run.
  fastify.get('/grounding/books', admin, async () => {
    const rep = await state.statusReport();
    return { totals: rep.totals, books: rep.enabled.map(({ run_json, ...b }) => ({ ...b, run: parseRun(run_json) })) };
  });

  // One book's full pipeline row.
  fastify.get('/grounding/books/:docId', admin, async (req) => {
    const row = await state.getRow(Number(req.params.docId));
    if (!row) throw ApiError.notFound('doc not in pipeline');
    const { run_json, ...rest } = row;
    return { ...rest, run: parseRun(run_json) };
  });

  // START grounding a book — spawns the executor detached (replaces manual `ssh nohup`). Idempotent: 409 if live.
  // Supports FULL runs and RE-PROCESSING runs: `from=<stage>` resumes from a stage, `only=<stage>` runs one stage
  // (e.g. only=research to re-resolve just the uncertains) — both report live via run_json exactly like a full run.
  fastify.post('/grounding/start', admin, async (req) => {
    const { docId, from, only, cc } = req.body || {};
    if (!docId) throw ApiError.badRequest('docId required');
    if (isLive(await state.getRun(Number(docId)))) throw ApiError.conflict(`doc ${docId} is already grounding`);
    const args = [`${process.cwd()}/scripts/complete-book.mjs`, String(docId)];
    if (from) args.push(`--from=${from}`);
    if (only) args.push(`--only=${only}`);
    if (cc) args.push(`--cc=${cc}`);
    // Send the detached CLI's output to a per-doc log (was stdio:'ignore', which hid crashes — a silent mid-stage
    // exit was undiagnosable). Falls back to 'ignore' if the log can't be opened.
    let outFd = 'ignore';
    try { outFd = fs.openSync(`${process.cwd()}/logs/grounding-${Number(docId)}.log`, 'a'); } catch { outFd = 'ignore'; }
    const child = spawn(process.execPath, args, {
      cwd: process.cwd(), detached: true, stdio: ['ignore', outFd, outFd],
      env: { ...process.env, SIFTER_WRITER_URL: process.env.SIFTER_WRITER_URL || 'http://127.0.0.1:7849' },
    });
    child.unref();
    if (typeof outFd === 'number') { try { fs.closeSync(outFd); } catch { /* child keeps its copy */ } }
    logger.info({ docId: Number(docId), pid: child.pid, from, only, cc }, 'grounding started via control API');
    return { started: true, docId: Number(docId), pid: child.pid, from: from || null, only: only || null, cc: Number(cc) || 8 };
  });

  // STOP a live run — signal the reported pid (best-effort) and clear the run marker so the UI goes idle.
  fastify.post('/grounding/stop', admin, async (req) => {
    const { docId } = req.body || {};
    if (!docId) throw ApiError.badRequest('docId required');
    const run = await state.getRun(Number(docId));
    if (!run?.pid) throw ApiError.notFound(`no live run for doc ${docId}`);
    let signalled = false;
    try { process.kill(run.pid, 'SIGTERM'); signalled = true; } catch { /* already gone */ }
    await state.setRun(Number(docId), null);
    logger.info({ docId: Number(docId), pid: run.pid, signalled }, 'grounding stopped via control API');
    return { stopped: true, docId: Number(docId), pid: run.pid, signalled };
  });

  // MERGE entities — reversible (repoints mentions+claims, records an append-only decision). Replaces raw SQL merges.
  fastify.post('/grounding/merge', admin, async (req) => {
    const { canonicalId, mergeIds, reason } = req.body || {};
    if (!canonicalId || !Array.isArray(mergeIds) || !mergeIds.length) throw ApiError.badRequest('canonicalId + non-empty mergeIds[] required');
    const ids = mergeIds.map(Number).filter((n) => n && n !== Number(canonicalId));
    if (!ids.length) throw ApiError.badRequest('no valid mergeIds (distinct from canonicalId)');
    const merged = await makeStore().applyMerge(Number(canonicalId), ids, reason || 'merge via control API');
    logger.info({ canonicalId: Number(canonicalId), mergeIds: ids, reason }, 'entities merged via control API');
    return { merged, canonicalId: Number(canonicalId), mergeIds: ids };
  });

  // BACKUP the small entity tables (gz) — the operator's manual dump, on demand.
  fastify.post('/grounding/backup', admin, async () => {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
    const out = `/tank/backups/entity/entity-tables-${stamp}.sql.gz`;
    const cmd = `sqlite3 ${process.cwd()}/data/sifter.db ".dump graph_entities entity_research entity_mentions_v2 entity_decisions entity_claims" | gzip > ${out}`;
    await new Promise((res, rej) => {
      const c = spawn('sh', ['-c', cmd], { stdio: 'ignore' });
      c.on('exit', (code) => (code === 0 ? res() : rej(new Error(`backup exit ${code}`))));
      c.on('error', rej);
    });
    logger.info({ out }, 'entity tables backed up via control API');
    return { backedUp: true, path: out };
  });
}
