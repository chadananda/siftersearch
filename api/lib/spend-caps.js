// Daily spend caps on paid LLM calls, per caller group (config/spend-caps.json). THE choke point: assertSpendCap(caller) runs before
// every paid call and batch submit; at the cap it throws SpendCapError (code SPEND_CAP) and alerts once per group per day.
// Spend = ai-usage-repo's incremental UTC-day rollup (never a table SUM), cached a few seconds per process. Deps: ai-usage-repo, ops/alert.
import { readFileSync } from 'fs';
import { dailySpendByCaller, dailySpendByProvider } from './repos/ai-usage-repo.js';
import { isExhaustion } from './spend-alerts.js';
import { actionRequired } from './ops/alert.js';
import { logger } from './logger.js';
import { currentAIContext } from './ai-context.js';

const CONFIG = JSON.parse(readFileSync(new URL('../../config/spend-caps.json', import.meta.url), 'utf8'));
const FREE_PROVIDERS = new Set(['ollama', 'lmstudio', 'local']);
const TTL_MS = Number(process.env.SPEND_CAP_CACHE_MS) || 3000;
const WAIT_CAP_MS = 30 * 60_000;   // a waiting queue worker looks again at least this often (the rollup is cached, so it costs nothing)

export const dayOf = (now = Date.now()) => new Date(now).toISOString().slice(0, 10);

// the caller every TEST Anís turn bills to (draft from battery*@siftersearch.com, chat with x-sifter-test): the improve budget
export const TEST_BILL_TO = 'improve-anis-test';

export class SpendCapError extends Error {
  constructor({ group, spent, cap, caller, retryAfterMs, credit = false }) {
    super(credit ? `${caller} is out of credit — work waits and retries` : `spend cap reached: ${group} $${spent.toFixed(2)} of $${cap} today (${caller || 'no caller'}) — waits for the next UTC day`);
    Object.assign(this, { name: 'SpendCapError', code: 'SPEND_CAP', group, spent, cap, caller, retryAfterMs, credit, isBudget: true });
  }
}
export const isSpendCap = (err) => err?.code === 'SPEND_CAP';
/** The provider has no credit left (our SpendCapError for it, or its raw refusal): work WAITS, it is never a failure. Pure. */
export const isCreditRefusal = (err) => (isSpendCap(err) && err.credit === true) || isExhaustion({ status: err?.status ?? err?.statusCode ?? null, message: err?.message || String(err ?? '') });

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

/** The provider-wide cap on a UTC day → { usd, background_usd } or null (none): env SPEND_CAP_<PROVIDER>_TOTAL_USD sets both. Pure. */
export function providerCapFor(provider, day = dayOf(), cfg = CONFIG, env = process.env) {
  const o = env[`SPEND_CAP_${String(provider).toUpperCase()}_TOTAL_USD`];
  if (o != null && o !== '' && Number.isFinite(Number(o))) return { usd: Number(o), background_usd: Number(o) };
  const e = (cfg.providers?.[provider] || []).filter((x) => x.from <= day).sort((a, b) => (a.from < b.from ? -1 : 1)).at(-1);
  return e ? { usd: e.usd, background_usd: e.background_usd ?? e.usd } : null;
}

// ── out of credit: the provider's own refusal becomes a SpendCapError, so queue work waits (never marked failed) and
// every later call in this process waits too, without asking the provider again, until CREDIT_WAIT_MS has passed.
// (11-06: an empty Anthropic balance had the improve worker failing ~2 calls a second, 40,375 in 6 h.)
export const CREDIT_WAIT_MS = Number(process.env.SPEND_CREDIT_WAIT_MS) || 15 * 60_000;
const creditOut = new Map();   // provider → until (ms)
/** A failed provider call → a SpendCapError to throw instead when it means "no credit left", else null (throw the original). */
export function noteCreditOut(provider, err, now = Date.now()) {
  if (!provider || !isExhaustion({ status: err?.status ?? null, message: err?.message || String(err ?? '') })) return null;
  creditOut.set(provider, now + CREDIT_WAIT_MS);
  return new SpendCapError({ group: `${provider}-credit`, spent: 0, cap: 0, caller: provider, retryAfterMs: CREDIT_WAIT_MS, credit: true });
}

