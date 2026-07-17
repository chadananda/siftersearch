// pipeline/queue — the grounding WORK QUEUE + its supervisor. The API owns the work ORDER and advances it
// itself, so processing never depends on an operator (or an agent's polling loop) being alive to launch the next
// book: when a slot frees, the next queued book starts. A dead babysitter must not mean a dead pipeline.
//
// Two concurrency rules, both learned the hard way:
//  1. MAX_CONCURRENT — books on DIFFERENT providers don't contend (Persian→anthropic ∥ English→deepseek), so >1 is
//     a real speedup; the cap just bounds the box.
//  2. ONE TAIL AT A TIME — from `project` onward a run mutates the SHARED entity graph, and `merge` is global (it
//     takes no docId). Two books there at once race: one merges same-name entities while the other is still
//     creating them. A run bounded before `project` (e.g. --to=research) is tail-free and always co-runnable.
// Deps: ../db, ./state (live runs), ./spawn (the one launcher), ./run-grounding (the stage order).
import { query, queryAll, queryOne } from '../db.js';
import { activeRuns } from './state.js';
import { spawnGrounding } from './spawn.js';
import { GROUNDING_STAGES } from './run-grounding.js';
import { logger } from '../logger.js';

const MAX_CONCURRENT = Number(process.env.GROUNDING_MAX_CONCURRENT || 2);
const TAIL_FROM = GROUNDING_STAGES.indexOf('project');   // first stage that touches the shared graph
const TICK_MS = 20000;

const parseOpts = (r) => { try { return r.opts_json ? JSON.parse(r.opts_json) : {}; } catch { return {}; } };
/** Does a run intend to reach the graph-mutating tail? Decided by its BOUND (`to`), not its current stage — a
 *  full run sitting in disambiguate will still collide at the tail later. */
export const ownsTail = (opts = {}) =>
  (opts.to ? GROUNDING_STAGES.indexOf(opts.to) : GROUNDING_STAGES.length - 1) >= TAIL_FROM;

/** Add a book to the work order. Returns the queued row. */
export async function enqueue({ docId, note = null, position = null, ...opts }) {
  const pos = position ?? (((await queryOne(`SELECT MAX(position) m FROM grounding_queue WHERE status='queued'`))?.m ?? 0) + 1);
  await query(`INSERT INTO grounding_queue (doc_id, opts_json, position, note) VALUES (?, ?, ?, ?)`,
    [Number(docId), JSON.stringify(opts), pos, note]);
  const row = await queryOne(`SELECT * FROM grounding_queue WHERE id = last_insert_rowid()`);
  logger.info({ docId: Number(docId), position: pos, opts }, 'grounding queued');
  return row;
}

/** The work order + terminal history (newest first), for the monitor. */
export async function list({ limit = 50 } = {}) {
  const rows = await queryAll(
    `SELECT * FROM grounding_queue WHERE status IN ('queued','running')
       UNION ALL SELECT * FROM (SELECT * FROM grounding_queue WHERE status NOT IN ('queued','running')
         ORDER BY COALESCE(finished_at, enqueued_at) DESC LIMIT ?)`, [limit]);
  return rows.map((r) => ({ ...r, opts: parseOpts(r), opts_json: undefined }));
}

/** Drop a queued item (or mark a running one cancelled — the proc itself is stopped via /grounding/stop). */
export async function cancel(id) {
  await query(`UPDATE grounding_queue SET status='cancelled', finished_at=unixepoch() WHERE id=? AND status='queued'`, [Number(id)]);
  return queryOne(`SELECT * FROM grounding_queue WHERE id=?`, [Number(id)]);
}

/**
 * One supervisor pass: reconcile queue rows against reality, then fill any free slot.
 * Idempotent and cheap — safe to call on a timer.
 */
export async function tick() {
  const live = await activeRuns();
  const liveDocs = new Set(live.map((r) => r.doc_id));

  // A 'running' row whose proc is gone has finished (or died). run_json is cleared by the executor's finally, so
  // "not live" is the completion signal. Don't guess success — record it and let the roadmap's done flag speak.
  for (const r of await queryAll(`SELECT * FROM grounding_queue WHERE status='running'`)) {
    if (!liveDocs.has(r.doc_id) && r.started_at && (Date.now() / 1000 - r.started_at) > 60) {
      await query(`UPDATE grounding_queue SET status='done', finished_at=unixepoch() WHERE id=?`, [r.id]);
      logger.info({ docId: r.doc_id, id: r.id }, 'grounding queue: run finished');
    }
  }

  if (live.length >= MAX_CONCURRENT) return { started: [], live: live.length };
  // A live run owns the tail if its own bound says so (run_json carries toStage); unknown bound → assume it does,
  // because assuming otherwise is what causes a graph race.
  const tailBusy = live.some((r) => ownsTail({ to: r.toStage }));

  const started = [];
  for (const r of await queryAll(`SELECT * FROM grounding_queue WHERE status='queued' ORDER BY position ASC, id ASC`)) {
    if (live.length + started.length >= MAX_CONCURRENT) break;
    const opts = parseOpts(r);
    if (liveDocs.has(r.doc_id)) continue;                          // that book is already grounding
    if (ownsTail(opts) && (tailBusy || started.some((s) => s.ownsTail))) continue;  // one graph-mutating run at a time
    const pid = spawnGrounding(r.doc_id, opts);
    await query(`UPDATE grounding_queue SET status='running', started_at=unixepoch(), pid=? WHERE id=?`, [pid, r.id]);
    started.push({ id: r.id, docId: r.doc_id, pid, ownsTail: ownsTail(opts) });
  }
  return { started, live: live.length };
}

let timer = null;
/** Start the supervisor loop. Safe to call once at boot; a failed tick never kills it. */
export function startSupervisor() {
  if (timer) return timer;
  timer = setInterval(() => { tick().catch((e) => logger.warn({ err: e.message }, 'grounding supervisor tick failed')); }, TICK_MS);
  timer.unref?.();
  logger.info({ maxConcurrent: MAX_CONCURRENT, tickMs: TICK_MS }, 'grounding supervisor started');
  return timer;
}
