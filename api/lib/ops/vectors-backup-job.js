// Ops job 'vectors-backup' (indexer service, its OWN `backup` lane — it never blocks indexing): copies the three vectors.db
// stores (paid Gemini embeddings) to /tank/sifter/backups/vectors/<store>/vectors.db with SQLite's online backup, paced,
// nice 19. Writes <dir>/vectors.db.partial, verifies the COPY, then rotates: vectors.db → vectors.prev.db, partial →
// vectors.db, + manifest.json. Repeatable (nightly-ready). A store whose writer job is running (or starts mid-copy) is
// SKIPPED, not waited for — the next run takes it. A complete .partial left by an interrupted run is adopted and verified,
// never copied again. Yields between stores to a drain. params { stores?: ['phrase','hype','concept'], destDir?, check?: 'auto'|'quick'
// |'integrity', pagesPerStep?, pauseMs? }. Plan: planning/storage-wear-ram-plan.md R1. Deps: vector-backup-repo, ops-report-repo.
import { existsSync, mkdirSync, renameSync, rmSync, statSync, statfsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { VECTOR_STORES, backupVectorStore, checkFor, adoptable, adoptionFacts } from '../repos/vector-backup-repo.js';
import { pendingRuns } from '../repos/ops-report-repo.js';
import { isDraining, drainReason } from '../drain.js';
import { logActivity } from '../repos/activity-repo.js';

export const DEFAULT_DEST = '/tank/sifter/backups/vectors';

/** Where one store's backup files live. Pure. */
export const backupPaths = (destDir, store) => {
  const dir = join(destDir, store);
  return { dir, partial: join(dir, 'vectors.db.partial'), current: join(dir, 'vectors.db'), prev: join(dir, 'vectors.prev.db'), manifest: join(dir, 'manifest.json') };
};

/** Validate params → the ordered list of stores to back up. Pure. */
export function storesToDo({ stores } = {}, map = VECTOR_STORES) {
  const list = stores?.length ? stores : Object.keys(map);
  for (const s of list) if (!map[s]) throw new Error(`vectors-backup: unknown store '${s}' (${Object.keys(map).join(' | ')})`);
  return list;
}

/** Abort the store being copied only for a real STOP. An update drain (SIGHUP) lets it finish — SQLite's backup cannot
 *  resume, and on 10-21 another agent's deploy threw away 101 of 240 GB — and the job yields between stores instead. */
export const abortCopy = (draining = isDraining(), reason = drainReason()) => draining && reason !== 'SIGHUP';

export async function vectorsBackupJob(params = {}, deps = {}) {
  const { backup = backupVectorStore, running = async (name) => (await pendingRuns(name)).filter((r) => r.status === 'running'), log = logActivity, storeMap = VECTOR_STORES } = deps;
  const destDir = params.destDir || DEFAULT_DEST;
  const todo = storesToDo(params, storeMap);
  const done = [], skipped = [];
  for (const [i, store] of todo.entries()) {
    if (isDraining()) return { yielded: true, resume: { stores: todo.slice(i) }, done, skipped };
    const { src, writers } = storeMap[store];
    const busy = [];
    for (const w of writers) { const live = await running(w); if (live.length) busy.push(`${w} #${live[0].id}`); }
    if (busy.length) { skipped.push({ store, reason: `${busy.join(', ')} writing it` }); log('job', `vectors-backup · ${store} skipped: ${busy.join(', ')} writing it — next run`); continue; }
    const p = backupPaths(destDir, store);
    mkdirSync(p.dir, { recursive: true });
    const srcBytes = statSync(src).size;
    const check = checkFor(srcBytes, params);
    const adopt = (() => { try { const f = adoptionFacts(src, p.partial); return !!f && adoptable(f); } catch { return false; } })();
    if (!adopt) {
      const fs = statfsSync(p.dir);
      if (fs.bavail * fs.bsize < srcBytes * 1.1) throw new Error(`vectors-backup: ${p.dir} has ${(fs.bavail * fs.bsize / 1e9).toFixed(0)} GB free, needs ${(srcBytes * 1.1 / 1e9).toFixed(0)} GB`);
      for (const f of [p.partial, `${p.partial}-journal`, `${p.partial}.copied`]) rmSync(f, { force: true });
    }
    log('job', `vectors-backup · ${store} · ${(srcBytes / 1e9).toFixed(1)} GB → ${p.dir} · ${adopt ? 'adopting the complete copy · ' : ''}${check}`);
    let r;
    try {
      r = await backup({ src, dest: p.partial, check, mode: adopt ? 'verify' : 'backup', ...(params.pagesPerStep ? { pagesPerStep: params.pagesPerStep } : {}), ...(params.pauseMs != null ? { pauseMs: params.pauseMs } : {}) },
        { shouldAbort: () => abortCopy(), onProgress: (m) => log('job', `vectors-backup · ${store} · ${(100 * (1 - m.remainingPages / m.totalPages)).toFixed(1)}%`) });
    } catch (err) {
      const complete = existsSync(`${p.partial}.copied`);
      if (!complete) rmSync(p.partial, { force: true });
      if (abortCopy()) return { yielded: true, resume: { stores: todo.slice(i) }, done, skipped };
      if (/source changed during the backup/.test(err.message)) { skipped.push({ store, reason: 'a writer started mid-copy' }); log('job', `vectors-backup · ${store} skipped: a writer started mid-copy — next run`); continue; }
      throw err;
    }
    if (!r.verdict.ok) {
      // keep the bad copy for a look as .bad (never promoted, never re-adopted); the previous good backup stays in place
      rmSync(`${p.partial}.copied`, { force: true });
      if (existsSync(p.partial)) renameSync(p.partial, `${p.partial}.bad`);
      throw new Error(`vectors-backup: ${store} copy FAILED verification: ${r.verdict.problems.join(' · ')} (kept at ${p.partial}.bad)`);
    }
    if (existsSync(p.current)) renameSync(p.current, p.prev);
    renameSync(p.partial, p.current);
    rmSync(`${p.partial}.copied`, { force: true });
    const manifest = { store, src, dest: p.current, bytes: r.fileBytes, pages: r.pageCount, page_size: r.pageSize, check: r.checkName,
      check_result: r.check, restarts: r.restarts, backup_ms: r.ms, check_ms: r.checkMs, ...(adopt ? { adopted: true } : {}), finished_at: new Date().toISOString() };
    writeFileSync(p.manifest, JSON.stringify(manifest, null, 1));
    done.push(manifest);
    log('job', `vectors-backup · ${store} ✓ ${(r.fileBytes / 1e9).toFixed(1)} GB · ${r.checkName} ok · ${Math.round(r.ms / 60000)} min`);
  }
  return { destDir, done, skipped };
}