// ── today's spend per group: one rollup read per TTL per process (about six API processes share the table; a small overrun is accepted) ──
let cache = null, inflight = null;
export const _reset = () => { cache = null; inflight = null; pcache = null; pinflight = null; alerted.clear(); creditOut.clear(); };
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

// ── today's spend per provider: the same cached rollup pattern
let pcache = null, pinflight = null;
export async function spendByProvider({ now = Date.now(), deps = {} } = {}) {
  const day = dayOf(now);
  if (pcache && pcache.day === day && now - pcache.at < TTL_MS) return pcache.sums;
  pinflight ||= (async () => {
    try { pcache = { day, at: now, sums: await (deps.byProvider || dailySpendByProvider)(deps.rollup, exemptCallers(deps.cfg || CONFIG)) }; }
    catch (err) { logger.warn({ err: err.message }, 'spend caps: could not read today\'s provider spend — not blocking'); pcache ||= { day, at: now, sums: {} }; pcache.at = now; }
    finally { pinflight = null; }
    return pcache.sums;
  })();
  return pinflight;
}

/** Callers of the provider-exempt groups (their rules' exact names). Pure. */
export const exemptCallers = (cfg = CONFIG) => (cfg.provider_exempt || []).flatMap((g) => cfg.rules.filter((r) => r.group === g).flatMap((r) => r.exact || []));

/** A monthly-ceiling group's limits → { month, day } USD (env wins; unset = the config default), or null when the group has none. Pure. */
export function monthlyFor(group, cfg = CONFIG, env = process.env) {
  const m = cfg.monthly?.[group]; if (!m) return null;
  const e = m.env && env[m.env], month = e != null && e !== '' && Number.isFinite(Number(e)) ? Number(e) : m.usd;
  return { month, day: month / (m.pace_days || 30) };
}

/** Each group's spend today against its cap. → [{ group, spent_usd, cap_usd, remaining_usd, blocking }] */
export async function capStatus({ now = Date.now(), deps = {}, cfg = CONFIG } = {}) {
  const sums = await spendByGroup({ now, deps }), day = dayOf(now);
  return [...new Set([cfg.default, ...Object.keys(cfg.caps), ...Object.keys(sums)])].map((group) => {
    const cap = capFor(group, day, cfg), spent = sums[group] || 0;
    return { group, spent_usd: Math.round(spent * 100) / 100, cap_usd: Number.isFinite(cap) ? cap : null, remaining_usd: Number.isFinite(cap) ? Math.round((cap - spent) * 100) / 100 : null, blocking: spent >= cap };
  }).concat(await providerRows({ now, deps, cfg }));
}
async function providerRows({ now, deps, cfg }) {
  const day = dayOf(now), names = Object.keys(cfg.providers || {}).filter((k) => !k.startsWith('_') && k !== 'interactive');
  if (!names.length) return [];
  const sums = await spendByProvider({ now, deps });
  return names.map((p) => providerCapFor(p, day, cfg) && (({ usd, background_usd }) => {
    const spent = sums[p] || 0, r = (x) => Math.round(x * 100) / 100;
    return { group: `${p}-total`, spent_usd: r(spent), cap_usd: usd, background_cap_usd: background_usd, remaining_usd: r(usd - spent), blocking: spent >= usd, background_blocking: spent >= background_usd };
  })(providerCapFor(p, day, cfg))).filter(Boolean);
}

