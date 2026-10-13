// Pure peak/off-peak time logic for DeepSeek's peak-valley pricing. Kept in its own module (no db/queue/bio deps)
// so BOTH the supervisor (queue.js) and the progress endpoint (bio.js) can import it without a circular import.
// Windows are ["HH:MM","HH:MM"] pairs in UTC; a window may wrap past UTC midnight (e.g. 23:00→03:00).

// DeepSeek pricing (api-docs.deepseek.com/quick_start/pricing, checked 2026-10-10): PEAK (full price) = 01:00-04:00
// and 06:00-10:00 UTC, Monday-Friday; every other hour and all weekend is OFF-PEAK at 50%. (Chinese public holidays
// are off-peak too — not modelled; they only make us pause when we needn't.) The old schedule (off-peak only
// 16:30-00:30 UTC, every day) paused the pipeline 16 h a day after DeepSeek had moved to this one.
export const DEFAULT_PEAK_WINDOWS = [['01:00', '04:00'], ['06:00', '10:00']];
export const PEAK_DAYS = [1, 2, 3, 4, 5];   // UTC getUTCDay(): Monday..Friday — weekends are off-peak all day

export const hhmmToMin = (s) => { const [h, m] = String(s).split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/** Is `at` (a Date, default now) inside any peak window? Wrap-aware. Pure. */
export function nowInPeak(windows = DEFAULT_PEAK_WINDOWS, at = new Date(), days = PEAK_DAYS) {
  if (days && !days.includes(at.getUTCDay())) return false;
  const nowMin = at.getUTCHours() * 60 + at.getUTCMinutes();
  return (windows || []).some(([s, e]) => { const a = hhmmToMin(s), b = hhmmToMin(e); return a <= b ? (nowMin >= a && nowMin < b) : (nowMin >= a || nowMin < b); });
}

/** When does the CURRENT peak window end (→ off-peak resumes)? A Date, or null if not currently peak. Drives the
 *  UI's "waiting for off-hour rates · [countdown]" box so a paused-for-savings pipeline never reads as stuck. */
export function peakEndsAt(windows = DEFAULT_PEAK_WINDOWS, at = new Date(), days = PEAK_DAYS) {
  if (days && !days.includes(at.getUTCDay())) return null;
  const nowMin = at.getUTCHours() * 60 + at.getUTCMinutes();
  for (const [s, e] of (windows || [])) {
    const a = hhmmToMin(s), b = hhmmToMin(e);
    const inWin = a <= b ? (nowMin >= a && nowMin < b) : (nowMin >= a || nowMin < b);
    if (!inWin) continue;
    const end = new Date(at);
    end.setUTCHours(Math.floor(b / 60), b % 60, 0, 0);
    if (end <= at) end.setUTCDate(end.getUTCDate() + 1);   // wrapped window → end is tomorrow
    return end;
  }
  return null;
}

/**
 * Is `at` in the DISCOUNTED window? The cost estimator needs exactly the inverse of the scheduler's question,
 * and it must be the SAME window — pausing for a discount and then billing at full price is how a $1,854
 * estimate sat beside a few-hundred-dollar invoice (2026-08-13).
 */
export const inOffPeak = (windows = DEFAULT_PEAK_WINDOWS, at = new Date()) => !nowInPeak(windows, at);

// ── the off-peak gate for every DeepSeek call (Chad 10-13: "make sure the use of deepseek, wherever we use it, takes advantage of
// the cheap hours") ─────────────────────────────────────────────────────────────────────────────────────────────────────────
// A person waits on the API and on deep research: those never wait. Every other process (pipeline, report workers, scripts)
// waits out a peak window before calling DeepSeek. DEEPSEEK_IGNORE_PEAK=1 overrides (an urgent manual run).
const INTERACTIVE = new Set(['siftersearch-api', 'siftersearch-deep-research']);

/** Pure: should this process wait for off-peak before a DeepSeek call? */
export function waitsForOffPeak(env = process.env) {
  if (env.DEEPSEEK_IGNORE_PEAK === '1' || env.VITEST) return false;   // the test runner never waits on the clock
  return !INTERACTIVE.has(String(env.name || ''));
}

let announced = 0;
/** Wait (if this process is background work and it is peak) until the discounted hours resume. */
export async function offPeakGate({ label = 'deepseek', env = process.env, now = () => new Date(), sleep = (ms) => new Promise((r) => setTimeout(r, ms)), log = console.warn } = {}) {
  if (!waitsForOffPeak(env)) return 0;
  let waited = 0;
  for (;;) {
    const end = peakEndsAt(DEFAULT_PEAK_WINDOWS, now());
    if (!end) return waited;
    const ms = Math.max(1000, end.getTime() - now().getTime() + 5000);
    if (Date.now() - announced > 600000) { announced = Date.now(); log(`[${label}] DeepSeek peak hours — waiting ${Math.round(ms / 60000)} min for the off-peak rate (DEEPSEEK_IGNORE_PEAK=1 to override)`); }
    await sleep(Math.min(ms, 15 * 60000));   // re-check at least every 15 min (clock changes, overrides)
    waited += Math.min(ms, 15 * 60000);
  }
}
