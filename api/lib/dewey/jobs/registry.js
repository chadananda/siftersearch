// Dewey job registry service: start (caps + idempotency), advance (state machine + events + steps), retry, parent roll-up, ETA, cost.
// Sits over dewey-jobs-repo; the existing executors (ops_reports runs, dewey_items, the ingest folder) do the work. Never throws into callers
// that dual-write (track* wrappers swallow). makeRegistry(repo) lets tests inject an in-memory repo.
import * as realRepo from '../../repos/dewey-jobs-repo.js';
import { assertMove, isTerminal } from './states.js';
import { valve, checkCap, whoOf, globalState, globalCeilingUsd, isAdmin } from './policy.js';
import { createHash } from 'node:crypto';

const iso = () => new Date().toISOString();
export const idemKey = (kind, by, params) => createHash('sha256').update(`${kind}|${whoOf(by)}|${typeof params === 'string' ? params : JSON.stringify(params)}`).digest('hex').slice(0, 40);
const median = (a) => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : null; };

/** URLs are canonical for idempotency: lower-case host, no fragment, no trailing slash on the bare path, tracking params dropped. */
export function canonicalUrl(u) {
  try {
    const x = new URL(String(u).trim());
    x.hash = ''; x.hostname = x.hostname.toLowerCase();
    for (const k of [...x.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$|mc_)/i.test(k)) x.searchParams.delete(k);
    x.searchParams.sort();
    if (x.pathname.length > 1) x.pathname = x.pathname.replace(/\/+$/, '');
    return x.toString();
  } catch { return String(u).trim(); }
}

