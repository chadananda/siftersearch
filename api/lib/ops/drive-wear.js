// drive-wear ops report (Chad 11-10: RAM write tier — "Chad must see the effect"). SMART bytes written per NVMe/SSD as a
// per-day rate against the previous sample (data/run/drive-wear.json) + percentage_used. Each run queues one weekly-email item
// (key drive-wear:<dev>, merged over the week). Deps: system-health drives() (sudo -n nvme/smartctl), maintenance queue.
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
export const SAMPLE_FILE = () => process.env.DRIVE_WEAR_FILE || join(ROOT, 'data', 'run', 'drive-wear.json');
// Rated endurance (TBW) where known — only for a "years left at this rate" line; unknown drives just show TB/day.
const TBW = { nvme1n1: 2000 };

/** prev sample {at, drives:{dev:{written_bytes, life_left_pct}}} + current drives[] + now → per-drive wear rows. Pure. */
export function driveWear(prev, drives, now = Date.now()) {
  const days = prev?.at ? (now - Date.parse(prev.at)) / 86400000 : null;
  return (drives || []).filter((d) => d && d.written_bytes != null).map((d) => {
    const p = prev?.drives?.[d.dev];
    const delta = p?.written_bytes != null && days > 0 ? d.written_bytes - p.written_bytes : null;
    const tbDay = delta != null && delta >= 0 ? +(delta / 1e12 / days).toFixed(3) : null;
    const used = d.life_left_pct != null ? 100 - d.life_left_pct : null;
    const tbw = TBW[d.dev];
    const yearsLeft = tbDay > 0 && tbw ? +(Math.max(0, tbw - d.written_bytes / 1e12) / tbDay / 365).toFixed(1) : null;
    return { dev: d.dev, written_tb: +(d.written_bytes / 1e12).toFixed(2), tb_per_day: tbDay, since_days: days != null ? +days.toFixed(2) : null,
      percentage_used: used, used_delta: used != null && p?.life_left_pct != null ? used - (100 - p.life_left_pct) : null,
      ...(tbw ? { rated_tbw: tbw, years_left_at_rate: yearsLeft } : {}) };
  });
}

/** drives[] + now → the sample to store. Pure. */
export const toSample = (drives, now = Date.now()) => ({ at: new Date(now).toISOString(),
  drives: Object.fromEntries((drives || []).filter((d) => d?.written_bytes != null).map((d) => [d.dev, { written_bytes: d.written_bytes, life_left_pct: d.life_left_pct ?? null }])) });

const readJson = (f) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return null; } };

/** The report. params: { store=true } (false = read only, keep the previous sample as the baseline). */
export async function driveWearReport({ store = true } = {}, deps = {}) {
  const file = deps.file || SAMPLE_FILE(), now = deps.now ?? Date.now();
  const drives = deps.drives ? deps.drives() : (await import('../system-health.js')).drives();
  const prev = readJson(file);
  const rows = driveWear(prev, drives, now);
  if (store && rows.length) { mkdirSync(dirname(file), { recursive: true }); const t = `${file}.${process.pid}.tmp`; writeFileSync(t, JSON.stringify(toSample(drives, now))); renameSync(t, file); }
  const queue = deps.queue || (await import('./maintenance.js')).queueMaintenance;
  for (const r of rows.filter((x) => x.tb_per_day != null)) queue({ source: 'drive-wear', key: `drive-wear:${r.dev}`, data: r,
    merge: (old, cur) => ({ ...cur, samples: [...(old?.samples || []), { at: new Date(now).toISOString().slice(0, 10), tb_per_day: cur.tb_per_day }].slice(-14) }),
    render: (d) => ({ title: `${d.dev}: ${d.tb_per_day} TB/day written`,
      text: [`last ${d.since_days} d: ${d.tb_per_day} TB/day; ${d.written_tb} TB lifetime; percentage_used ${d.percentage_used ?? '?'}%`,
        d.years_left_at_rate != null ? `≈${d.years_left_at_rate} years to rated ${d.rated_tbw} TBW at this rate` : '',
        d.samples?.length > 1 ? `week: ${d.samples.map((s) => `${s.at} ${s.tb_per_day}`).join(' · ')}` : ''].filter(Boolean).join('\n') }) });
  return { at: new Date(now).toISOString(), baseline: prev?.at || null, drives: rows };
}
