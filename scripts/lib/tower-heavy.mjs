// Heavy media processes running ON TOWER, counted in cores (Chad 10-24: tower serves the site and search; processing belongs on workers).
// Pure: `ps -eo pcpu=,args=` text in (or `pcpu=,cgroup=,args=` with { cgroup: true }), { cores, kinds, slice } out. system-checks WARNs above
// a budget and names the process kind. Work inside sifter-bulk.slice — the documented cpu-finish exception (Chad 10-31), capped by the
// slice itself — is reported as `slice`, never counted against the budget.
const KINDS = [
  ['ffmpeg', /\bffmpeg\b/], ['media_tool', /media_tool\.py\s+(\w+)/], ['remaster_guard', /remaster_guard\.py/], ['whisper/ASR', /faster.whisper|whisperx|\btranscribe\b.*\.py/],
  ['yt-dlp', /yt-dlp|yt_dlp/], ['ocr', /tesseract|ocrmypdf|pdftoppm/], ['sox', /\bsox\b/],
];
const SLICE = /sifter-bulk\.slice/;
export function towerHeavy(psText = '', { cgroup = false } = {}) {
  const kinds = {}, slice = { cores: 0, n: 0 };
  for (const line of String(psText).split('\n')) {
    const m = (cgroup ? /^\s*([\d.]+)\s+(\S+)\s+(.*)$/ : /^\s*([\d.]+)\s+()(.*)$/).exec(line);
    if (!m || /ps -eo|grep|system-checks/.test(m[3])) continue;
    for (const [name, re] of KINDS) {
      const hit = re.exec(m[3]); if (!hit) continue;
      if (SLICE.test(m[2])) { slice.cores += Number(m[1]) / 100; slice.n++; break; }
      const label = name === 'media_tool' ? `media_tool ${hit[1]}` : name;
      const k = (kinds[label] ||= { cores: 0, n: 0, sample: m[3].slice(0, 110) });
      k.cores += Number(m[1]) / 100; k.n++;
      break;
    }
  }
  for (const k of [...Object.values(kinds), slice]) k.cores = Math.round(k.cores * 10) / 10;
  return { cores: Math.round(Object.values(kinds).reduce((a, k) => a + k.cores, 0) * 10) / 10, kinds, slice };
}
/** → { ok, level, detail }: WARN above `warn` cores, CRITICAL above `crit` (slice work named in the detail, not counted). */
export function towerHeavyVerdict(h, { warn = 6, crit = 20 } = {}) {
  const top = Object.entries(h.kinds).sort((a, b) => b[1].cores - a[1].cores).slice(0, 3).map(([k, v]) => `${k} ${v.cores} cores (${v.n})`).join(' · ');
  const sl = h.slice?.n ? ` · ${h.slice.cores} cores in sifter-bulk.slice (cpu-finish, capped)` : '';
  if (h.cores > crit) return { ok: false, level: 'critical', detail: `${h.cores} cores of media processing on tower (> ${crit}): ${top}${sl}` };
  if (h.cores > warn) return { ok: false, level: 'warn', detail: `${h.cores} cores of media processing on tower (> ${warn}): ${top}${sl}` };
  return { ok: true, level: 'warn', detail: `${h.cores} cores${top ? ` — ${top}` : ''}${sl}` };
}
