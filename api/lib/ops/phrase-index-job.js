// Ops job: run the phrase indexer (scripts/phrase-index/indexer.mjs) as a child of the ops worker. The worker runs ONE job
// at a time, so two indexers can never share the vector store again (10-11: a second indexer + a coverage scan locked
// /tank/…/vectors.db and killed the first one mid-run). params: { docs?: ids[], scope?, tier? (core|gray|supplemental: doctrinal tier, both scopes, per paragraph), maxUsd, budgetKey, field?, store?, collection? }
// — maxUsd required; field 'hype' | 'concepts' | 'premises' indexes those units into their own store + collection (see the indexer header).
import { spawn } from 'child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync } from 'fs';
import { dirname, join } from 'path';

const FIELD_TARGET = { hype: ['/tank/sifter/hype-vectors/vectors.db', 'hype'], concepts: ['/tank/sifter/concept-vectors/vectors.db', 'concepts'], premises: ['/tank/sifter/premise-vectors/vectors.db', 'premises'] };
// scanOnly: the indexer's own dry run (--scan-only) — what would be embedded and its est_usd; spends nothing, so no maxUsd
export function indexerArgs({ docs = null, docsFile = null, scope = null, maxUsd, budgetKey = 'ops-phrase-index', field = null, limit = 0, scanOnly = false, tier = null } = {}) {
  if (!scanOnly && !(maxUsd > 0)) throw new Error('phrase-index: maxUsd is required (spend cap)');
  if (field && !FIELD_TARGET[field]) throw new Error(`phrase-index: unknown field '${field}' (hype | concepts | premises)`);
  if (tier && !['core', 'gray', 'supplemental', 'all'].includes(tier)) throw new Error(`phrase-index: unknown tier '${tier}' (core | gray | supplemental | all)`);
  const [store, collection] = FIELD_TARGET[field] || [];
  return ['scripts/phrase-index/indexer.mjs', ...(docsFile ? ['--docs-file', docsFile] : docs?.length ? ['--docs', docs.join(',')] : scope ? ['--scope', scope] : []),
    ...(tier && tier !== 'all' && !docsFile && !docs?.length ? ['--tier', tier] : []),
    ...(field ? ['--field', field, '--store', store, '--collection', collection] : []), ...hotArgs(process.env, field),
    ...(scanOnly ? ['--scan-only'] : ['--embed', '--qdrant', '--max-usd', String(maxUsd)]), '--budget-key', budgetKey, ...(limit > 0 ? ['--limit', String(Math.floor(limit))] : [])];
}

/** The RAM write tier (Chad 11-10): with QDRANT_HOT_URL set, NEW phrase points go to the RAM-disk Qdrant, and so do HyPE
 *  points when QDRANT_HOT_HYPE names their hot collection; qdrant-hot-fold moves them to main in bulk. Concepts: never. */
export const hotArgs = (env = process.env, field = null) => {
  if (!env.QDRANT_HOT_URL) return [];
  const coll = !field ? (env.QDRANT_HOT_PHRASES || 'phrases_hot') : field === 'hype' ? env.QDRANT_HOT_HYPE : null;
  return coll ? ['--hot-url', env.QDRANT_HOT_URL, '--hot-collection', coll] : [];
};

/** After a qdrant-hot restart or crash: re-send every unit the RAM disk lost, from stored vectors (no spend); units the fold
 *  already moved to main are re-marked as main. field null = phrases, 'hype' = HyPE. */
export const reconcileArgs = (env = process.env, field = null) => {
  if (!env.QDRANT_HOT_URL) throw new Error('hot-reconcile: QDRANT_HOT_URL is not set');
  const hot = hotArgs(env, field);
  if (!hot.length) throw new Error(`hot-reconcile: no hot collection for ${field || 'phrases'}`);
  const [store, collection] = FIELD_TARGET[field] || [];
  return ['scripts/phrase-index/indexer.mjs', ...(field ? ['--field', field, '--store', store, '--collection', collection] : []), '--qdrant', '--reconcile-hot', ...hot];
};