// ONE alert per group per day, and only when the cap actually refused a call: an in-process flag, then the shared stamp file (key carries the day)
const alerted = new Set();
async function alertOnce(group, day, spent, cap, caller, deps) {
  const k = `${group}:${day}`;
  if (alerted.has(k)) return false;
  alerted.add(k);
  return actionRequired({ key: `spend-cap-${group}-${day}`, quietMs: 24 * 3600_000, subject: `SifterSearch: ${group} spend cap reached ($${cap}/day)`,
    text: `The ${group} group reached its daily cap: $${spent.toFixed(2)} of $${cap} (UTC day ${day}). First refused call: ${caller || 'unnamed'}.\n\nQueue work waits and retries; Test and analysis turns wait; real readers' Anís turns are never refused. `
      + `Nothing fails. The cap resets at 00:00 UTC. To change it: config/spend-caps.json (or SPEND_CAP_${group.toUpperCase()}_USD). One alert per group per day.` }, deps.alert || {});
}

/** Throws SpendCapError when `caller`'s group is at its cap today. Free local providers pass. Fails open if spend cannot be read. */
export async function assertSpendCap(caller, { provider = null, now = Date.now(), deps = {}, cfg = CONFIG } = {}) {
  const ctx = currentAIContext();
  caller = ctx.billTo || caller;   // a scope that bills elsewhere (the strategy dry run → improve-replay) checks that group's cap
  if (FREE_PROVIDERS.has(provider) || (cfg.exempt || []).includes(caller)) return;
  const group = groupOf(caller, cfg), day = dayOf(now), cap = capFor(group, day, cfg);
  if (provider && (creditOut.get(provider) || 0) > now) throw new SpendCapError({ group: `${provider}-credit`, spent: 0, cap: 0, caller: provider, retryAfterMs: creditOut.get(provider) - now, credit: true });
  // a real reader's Anís turn is counted, never refused (Chad 11-06: "we should not be having search limiting on Anis for
  // organic users"); tests and analysis carry billTo and stop at their own caps
  if (ctx.organic && !ctx.billTo) return;
  if (Number.isFinite(cap)) {
    const spent = (await spendByGroup({ now, deps }))[group] || 0;
    if (spent >= cap) {
      if (cap > 0) await alertOnce(group, day, spent, cap, caller, deps).catch(() => {});   // $0 = paused on purpose: no alert (alarm only when broken)
      throw new SpendCapError({ group, spent, cap, caller, retryAfterMs: waitMs(now) });
    }
  }
  // a monthly-ceiling group (hype-program): the day's pace (month/30) and the calendar month, never alarmed — it simply waits (the job waits for the next UTC day)
  const mon = monthlyFor(group, cfg);
  if (mon) {
    const spentDay = (await spendByGroup({ now, deps }))[group] || 0;
    if (spentDay >= mon.day) throw new SpendCapError({ group, spent: spentDay, cap: mon.day, caller, retryAfterMs: waitMs(now) });
    const month = await (deps.monthByCaller || (async () => (await import('./repos/ai-usage-repo.js')).monthSpendByCaller()))().catch(() => ({}));
    const spentMonth = Object.entries(month).reduce((n, [c, v]) => n + (groupOf(c, cfg) === group ? v : 0), 0);
    if (spentMonth >= mon.month) throw new SpendCapError({ group, spent: spentMonth, cap: mon.month, caller, retryAfterMs: waitMs(now) });
  }
  if ((cfg.provider_exempt || []).includes(group)) return;   // never counted in, never refused by, the provider-wide caps
  const pcap = provider && providerCapFor(provider, day, cfg);   // the provider-wide cap: background groups stop first, live replies keep the rest
  if (!pcap) return;
  const limit = (cfg.providers?.interactive || []).includes(group) ? pcap.usd : pcap.background_usd;
  const pspent = (await spendByProvider({ now, deps }))[provider] || 0;
  if (pspent < limit) return;
  await alertOnce(`${provider}-total`, day, pspent, limit, caller, deps).catch(() => {});
  throw new SpendCapError({ group: `${provider}-total`, spent: pspent, cap: limit, caller, retryAfterMs: waitMs(now) });
}
