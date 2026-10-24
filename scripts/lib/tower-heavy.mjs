// Heavy media processes running ON TOWER, counted in cores (Chad 10-24: tower serves the site and search; processing belongs on workers).
// Pure: `ps -eo pcpu=,args=` text in, { cores, kinds } out. system-checks WARNs above a budget and names the process kind (and so the code path).
const KINDS = [
  ['ffmpeg', /\bffmpeg\b/], ['media_tool', /media_tool\.py\s+(\w+)/], ['remaster_guard', /remaster_guard\.py/], ['whisper/ASR', /faster.whisper|whisperx|\btranscribe\b.*\.py/],
  ['yt-dlp', /yt-dlp|yt_dlp/], ['ocr', /tesseract|ocrmypdf|pdftoppm/], ['sox', /\bsox\b/],
];
export function towerHeavy(psText = '') {
  const kinds = {};
  for (const line of String(psText).split('\n')) {
    const m = /^\s*([\d.]+)\s+(.*)$/.exec(line);
    if (!m || /ps -eo|grep|system-checks/.test(m[2])) continue;
    for (const [name, re] of KINDS) {
      const hit = re.exec(m[2]); if (!hit) continue;
      const label = name === 'media_tool' ? `media_tool ${hit[1]}` : name;
      const k = (kinds[label] ||= { cores: 0, n: 0, sample: m[2].slice(0, 110) });
      k.cores += Number(m[1]) / 100; k.n++;
      break;
    }
  }
  for (const k of Object.values(kinds)) k.cores = Math.round(k.cores * 10) / 10;
  return { cores: Math.round(Object.values(kinds).reduce((a, k) => a + k.cores, 0) * 10) / 10, kinds };
}
/** → { ok, level, detail }: WARN above `warn` cores, CRITICAL above `crit`. */
export function towerHeavyVerdict(h, { warn = 6, crit = 20 } = {}) {
  const top = Object.entries(h.kinds).sort((a, b) => b[1].cores - a[1].cores).slice(0, 3).map(([k, v]) => `${k} ${v.cores} cores (${v.n})`).join(' · ');
  if (h.cores > crit) return { ok: false, level: 'critical', detail: `${h.cores} cores of media processing on tower (> ${crit}): ${top}` };
  if (h.cores > warn) return { ok: false, level: 'warn', detail: `${h.cores} cores of media processing on tower (> ${warn}): ${top}` };
  return { ok: true, level: 'warn', detail: `${h.cores} cores${top ? ` — ${top}` : ''}` };
}