export const phraseHotReconcileJob = () => phraseIndexJob({}, reconcileArgs());
export const hypeHotReconcileJob = () => phraseIndexJob({ field: 'hype' }, reconcileArgs(process.env, 'hype'));

/** The indexer stopped because the RAM tier is full (its reason starts 'hot RAM disk'). Pure. */
export const isHotFull = (last) => last?.phase === 'stopped' && /^hot RAM disk/.test(String(last?.reason || ''));
/** A hot-full stop → fold that collection, then (an explicit phrase run) continue the same run after the fold in the same lane.
 *  Never a stall: the fold makes the room. A continuation that again moved nothing after HOT_RETRY_MAX tries stops, loudly. */
export const HOT_RETRY_MAX = 3;
export async function afterHotFull(params = {}, last, enqueue = null, log = null) {
  if (!isHotFull(last)) return null;
  const q = enqueue || (await import('../repos/ops-report-repo.js')).enqueue;
  const fold = params.field === 'hype' ? 'hype-hot-fold' : 'phrase-hot-fold';
  await q(fold, {}, 'hot-full');
  // by design, not broken: one activity line, no alarm. Same lane (1 worker, claimed oldest-first): the fold runs before the continuation
  if (log) await log(`RAM tier full → ${fold} queued, indexing resumes after`);
  const retry = (Number(params.hotRetry) || 0) + 1;
  const moved = Number(last.upserted ?? last.sent ?? 0) > 0;
  // follow runs (hype) are re-queued by the follow loop; reconcile runs are prebuilt (no params to continue)
  if (params.follow || params.field || (!moved && retry > HOT_RETRY_MAX)) {
    if (!moved && retry > HOT_RETRY_MAX && log) await log(`⚠ phrase-index: RAM tier still full after ${HOT_RETRY_MAX} folds — not continuing (check phrase-hot-fold)`);
    return { fold, continued: false };
  }
  // params must DIFFER from the running job's: enqueue reuses an identical queued/running run, i.e. this very job (11-11: no
  // continuation row was ever created, run 1393285)
  await q('phrase-index', { ...params, hotRetry: moved ? 0 : retry, hotRound: (Number(params.hotRound) || 0) + 1 }, 'hot-full-continue');
  return { fold, continued: true };
}

/** A big run (scope/tier, no docs list) that finished with points in the RAM tier → ask for a fold in the next quiet hours. */
export function markFoldWanted(params = {}, last, file = join(process.cwd(), 'data', 'run', 'hot-fold-wanted.json'), env = process.env) {
  if (!env.QDRANT_HOT_URL || params.docs?.length || last?.phase !== 'done' || !(Number(last.upserted) > 0)) return false;
  const coll = params.field === 'hype' ? 'hype' : !params.field ? 'phrases' : null;
  if (!coll || !hotArgs(env, params.field || null).length) return false;
  let w = {}; try { w = JSON.parse(readFileSync(file, 'utf8')); } catch { /* none yet */ }
  w[coll] = new Date().toISOString();
  mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, JSON.stringify(w));
  return true;
}

/** A docs list above this many ids goes to the indexer as a file (11-07: 28,721 ids on argv → spawn E2BIG). */
export const DOCS_ARGV_MAX = 1000;
const docsFileFor = (docs) => {
  const f = join(process.cwd(), 'data', 'run', `phrase-docs-${process.pid}-${Date.now()}.txt`);
  mkdirSync(dirname(f), { recursive: true }); writeFileSync(f, docs.join('\n'));
  return f;
};

// A docs run re-measures its documents into the coverage ledger (11-08: the ledger lagged 8 h behind, so the follow-through
// re-queued the same 2,000 indexed docs every 10 minutes — 1,771 of them already had their points)
export async function remeasureAfter({ docs = null, scanOnly = false } = {}, enqueue = null) {
  if (scanOnly || !docs?.length) return false;
  const q = enqueue || (await import('../repos/ops-report-repo.js')).enqueue;
  await q('coverage-refresh', { ids: docs.map(Number) }, 'phrase-index');
  return true;
}

