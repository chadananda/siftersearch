// Pure peak/off-peak time logic for DeepSeek's peak-valley pricing. Kept in its own module (no db/queue/bio deps)
// so BOTH the supervisor (queue.js) and the progress endpoint (bio.js) can import it without a circular import.
// Windows are ["HH:MM","HH:MM"] pairs in UTC; a window may wrap past UTC midnight (e.g. 23:00→03:00).

// DeepSeek peak = 2× (published schedule, UTC). 01-04 & 06-10 UTC = 6-9 PM & 11 PM-3 AM Arizona (MST, UTC-7).
export const DEFAULT_PEAK_WINDOWS = [['01:00', '04:00'], ['06:00', '10:00']];

export const hhmmToMin = (s) => { const [h, m] = String(s).split(':').map(Number); return (h || 0) * 60 + (m || 0); };

/** Is `at` (a Date, default now) inside any peak window? Wrap-aware. Pure. */
export function nowInPeak(windows = DEFAULT_PEAK_WINDOWS, at = new Date()) {
  const nowMin = at.getUTCHours() * 60 + at.getUTCMinutes();
  return (windows || []).some(([s, e]) => { const a = hhmmToMin(s), b = hhmmToMin(e); return a <= b ? (nowMin >= a && nowMin < b) : (nowMin >= a || nowMin < b); });
}

/** When does the CURRENT peak window end (→ off-peak resumes)? A Date, or null if not currently peak. Drives the
 *  UI's "waiting for off-hour rates · [countdown]" box so a paused-for-savings pipeline never reads as stuck. */
export function peakEndsAt(windows = DEFAULT_PEAK_WINDOWS, at = new Date()) {
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
