// Daily spend caps on paid LLM calls, per caller group (config/spend-caps.json). THE choke point: assertSpendCap(caller) runs before
// every paid call and batch submit; at the cap it throws SpendCapError (code SPEND_CAP) and alerts once per group per day.
// Spend = ai-usage-repo's incremental UTC-day rollup (never a table SUM), cached a few seconds per process. Deps: ai-usage-repo, ops/alert.
import { readFileSync } from 'fs';
import { dailySpendByCaller } from './repos/ai-usage-repo.js';
import { actionRequired } from './ops/alert.js';
import { logger } from './logger.js';

const CONFIG = JSON.parse(readFileSync(new URL('../../config/spend-caps.json', import.meta.url), 'utf8'));
const FREE_PROVIDERS = new Set(['ollama', 'lmstudio', 'local']);
const TTL_MS = Number(process.env.SPEND_CAP_CACHE_MS) || 3000;
const WAIT_CAP_MS = 30 * 60_000;   // a waiting queue worker looks again at least this often (the rollup is cached, so it costs nothing)

export const dayOf = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

export class SpendCapError extends Error {
  constructor({ group, spent, cap, caller, retryAfterMs }) {
    super(`spend cap reached: ${group} $${spent.toFixed(2)} of $${cap} today (${caller || 'no caller'}) — waits for the next UTC day`);
    Object.assign(this, { name: 'SpendCapError', code: 'SPEND_CAP', group, spent, cap, caller, retryAfterMs, isBudget: true });
  }
}
export const isSpendCap = (err) => err?.code === 'SPEND_CAP';

/** caller → group: the first rule that matches (exact or prefix), else the default group. Pure. */
export function groupOf(caller, cfg = CONFIG) {
  const c = String(caller ?? '');
  const hit = cfg.rules.find((r) => (r.exact || []).includes(c) || (r.prefix || []).some((p) => c.startsWith(p)));
  return hit ? hit.group : cfg.default;
}

/** The group's cap in USD on a UTC day (Infinity = none): env SPEND_CAP_<GROUP>_USD, else the group's env alias
 *  (cfg.env_alias, e.g. improve → IMPROVE_DAILY_USD), else the latest dated entry. Pure. */
export function capFor(group, day = dayOf(), cfg = CONFIG, env = process.env) {
  for (const k of [`SPEND_CAP_${String(group).toUpperCase()}_USD`, cfg.env_alias?.[group]].filter(Boolean)) {
    const o = env[k];
    if (o != null && o !== '' && Number.isFinite(Number(o))) return Number(o);
  }
  const e = (cfg.caps[group] || []).filter((x) => x.from <= day).sort((a, b) => (a.from < b.from ? -1 : 1)).at(-1);
  return e ? e.usd : Infinity;
}

/** ms until the next UTC midnight, at most WAIT_CAP_MS and at least a minute — how long a queue worker backs off. Pure. */
export const waitMs = (now = Date.now()) => Math.max(60_000, Math.min(WAIT_CAP_MS, Date.parse(`${dayOf(now)}T00:00:00Z`) + 86_400_000 - now));

// ── today's spend per group: one rollup read per TTL per process (about six API processes share the table; a small overrun is accepted) ──
let cache = null, inflight = null;
export const _reset = () => { cache = null; inflight = null; alerted.clear(); };
export async function spendByGroup({ now = Date.now(), deps = {} } = {}) {
  const day = dayOf(now);
  if (cache && cache.day === day && now - cache.at < TTL_MS) return cache.sums;
  inflight ||= (async () => {
    try {
      const sums = {};
      for (const [caller, usd] of Object.entries(await (deps.byCaller || dailySpendByCaller)(deps.rollup))) { const g = groupOf(caller); sums[g] = (sums[g] || 0) + usd; }
      cache = { day, at: now, sums };
    } catch (err) { logger.warn({ err: err.message }, 'spend caps: could not read today\'s spend — not blocking'); cache ||= { day, at: now, sums: {} }; cache.at = now; }
    finally { inflight = null; }
    return cache.sums;
  })();
  return inflight;
}

/** Each group's spend today against its cap. → [{ group, spent_usd, cap_usd, remaining_usd, blocking }] */
export async function capStatus({ now = Date.now(), deps = {}, cfg = CONFIG } = {}) {
  const sums = await spendByGroup({ now, deps }), day = dayOf(now);
  return [...new Set([cfg.default, ...Object.keys(cfg.caps), ...Object.keys(sums)])].map((group) => {
    const cap = capFor(group, day, cfg), spent = sums[group] || 0;
    return { group, spent_usd: Math.round(spent * 100) / 100, cap_usd: Number.isFinite(cap) ? cap : null, remaining_usd: Number.isFinite(cap) ? Math.round((cap - spent) * 100) / 100 : null, blocking: spent >= cap };
  });
}

// ONE alert per group per day, and only when the cap actually refused a call: an in-process flag, then the shared stamp file (key carries the day)
const alerted = new Set();
async function alertOnce(group, day, spent, cap, caller, deps) {
  const k = `${group}:${day}`;
  if (alerted.has(k)) return false;
  alerted.add(k);
  return actionRequired({ key: `spend-cap-${group}-${day}`, quietMs: 24 * 3600_000, subject: `SifterSearch: ${group} spend cap reached ($${cap}/day)`,
    text: `The ${group} group reached its daily cap: $${spent.toFixed(2)} of $${cap} (UTC day ${day}). First refused call: ${caller || 'unnamed'}.\n\nQueue work waits and retries; Anís chat answers that she is at today's limit. `
      + `Nothing fails. The cap resets at 00:00 UTC. To change it: config/spend-caps.json (or SPEND_CAP_${group.toUpperCase()}_USD). One alert per group per day.` }, deps.alert || {});
}

/** Throws SpendCapError when `caller`'s group is at its cap today. Free local providers pass. Fails open if spend cannot be read. */
export async function assertSpendCap(caller, { provider = null, now = Date.now(), deps = {}, cfg = CONFIG } = {}) {
  if (FREE_PROVIDERS.has(provider) || (cfg.exempt || []).includes(caller)) return;
  const group = groupOf(caller, cfg), day = dayOf(now), cap = capFor(group, day, cfg);
  if (!Number.isFinite(cap)) return;
  const spent = (await spendByGroup({ now, deps }))[group] || 0;
  if (spent < cap) return;
  await alertOnce(group, day, spent, cap, caller, deps).catch(() => {});
  throw new SpendCapError({ group, spent, cap, caller, retryAfterMs: waitMs(now) });
}