export function makeRegistry(repo = realRepo, { now = iso, sendNote = null } = {}) {
  /** Start a job. → { job, created } | { refused: 'disabled'|'cap', reason } */
  async function startJob({ kind, by, channel = 'chat', params = {}, key, parentId = null, notify = {}, itemId = null, state = 'received', caps = {}, free = false, maxAttempts = 3 }) {
    const v = await valve(repo);
    if (!v.on) return { refused: 'disabled', reason: v.why };
    const ik = key === null ? null : (key || idemKey(kind, by, params));
    if (ik) { const same = await repo.jobByIdem(ik); if (same) return { job: same, created: false }; }
    if (!free && by) {
      const c = await checkCap(repo, by, { jobs: parentId ? 0 : 1, ...caps });
      if (!c.ok) return { refused: 'cap', metric: c.metric, reason: c.reason };
    }
    const g = await globalState(repo, repo.dayOf());
    if (!free && g.over) { await repo.setFlag('paused', `Dewey's daily spend ceiling ($${globalCeilingUsd()}) was reached; jobs resume at midnight UTC or when the operator lifts the pause.`); return { refused: 'disabled', reason: 'Dewey has reached its daily spend ceiling.' }; }
    const r = await repo.createJob({ kind, by, channel, params, idemKey: ik, parentId, notify, itemId, state, maxAttempts });
    if (r.created) {
      await repo.addEvent(r.job.id, 'created', { kind, by: whoOf(by), channel, params: summarizeParams(params) });
      if (by && !parentId && !free) await repo.bumpUsage(whoOf(by), { jobs: 1 });
    }
    return r;
  }

  /** Move a job; records the event, maintains the steps list, finishes terminal jobs. → job */
  async function advance(id, to, { step = null, detail = null, counts = null, question = undefined, result = undefined, error = undefined, nextRunAt = undefined, itemId = undefined, from = null } = {}) {
    const job = await repo.getJob(id);
    if (!job) throw new Error(`dewey job ${id} not found`);
    if (isTerminal(job.state) && job.state !== to) return job;   // finished jobs stay finished
    assertMove(job.state, to);
    const at = now(), steps = [...(job.steps || [])];
    const open = steps.find((s) => s.state === 'running');
    if (open && (step !== open.name || isTerminal(to))) {
      open.state = 'done'; open.ended = at; open.s = Math.max(0, Math.round((Date.parse(at) - Date.parse(open.started)) / 1000));
      await repo.addEvent(id, 'step-done', { step: open.name, s: open.s }).catch(() => {});
    }
    if (step && !isTerminal(to) && !steps.find((s) => s.name === step && s.state === 'running')) steps.push({ name: step, state: 'running', started: at, detail });
    else if (step && detail) { const cur = steps.find((s) => s.name === step && s.state === 'running'); if (cur) cur.detail = detail; }
    const f = { state: to, step: isTerminal(to) ? null : (step ?? job.step), steps: steps.slice(-30), updated_at: at, lease_until: isTerminal(to) ? null : job.lease_until };
    if (counts) f.counts = { ...(job.counts || {}), ...counts };
    if (question !== undefined) f.question = question;
    if (result !== undefined) f.result = result;
    if (error !== undefined) f.error = error;
    if (nextRunAt !== undefined) f.next_run_at = nextRunAt;
    if (itemId !== undefined) f.item_id = itemId;
    if (isTerminal(to)) { f.finished_at = at; f.eta_at = null; if (to === 'failed' || to === 'cancelled') f.idem_key = null; }
    if (to !== 'awaiting-decision' && job.state === 'awaiting-decision') f.question = null;
    const ok = await repo.updateJob(id, f, { expectState: job.state });
    if (!ok) return repo.getJob(id);   // someone else moved it first
    if (job.state !== to) await repo.addEvent(id, 'state', { from: job.state, to, step: step || undefined, detail: detail || undefined });
    if (job.parent_id && (isTerminal(to) || to !== job.state)) await rollup(job.parent_id).catch(() => {});
    return repo.getJob(id);
  }

  async function note(id, type, data) { await repo.addEvent(id, type, data); }

  /** A failure: retry with backoff while attempts remain (and the error is retryable), else failed. → job */
  async function fail(id, err, { retryable = true } = {}) {
    const job = await repo.getJob(id), msg = String(err?.message || err).slice(0, 300);
    if (!job || isTerminal(job.state)) return job;
    await repo.addEvent(id, 'error', { error: msg, attempt: job.attempts });
    if (retryable && job.attempts < job.max_attempts) {
      const down = /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EHOSTUNREACH|ECONNRESET|EAI_AGAIN|answered 5\d\d|answered 429/.test(msg);   // the SOURCE is not answering: wait an hour, don't burn attempts fast
      const wait = down ? 3600_000 : 30_000 * 4 ** Math.max(0, job.attempts - 1);
      await repo.updateJob(id, { lease_until: null, worker: null, error: msg, next_run_at: new Date(Date.parse(now()) + wait).toISOString() });
      return advance(id, 'received', { step: 'retry', detail: down ? `the source is not answering (${msg.slice(0, 80)}); trying again in an hour (try ${job.attempts + 1} of ${job.max_attempts})` : `try ${job.attempts + 1} of ${job.max_attempts} in ${Math.round(wait / 1000)} s`, nextRunAt: new Date(Date.parse(now()) + wait).toISOString() });
    }
    return advance(id, 'failed', { error: msg });
  }

  /** Derive a parent's counts and state from its children. */
  async function rollup(parentId) {
    const parent = await repo.getJob(parentId);
    if (!parent || isTerminal(parent.state)) return parent;
    if (parent.state !== 'processing' && parent.state !== 'awaiting-decision') return parent;   // children are still being created: never finish early
    const kids = await repo.childrenOf(parentId);
    if (!kids.length) return parent;
    const c = { found: kids.length, checked: 0, dupes: 0, added: 0, handed: 0, skipped: 0, failed: 0, awaiting: 0, active: 0 };
    for (const k of kids) {
      if (k.state === 'published') c.added++;
      else if (k.state === 'handed-off') c.handed++;
      else if (k.state === 'skipped') { if (k.result?.reason === 'duplicate') c.dupes++; else c.skipped++; }
      else if (k.state === 'cancelled') c.skipped++;
      else if (k.state === 'failed') c.failed++;
      else if (k.state === 'awaiting-decision') c.awaiting++;
      else c.active++;
      if (!['received', 'inspecting', 'fetching'].includes(k.state)) c.checked++;
    }
    const counts = { ...(parent.counts || {}), ...c };
    if (c.active > 0) {
      const eta = await etaSeconds(parent.kind, c.active, repo);
      await repo.updateJob(parentId, { counts, eta_at: eta ? new Date(Date.parse(now()) + eta * 1000).toISOString() : null });
      if (parent.state !== 'processing') await advance(parentId, 'processing', { step: 'children' });
      return repo.getJob(parentId);
    }
    if (c.awaiting > 0) {
      const q = { text: `${c.awaiting} work${c.awaiting === 1 ? ' is' : 's are'} new to the library and waiting for your decision.`, options: [{ id: 'review', label: `Review the ${c.awaiting} waiting work${c.awaiting === 1 ? '' : 's'}` }] };
      await repo.updateJob(parentId, { counts });
      return advance(parentId, 'awaiting-decision', { question: q, step: 'waiting' });
    }
    await repo.updateJob(parentId, { counts });
    const to = c.added > 0 ? 'published' : c.handed > 0 ? 'handed-off' : c.failed === c.found ? 'failed' : 'skipped';
    return advance(parentId, to, { result: { ...(parent.result || {}), summary: c }, ...(to === 'failed' ? { error: 'every file failed' } : {}) });
  }

  async function etaSeconds(kind, remaining, r = repo) {
    const per = [];
    for (const st of ['check', 'ingest']) { const s = await r.stepSeconds(kind === 'archive' ? 'file' : kind, st).catch(() => []); if (s.length >= 3) per.push(median(s)); }
    return per.length ? Math.round(per.reduce((a, b) => a + b, 0) * remaining) : null;
  }

  /** Cost of a model/tool call attributed to the job and the person's day; the 80 % note and the kill switch live here. */
  async function addCost(id, by, usd, extra = {}) {
    if (!(usd > 0) && !extra.research && !extra.bytes && !extra.pages) return;
    const job = id ? await repo.getJob(id) : null;
    if (job && usd > 0) await repo.updateJob(id, { cost_usd: Number(job.cost_usd || 0) + usd });
    if (by) await repo.bumpUsage(whoOf(by), { usd, ...extra });
    const g = await globalState(repo, repo.dayOf());
    if (g.over) await repo.setFlag('paused', `Dewey's daily spend ceiling ($${g.ceiling}) was reached; jobs resume at midnight UTC or when the operator lifts the pause.`);
    if (g.note80 && !(await repo.getFlag(`note80:${repo.dayOf()}`))) {
      await repo.setFlag(`note80:${repo.dayOf()}`, JSON.stringify({ spent: g.spent, ceiling: g.ceiling, at: now() }));
      if (sendNote) await sendNote(g).catch(() => {});
    }
    return g;
  }

  return { startJob, advance, fail, rollup, addCost, note, etaSeconds, repo };
}

const summarizeParams = (p) => { const o = { ...(p || {}) }; for (const k of Object.keys(o)) if (typeof o[k] === 'string' && o[k].length > 200) o[k] = `${o[k].slice(0, 200)}…`; return o; };

const reg = makeRegistry();
export const { startJob, advance, fail, rollup, addCost, note } = reg;
export const registry = reg;

/** Dual-write wrapper: never throws, never blocks the verb that called it. */
export async function track(fn) { try { return await fn(reg); } catch { return null; } }
export { isAdmin };