/** A finished run's follow-ups (re-measure, fold + continue on a full RAM tier, fold wish), AWAITED before the job resolves:
 *  a draining service exits the moment its jobs resolve, and a fire-and-forget enqueue died with it (11-10: the core and
 *  supplemental tier runs stopped hot-full and were never continued). */
export async function followUps(params, last, prebuilt = null, deps = {}) {
  const { enqueue = null, log = async (m) => (await import('../repos/activity-repo.js')).logActivity('index', m) } = deps;
  // a docs run that found nothing to embed or send: those documents yield no phrase units → ledger leaves them out, BEFORE the re-measure
  if (!prebuilt && params.docs?.length && !params.field && !params.scanOnly && !params.limit && last?.phase === 'done' && !last.units && !last.embedded && !last.upserted)
    await (deps.markUnyielding || (async (ids) => (await import('../repos/coverage-repo.js')).savePhraseUnyielding(ids)))(params.docs)
      .catch((err) => console.warn(`phrase unyielding mark failed: ${err.message}`));
  await remeasureAfter(params, enqueue).catch(() => {});
  if (prebuilt) return null;
  const hot = await afterHotFull(params, last, enqueue, log).catch((err) => { console.warn(`hot-full follow-up failed: ${err.message}`); return null; });
  try { markFoldWanted(params, last, deps.wantedFile); } catch { /* best effort: the fold loop still folds by fill */ }
  return hot;
}

export function phraseIndexJob(params = {}, prebuilt = null) {
  const docsFile = !prebuilt && params.docs?.length > DOCS_ARGV_MAX ? docsFileFor(params.docs) : null;
  const args = prebuilt || indexerArgs({ ...params, docsFile });
  return new Promise((resolve, reject) => {
    const child = spawn('nice', ['-n', '10', process.execPath, ...args], { cwd: process.cwd(), env: process.env });
    let last = null, tail = '', logged = 0;
    const field = params.field || 'phrases';
    const fmt = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : String(n ?? 0));
    const take = (buf) => {
      for (const line of String(buf).split('\n')) {
        if (!line.includes('"phase"')) continue;
        try { last = JSON.parse(line); } catch { continue; }
        // the Observatory's terminal: one progress line per ≥45 s (activity-repo; content-free)
        if (last.phase === 'chunk' && Date.now() - logged > 20000) {
          logged = Date.now();
          import('../repos/activity-repo.js').then(({ logActivity }) => logActivity('index', `${field} · ${fmt(last.paragraphs)} ¶ read · ${fmt(last.embedded)} embedded · ${fmt(last.upserted)} upserted${last.paras_per_hour ? ` · ${fmt(last.paras_per_hour)} ¶/h` : ''}${last.spent?.usd != null ? ` · $${last.spent.usd.toFixed(2)}` : ''}`)).catch(() => {});
        }
      }
      tail = (tail + buf).slice(-2000);
    };
    child.stdout.on('data', take); child.stderr.on('data', (buf) => { tail = (tail + buf).slice(-2000); });   // stderr = progress/wait notes: tail only, never `last`
    child.on('exit', async (code) => {
      if (docsFile) rmSync(docsFile, { force: true });
      const hot = code === 0 ? await followUps(params, last, prebuilt) : null;
      // hotFull: a by-design stop whose fold + continuation are queued — the service must not mail "stopped short" for it
      return code === 0 ? resolve({ code, last, ...(hot?.continued ? { hotFull: { fold: hot.fold, continued: true } } : {}) }) : reject(new Error(`indexer exit ${code}: ${(tail.match(/^.*Error: .*$/m)?.[0] || '').slice(0, 400)} … ${tail.slice(-300)}`));
    });
  });
}
