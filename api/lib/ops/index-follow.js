// Index follow-through for HyPE + concept claims: SQLite → Qdrant without a manual hype-index/concept-index (11-04: the last
// hype-index ran 10-20 and ~44K Bahá'í paragraphs of questions sat unsearchable). Two producers: settle hooks queue the
// settled docs at once; the indexer's follow loop queues docs whose ledger signature (generated:current) moved since their
// last successful index (marks in data/run/index-follow-<field>.json, written ONLY by the single-instance indexer).
// Spend: INDEX_FOLLOW_USD_DAY (default 1; 0 = off) under a per-day budget key. Deps: ops-report-repo, coverage-repo (lazy).
import fs from 'node:fs';
import path from 'node:path';

export const FOLLOW = { hype: { job: 'hype-index', layer: 'hype' }, concepts: { job: 'concept-index', layer: 'concepts' } };
export const CHUNK = 500;   // docs per queued run: one indexer process reads them by doc_id

export const followCapUsd = (env = process.env) => { const n = Number(env.INDEX_FOLLOW_USD_DAY ?? 1); return Number.isFinite(n) && n > 0 ? n : 0; };
/** The indexer's --max-usd is cumulative per --budget-key, so a dated key makes the cap a DAILY one. */
export const dailyKey = (field, now = new Date()) => `follow-${field}-${now.toISOString().slice(0, 10)}`;
export const followParams = (field, docs, { env = process.env, now = new Date() } = {}) => ({ docs: [...docs].map(Number).sort((a, b) => a - b), maxUsd: followCapUsd(env), budgetKey: dailyKey(field, now), follow: true });

/** Queue `<field>-index` for docs just written (settle hooks). Never throws: indexing late is better than a failed stage. */
export async function queueFollowIndex(field, docIds, requestedBy = 'settle', { enqueue = null, env = process.env, now = new Date(), log = console } = {}) {
  const f = FOLLOW[field]; if (!f) throw new Error(`index-follow: unknown field '${field}'`);
  const ids = [...new Set((docIds || []).map(Number).filter((n) => n > 0))];
  if (!ids.length || !followCapUsd(env)) return { queued: 0, off: !followCapUsd(env) };
  try {
    const q = enqueue || (await import('../repos/ops-report-repo.js')).enqueue;
    let queued = 0;
    for (let i = 0; i < ids.length; i += CHUNK) { await q(f.job, followParams(field, ids.slice(i, i + CHUNK), { env, now }), requestedBy); queued++; }
    return { queued, docs: ids.length };
  } catch (err) { log.warn?.({ err: err.message, field, docs: ids.length }, 'index-follow: enqueue failed (the follow loop will catch up)'); return { queued: 0, error: err.message }; }
}

export const signature = (r) => `${Number(r.generated) || 0}:${Number(r.current) || 0}`;

/** Pure. Ledger rows (generated > 0) vs marks → { due, seed }. A marked doc is due when its signature moved. An UNMARKED doc
 *  (first sight) is due only when visibly behind — fewer points than paragraphs with data (every such paragraph yields ≥ 1
 *  point) — otherwise it is seeded as current: partial older gaps are the one-off backlog command's job, not the loop's. */
export function followCandidates(rows, marks = {}) {
  const due = [], seed = {};
  for (const r of rows) {
    if (!(Number(r.generated) > 0)) continue;
    const id = Number(r.doc_id), sig = signature(r), m = marks[id];
    if (m === undefined) { if ((Number(r.indexed) || 0) < Number(r.generated)) due.push(id); else seed[id] = sig; }
    else if (m !== sig) due.push(id);
  }
  return { due, seed };
}

const marksFile = (field, dir) => path.join(dir, `index-follow-${field}.json`);
export function loadMarks(field, dir = path.join(process.cwd(), 'data', 'run')) {
  try { return JSON.parse(fs.readFileSync(marksFile(field, dir), 'utf8')); } catch { return null; }   // null = never ran (first sight)
}
export function saveMarks(field, marks, dir = path.join(process.cwd(), 'data', 'run')) {
  fs.mkdirSync(dir, { recursive: true });
  const f = marksFile(field, dir), t = `${f}.${process.pid}.tmp`;
  fs.writeFileSync(t, JSON.stringify(marks)); fs.renameSync(t, f);
}

/** The hype-index / concept-index job: run the indexer, then (on a clean 'done', not a scan or a budget stop) mark the docs it
 *  covered with their FRESH ledger signature — re-measured first for a docs run, the pre-run snapshot for a scope run — so
 *  the follow loop does not queue them again. deps are injectable for tests. */
export async function followedIndexJob(field, params = {}, deps = {}) {
  const { run = (await import('./phrase-index-job.js')).phraseIndexJob, dir = undefined } = deps;
  const cov = deps.coverage || await import('../repos/coverage-repo.js');
  const refresh = deps.refresh || (async (ids) => (await import('./coverage-job.js')).coverageRefreshJob({ ids }));
  const { follow: _f, ...p } = params || {};
  const snapshot = !p.docs?.length && !p.scanOnly ? await cov.layerRowsWithData(FOLLOW[field].layer).catch(() => null) : null;
  const out = await run({ ...p, field });
  if (p.scanOnly || out?.last?.phase !== 'done') return out;
  try {
    let rows;
    if (p.docs?.length) {
      await refresh(p.docs);
      const by = await cov.coverageForDocs(p.docs);
      rows = p.docs.map((id) => by[id]?.[FOLLOW[field].layer] && { doc_id: id, ...by[id][FOLLOW[field].layer] }).filter(Boolean);
    } else rows = snapshot || [];
    const marks = loadMarks(field, dir) || {};
    for (const r of rows) marks[Number(r.doc_id)] = signature(r);
    saveMarks(field, marks, dir);
    out.marked = rows.length;
  } catch (err) { out.markError = err.message; }   // the index ran; an unmarked doc is only re-sent (vectors are never paid twice)
  return out;
}

/** One follow pass (the indexer's loop): per field, unless off or a follow run is already waiting, queue the docs due. */
export async function followPass({ env = process.env, now = new Date(), dir = undefined, deps = {} } = {}) {
  if (!followCapUsd(env)) return { off: true };
  const cov = deps.coverage || await import('../repos/coverage-repo.js');
  const reports = deps.reports || await import('../repos/ops-report-repo.js');
  const res = {};
  for (const [field, f] of Object.entries(FOLLOW)) {
    if ((await reports.pendingRuns(f.job)).some((r) => r.params?.follow)) { res[field] = { waiting: true }; continue; }   // one follow run in flight per field
    const last = await reports.latest(f.job).catch(() => null);   // today's cap already reached: wait for tomorrow's key, don't respawn a run that stops at once
    // (a stop for a full RAM tier is not a cap: the run queued a fold, and the next pass sends the rest — Chad 11-10)
    if (last?.params?.budgetKey === dailyKey(field, now) && last?.result?.last?.phase === 'stopped' && !/^hot RAM disk/.test(String(last?.result?.last?.reason || ''))) { res[field] = { capReached: true }; continue; }
    const marks = loadMarks(field, dir);
    const { due, seed } = followCandidates(await cov.layerRowsWithData(f.layer), marks || {});
    // re-read before writing: a follow run in this same process may have marked docs during the ledger read; its marks win
    if (Object.keys(seed).length) saveMarks(field, { ...seed, ...(loadMarks(field, dir) || {}) }, dir);
    const r = await queueFollowIndex(field, due, 'follow-loop', { enqueue: reports.enqueue, env, now });
    res[field] = { due: due.length, seeded: Object.keys(seed).length, ...r };
  }
  return res;
}
