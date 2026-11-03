// JEV CALL: one typed System One request under a MEASURED time limit, retried once while the caller's budget allows; a timeout
// is never silent — it is reported (onJev) so the turn logs it as a decision (jev:timeout) and in its meta. Limits measured
// from the launch-gate battery (tests/quality/reports/launch-gate-20261103, 11-03): strategy answered p50 199 / p95 814 /
// max 2732 ms (8 no-answers at the old 900 ms limit); triage p50 179 / p90 875 / p95 1682 ms (censored at 1500).
export const JEV_LIMITS = Object.freeze({
  triage: { timeoutMs: 1500, budgetMs: 3000 },
  strategy: { timeoutMs: 1000, budgetMs: 2000 },
  occasion: { timeoutMs: 1000, budgetMs: 2000 },
  lookup: { timeoutMs: 1000, budgetMs: 2000 },
});

const isTimeout = (e) => e?.name === 'TimeoutError' || (e?.name === 'AbortError' && /time/i.test(String(e?.message || e?.cause || '')));

/**
 * attempt(signal) → the parsed answer (or null). → { call, value, attempts, timeouts: [{ attempt, ms }], timeoutMs, error, ms }.
 * A timeout retries once when elapsed + timeoutMs ≤ budgetMs; any other error (or a null answer) ends the call.
 */
export async function jevCall(call, attempt, { timeoutMs, budgetMs = timeoutMs, retries = 1, onJev = null, now = Date.now, signalFor = (ms) => AbortSignal.timeout(ms) } = {}) {
  const t0 = now(); const timeouts = []; let value = null, error = null, attempts = 0;
  while (attempts <= retries) {
    attempts++;
    const ta = now();
    try { value = await attempt(signalFor(timeoutMs)); break; } catch (e) {
      if (!isTimeout(e)) { error = e?.message || String(e); break; }
      timeouts.push({ attempt: attempts, ms: now() - ta });
      if (now() - t0 + timeoutMs > budgetMs) break;
    }
  }
  const info = { call, value: value ?? null, attempts, timeouts, timeoutMs, error, ms: now() - t0 };
  if (timeouts.length && onJev) { try { onJev(info); } catch { /* reporting never breaks the call */ } }
  return info;
}

/** A jevCall result with a timeout → the decision a turn records (point 'jev:timeout'). Pure. */
export const timeoutDecision = (info) => ({ by: 'code', saw: info.call, options: ['retry', 'fail open'],
  chosen: info.value != null ? 'answered on retry' : 'fail open',
  reason: `${info.call}: ${info.timeouts.length} timeout(s) at the ${info.timeoutMs} ms limit (${info.attempts} attempt(s))`, ms: info.ms });

/** The turn's Jev timeouts (its jev:timeout decisions) → the meta summary, or null. Pure. */
export const jevTimeoutsOf = (decisions = []) => {
  const t = decisions.filter((d) => d?.point === 'jev:timeout');
  return t.length ? t.map((d) => ({ call: d.saw, outcome: d.chosen, ms: d.ms })) : null;
};
