// Drive wear: per-device TB/day from /proc/diskstats deltas persisted between system-checks runs, projected life, dominant writer.
// Pure (text/objects in, verdict out). WARN: EVO above 0.15 TB/day (= 5-year life from 45 % left) or any drive projected under 5 years.
export const WEAR_DEVICES = {
  nvme0n1: { label: 'EVO 970 Plus 1 TB (/fast)', ratedTbw: 600, lifeLeftPct: 45, warnTbDay: 0.15 },   // 55 % used at the 10-22 baseline
  nvme1n1: { label: 'MP44 4 TB (/faster)', ratedTbw: 2000, lifeLeftPct: 100, warnTbDay: Infinity },
};
/** /proc/diskstats text → { dev: bytesWritten } (field 10 = sectors written, 512 B). */
export function parseDiskBytes(text = '', devs = Object.keys(WEAR_DEVICES)) {
  const out = {};
  for (const line of String(text).split('\n')) {
    const f = line.trim().split(/\s+/);
    if (devs.includes(f[2]) && f.length > 9) out[f[2]] = Number(f[9]) * 512;
  }
  return out;
}
/** TB/day between two samples {t (ms), bytes:{dev}}. A smaller counter (reboot) or a gap under 1 h yields no rate. */
export function wearRates(prev, cur, minMs = 3600e3) {
  const dt = prev && cur ? cur.t - prev.t : 0, out = {};
  if (dt < minMs) return out;
  for (const dev of Object.keys(cur.bytes || {})) {
    const d = cur.bytes[dev] - (prev.bytes?.[dev] ?? NaN);
    if (Number.isFinite(d) && d >= 0) out[dev] = +((d / 1e12) * (86400e3 / dt)).toFixed(3);
  }
  return out;
}
/** Years left at tbDay. With SMART (writtenTb, lifeLeftPct) the wear so far is extrapolated linearly (TB per % used); without it, rated TBW × life left. */
export const yearsLeft = ({ ratedTbw, lifeLeftPct, writtenTb = null }, tbDay) => {
  if (!(tbDay > 0)) return Infinity;
  const remainingTb = writtenTb > 0 && lifeLeftPct < 100 ? (lifeLeftPct / (100 - lifeLeftPct)) * writtenTb : (ratedTbw * lifeLeftPct) / 100;
  return +(remainingTb / tbDay / 365).toFixed(1);
};
/** Biggest per-process write_bytes growth: procs = { 'pid name': bytes }. Restarted (shrunk) processes are skipped. */
export function dominantWriter(prev = {}, cur = {}) {
  let best = null, total = 0;
  for (const [k, v] of Object.entries(cur)) {
    const d = v - (prev[k] ?? NaN);
    if (!(d >= 0)) continue;
    total += d;
    if (!best || d > best.bytes) best = { name: k.replace(/^\d+ /, ''), bytes: d };
  }
  return best ? { ...best, share_pct: total ? Math.round((best.bytes / total) * 100) : 0 } : null;
}
/** → { ok, level, detail } for the system-checks line. `smart` = { dev: { life_left_pct, written_tb } } from the Observatory snapshot (optional). */
export function wearVerdict(rates, { writer = null, smart = {}, minYears = 5, devices = WEAR_DEVICES } = {}) {
  const parts = [], bad = [];
  for (const [dev, cfg] of Object.entries(devices)) {
    const r = rates[dev];
    if (r == null) continue;
    const sm = smart[dev], y = yearsLeft({ ...cfg, lifeLeftPct: sm?.life_left_pct ?? cfg.lifeLeftPct, writtenTb: sm?.written_tb ?? null }, r);
    parts.push(`${cfg.label} ${r} TB/day, ~${y === Infinity ? '∞' : y} y left`);
    if (r > cfg.warnTbDay || y < minYears) bad.push(dev);
  }
  if (!parts.length) return { ok: true, level: 'info', detail: 'no rate yet (needs two samples ≥1 h apart)' };
  const w = writer ? ` · top writer ${writer.name} (${Math.round(writer.bytes / 1e9)} GB, ${writer.share_pct}%)` : '';
  return { ok: !bad.length, level: bad.length ? 'warn' : 'info', detail: parts.join(' · ') + w };
}
