// System health for the public Observatory (Chad 10-16: "we can also make system health a part of the public dashboard. I
// expect it to improve in a week when we move our indexing from /tank to a 4tb SSD nvme"). Runs in the reports worker with
// each telemetry snapshot: storage use, per-device I/O load (a 3 s /proc/diskstats sample), CPU load and memory, services
// online, vector-index status, blocking queries. No hostnames, paths beyond mount points, or secrets. Linux only.
import os from 'os';
import { statfsSync, readFileSync } from 'fs';
import { execFileSync } from 'child_process';

// What each device IS — the public label. /tank's note is the planned move (the 4 TB NVMe, ~10-24).
export const DEVICES = {
  sdd: { mount: '/crutch', label: 'Interim SSD', kind: 'ssd', role: 'indexer stores — a crutch until the 4 TB NVMe' },
  nvme0n1: { mount: '/fast', label: 'Index NVMe', kind: 'nvme', role: 'Qdrant · SQLite' },
  sdc: { mount: '/tank', label: 'Bulk HDD', kind: 'hdd', role: 'backups · bulk storage' },
  sda: { mount: '/vault', label: 'Vault HDD', kind: 'hdd', role: 'archive' },
  sdb: { mount: '/', label: 'System SSD', kind: 'ssd', role: 'OS · services · logs' },
};

/** Pure: device busy % and MB/s between two /proc/diskstats readings `ms` apart. */
export function ioBetween(a, b, ms) {
  const parse = (txt) => Object.fromEntries(String(txt).trim().split('\n').map((l) => l.trim().split(/\s+/)).map((f) => [f[2],
    { readSectors: Number(f[5]), writeSectors: Number(f[9]), ioTicks: Number(f[12]) }]));
  const x = parse(a), y = parse(b), out = {};
  for (const dev of Object.keys(DEVICES)) {
    if (!x[dev] || !y[dev]) continue;
    out[dev] = { busy_pct: Math.min(100, Math.round(((y[dev].ioTicks - x[dev].ioTicks) / ms) * 100)),
      read_mb_s: +(((y[dev].readSectors - x[dev].readSectors) * 512) / 1048576 / (ms / 1000)).toFixed(1),
      write_mb_s: +(((y[dev].writeSectors - x[dev].writeSectors) * 512) / 1048576 / (ms / 1000)).toFixed(1) };
  }
  return out;
}

function storage() {
  return Object.entries(DEVICES).map(([dev, d]) => {
    try {
      const s = statfsSync(d.mount);
      const size = s.blocks * s.bsize, free = s.bavail * s.bsize;
      return { dev, ...d, size_gb: Math.round(size / 1e9), used_gb: Math.round((size - free) / 1e9), used_pct: Math.round(((size - free) / size) * 100) };
    } catch { return { dev, ...d, size_gb: null, used_gb: null, used_pct: null }; }
  });
}

function services() {
  try {
    const list = JSON.parse(execFileSync('pm2', ['jlist'], { encoding: 'utf8', timeout: 10000, maxBuffer: 32 * 1024 * 1024 }));
    // retired processes are stopped on purpose and cron jobs sleep between runs — health is online vs errored
    const ours = list.filter((p) => /^siftersearch-|^cloudflared/.test(p.name) && !p.pm2_env?.cron_restart);
    const online = ours.filter((p) => p.pm2_env?.status === 'online'), errored = ours.filter((p) => p.pm2_env?.status === 'errored');
    return { online: online.length, errored: errored.length, names: online.map((p) => p.name.replace(/^siftersearch-/, '')).sort() };
  } catch { return null; }
}

async function vectorIndexes() {
  const base = process.env.QDRANT_URL || 'http://127.0.0.1:6333', out = {};
  for (const c of ['phrases', 'paragraphs_kw', 'hype', 'concepts']) {
    try { const r = await fetch(`${base}/collections/${c}`, { headers: { 'api-key': process.env.QDRANT_KEY || '' }, signal: AbortSignal.timeout(5000) }); out[c] = (await r.json())?.result?.status || 'unknown'; }
    catch { out[c] = 'unreachable'; }
  }
  return out;
}

