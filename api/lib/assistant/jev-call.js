// JEV CALL: one typed System One request under a MEASURED time limit, retried once while the caller's budget allows; a timeout
// is never silent — it is reported (onJev) so the turn logs it as a decision (jev:timeout) and in its meta. Limits measured
// from the launch-gate battery (tests/quality/reports/launch-gate-20261103, 11-03): strategy answered p50 199 / p95 814 /
// max 2732 ms (8 no-answers at the old 900 ms limit); triage p50 179 / p90 875 / p95 1682 ms (censored at 1500).
// Re-measured 11-09 (`ops.mjs jev-gates --days 1`, answered calls, censored at the limit): strategy p50 281 / p90 782 / p95 852 /
// max 995 (n 330); triage p50 299 / p90 1050 / p95 1231 / max 1487 (n 307). Latency does not track call size (ms~tokens r 0.07);
// slow calls come in slow MOMENTS (a slow strategy call's triage was slow 4/6 turns, 0/57 otherwise), so the retry is the remedy.
// Until 11-09 the retry never ran: an attempt ends a few ms past its limit, so elapsed + limit always exceeded a 2×limit budget.
export const JEV_LIMITS = Object.freeze({
  triage: { timeoutMs: 1500, budgetMs: 3000 },
  strategy: { timeoutMs: 1000, budgetMs: 2000 },
  occasion: { timeoutMs: 1000, budgetMs: 2000 },
  lookup: { timeoutMs: 1000, budgetMs: 2000 },
  book: { timeoutMs: 1000, budgetMs: 2000 },
});

/** AbortSignal.timeout(ms) that measures JEV's time, not our loop's: a timer that fires late (the serving thread was blocked —
 *  11-12: 1–9 s stalls) aborts only after `graceMs` more, so a reply already waiting on the socket is read instead of thrown
 *  away (10/10 round-20 turns "timed out" while Jev answered in ~200 ms). Aborts with a TimeoutError like AbortSignal.timeout. */
export function stallTolerantTimeout(ms, { graceMs = 250, lateMs = 100, now = Date.now, setT = setTimeout } = {}) {
  const c = new AbortController(), due = now() + ms;
  const abort = () => c.abort(new DOMException('The operation was aborted due to timeout', 'TimeoutError'));
  const t = setT(() => { if (now() - due > lateMs) { const g = setT(abort, graceMs); g?.unref?.(); } else abort(); }, ms);
  t?.unref?.();
  return c.signal;
}

const isTimeout = (e) => e?.name === 'TimeoutError' || (e?.name === 'AbortError' && /time/i.test(String(e?.message || e?.cause || '')));

/**
 * attempt(signal) → the parsed answer (or null). → { call, value, attempts, timeouts: [{ attempt, ms }], timeoutMs, error, ms }.
 * A timeout retries once when the limits already spent + timeoutMs ≤ budgetMs (counted by limit, not wall time: an aborted attempt
 * ends a few ms past its limit); any other error (or a null answer) ends the call.
 */
export async function jevCall(call, attempt, { timeoutMs, budgetMs = timeoutMs, retries = 1, onJev = null, now = Date.now, signalFor = (ms) => stallTolerantTimeout(ms) } = {}) {
  const t0 = now(); const timeouts = []; let value = null, error = null, attempts = 0;
  while (attempts <= retries) {
    attempts++;
    const ta = now();
    try { value = await attempt(signalFor(timeoutMs)); break; } catch (e) {
      if (!isTimeout(e)) { error = e?.message || String(e); break; }
      timeouts.push({ attempt: attempts, ms: now() - ta });
      if (attempts * timeoutMs + timeoutMs > budgetMs) break;
    }
  }
  const info = { call, value: value ?? null, attempts, timeouts, timeoutMs, error, ms: now() - t0 };
  // a call that ends with NO answer (timeout, an error status, an empty answer) is reported too: the turn's backup answers it
  // (11-12: a battery at concurrency 3 got error statuses from the strategy call, which failed open silently to plain search)
  if ((timeouts.length || value == null) && onJev) { try { onJev(info); } catch { /* reporting never breaks the call */ } }
  return info;
}

/** A jevCall result with a timeout → the decision a turn records (point 'jev:timeout'). Pure. */
export const timeoutDecision = (info) => ({ by: 'code', saw: info.call, options: ['retry', 'fail open'],
  chosen: info.value != null ? 'answered on retry' : 'fail open',
  reason: info.timeouts.length ? `${info.call}: ${info.timeouts.length} timeout(s) at the ${info.timeoutMs} ms limit (${info.attempts} attempt(s))`
    : `${info.call}: no answer (${info.error || 'empty'})`, ms: info.ms });

/** The turn's Jev timeouts (its jev:timeout decisions) → the meta summary, or null. Pure. */
export const jevTimeoutsOf = (decisions = []) => {
  const t = decisions.filter((d) => d?.point === 'jev:timeout');
  return t.length ? t.map((d) => ({ call: d.saw, outcome: d.chosen, ms: d.ms })) : null;
};
