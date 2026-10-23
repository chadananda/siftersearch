// The compute hosts' disk for system-checks (10-23 16:09: aorus's 234 GB disk filled with media job folders and every
// enhance / transcribe / diarize failed "No space left on device"): WARN at 85 % used, CRITICAL at 95 %. Pure.
export function diskLevel(usedPct, { warn = 85, critical = 95 } = {}) {
  if (usedPct == null || Number.isNaN(Number(usedPct))) return 'unknown';
  return usedPct >= critical ? 'critical' : usedPct >= warn ? 'warn' : 'ok';
}
/** The gate's 'df' answer → one check line. */
export function diskCheck(host, df) {
  if (!df) return { name: `Disk ${host}`, ok: true, level: 'info', detail: 'unreachable from here' };
  const level = diskLevel(df.used_pct);
  return { name: `Disk ${host}`, ok: level === 'ok' || level === 'unknown', level: level === 'critical' ? 'critical' : 'warn',
    detail: `${df.used_pct}% used · ${df.free_gb} GB free of ${df.size_gb} GB · ${df.jobs} media job folders${level !== 'ok' ? ` — ${level.toUpperCase()}` : ''}` };
}
