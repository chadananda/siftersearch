// The alternative to `catch {}`. A swallowed error is sometimes correct — a best-effort write, a cache miss,
// a log line that failed — but an INVISIBLE swallowed error is how a bug becomes a mystery. Tonight's proof:
// setConsent wrote to columns that did not exist yet, the failure vanished into `.catch(() => {})`, and
// connecting an account silently recorded no consent at all.
//
// swallow() keeps the "don't crash" behaviour and adds the two things bare catch throws away: a log line,
// and a COUNTER that shows up in health output — so "this path is failing constantly" becomes visible without
// anyone having to suspect it first. Deps: logger.
import { logger } from './logger.js';

const counts = new Map();      // context → { n, lastError, lastAt }

/**
 * @param {Error|string} err
 * @param {string} context stable label, e.g. 'companion.setConsent' — this is the counter key
 * @param {object} [extra] small structured detail for the log line
 * @returns {undefined} always; swallow() never throws, so it is safe inside a catch
 */
export function swallow(err, context, extra = {}) {
  const message = err?.message || String(err ?? 'unknown');
  const key = String(context || 'unlabelled');
  const rec = counts.get(key) || { n: 0, lastError: null, lastAt: null };
  rec.n += 1;
  rec.lastError = message.slice(0, 300);
  rec.lastAt = Math.floor(Date.now() / 1000);
  counts.set(key, rec);
  try { logger.warn({ err: message, ...extra }, `swallowed: ${key}`); } catch { /* logging must never throw here */ }
}

/** Snapshot of what has been swallowed since boot, worst first. Surfaced in health/status output. */
export function swallowedCounts({ limit = 25 } = {}) {
  return [...counts.entries()]
    .map(([context, r]) => ({ context, count: r.n, last_error: r.lastError, last_at: r.lastAt }))
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);
}

/** Total swallowed events — one number for a health check to alarm on. */
export function swallowedTotal() {
  let n = 0;
  for (const r of counts.values()) n += r.n;
  return n;
}

export function resetSwallowed() { counts.clear(); }
