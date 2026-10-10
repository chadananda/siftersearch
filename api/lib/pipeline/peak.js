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