/** Pure: one drive's SMART reading (smartctl -j for SATA, `nvme smart-log -o json` for NVMe) → the figures we show.
 *  life_left_pct: NVMe 100 − percentage_used; SATA SSD SSD_Life_Left / Percent_Lifetime_Remain; HDDs have none. */
export function parseSmart(dev, json, nvme = false) {
  if (!json) return null;
  if (nvme) {
    const duw = Number(json.data_units_written ?? 0);
    return { dev, healthy: Number(json.critical_warning ?? 0) === 0, temp_c: json.temperature != null ? Math.round(Number(json.temperature) - 273) : null,
      life_left_pct: json.percent_used != null ? 100 - Number(json.percent_used) : json.percentage_used != null ? 100 - Number(json.percentage_used) : null,
      written_tb: +((duw * 512000) / 1e12).toFixed(1), media_errors: Number(json.media_errors ?? 0), power_on_hours: Number(json.power_on_hours ?? 0) };
  }
  const attrs = Object.fromEntries((json.ata_smart_attributes?.table || []).map((a) => [a.name, a]));
  const raw = (n) => attrs[n]?.raw?.value ?? null;
  const life = attrs.SSD_Life_Left?.value ?? attrs.Percent_Lifetime_Remain?.value ?? null;
  const gib = raw('Lifetime_Writes_GiB'), lbas = raw('Total_LBAs_Written');
  return { dev, healthy: json.smart_status?.passed !== false, temp_c: json.temperature?.current ?? null, life_left_pct: life,
    written_tb: gib != null ? +((gib * 1.073741824) / 1000).toFixed(1) : lbas != null ? +((lbas * 512) / 1e12).toFixed(1) : null,
    reallocated: raw('Reallocated_Sector_Ct'), pending: raw('Current_Pending_Sector'), power_on_hours: json.power_on_time?.hours ?? null };
}

/** SMART for every known drive (sudo -n: the reports worker has passwordless sudo for these two read-only tools). */
function drives() {
  const out = [];
  for (const dev of Object.keys(DEVICES)) {
    try {
      const nvme = dev.startsWith('nvme');
      const raw = nvme
        ? execFileSync('sudo', ['-n', 'nvme', 'smart-log', `/dev/${dev}`, '-o', 'json'], { encoding: 'utf8', timeout: 10000 })
        : execFileSync('sudo', ['-n', 'smartctl', '-j', '-H', '-A', `/dev/${dev}`], { encoding: 'utf8', timeout: 15000 });
      out.push(parseSmart(dev, JSON.parse(raw), nvme));
    } catch (err) {
      // smartctl exits non-zero on some warnings but still prints JSON
      try { out.push(parseSmart(dev, JSON.parse(err.stdout || ''), dev.startsWith('nvme'))); } catch { /* unreadable */ }
    }
  }
  return out.filter(Boolean);
}

/** One health reading (~3 s: the I/O sample). */
export async function systemHealth({ slowCount } = {}) {
  let io = {};
  try {
    const a = readFileSync('/proc/diskstats', 'utf8'); await new Promise((r) => setTimeout(r, 3000)); const b = readFileSync('/proc/diskstats', 'utf8');
    io = ioBetween(a, b, 3000);
  } catch { /* not Linux */ }
  const [load1, load5] = os.loadavg();
  const slow = slowCount ? await slowCount().catch(() => null) : null;
  return {
    storage: storage().map((s) => ({ ...s, io: io[s.dev] || null })),
    cpu: { cores: os.cpus().length, load1: +load1.toFixed(1), load5: +load5.toFixed(1), load_pct: Math.round((load5 / os.cpus().length) * 100) },
    memory: { total_gb: Math.round(os.totalmem() / 1e9), used_pct: Math.round((1 - os.freemem() / os.totalmem()) * 100) },
    services: services(), vectors: await vectorIndexes(), slow_queries_24h: slow, uptime_days: Math.floor(os.uptime() / 86400), drives: drives(),
  };
}
