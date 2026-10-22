// QUALITY GRADE of a recording (Chad 10-22: "make grading part of our normal media pipeline … as DETAILED as possible,
// organised along the lines of the appropriate solutions"). Measurements come from media_tool.py `grade` (signal) and,
// after transcription, the ASR confidences and per-speaker levels; this module turns them into a per-DIMENSION report —
// each dimension with its value, a grade A–E and the fix that addresses it — an overall grade, the primary/secondary
// issues, the recommended fix CHAIN in processing order with its cost, and a repair priority. Thresholds are documented
// in planning/media-library-plan.md §10 and were calibrated on the pilot items. Pure.

export const GRADES = ['A', 'B', 'C', 'D', 'E'];
const g = (i) => GRADES[Math.max(0, Math.min(4, i))];
const idx = (letter) => GRADES.indexOf(letter);
/** Grade a value against four ascending (higher = better) or descending cut points. */
const up = (v, [a, b, c, d]) => (v == null ? null : v >= a ? 0 : v >= b ? 1 : v >= c ? 2 : v >= d ? 3 : 4);
const down = (v, [a, b, c, d]) => (v == null ? null : v < a ? 0 : v < b ? 1 : v < c ? 2 : v < d ? 3 : 4);
const worst = (...xs) => { const v = xs.filter((x) => x != null); return v.length ? Math.max(...v) : null; };

export const THRESHOLDS = {
  bandwidth_khz: [7, 5.5, 4, 3], coloration: [3.5, 3.0, 2.5, 2.0],          // muffled
  snr_db: [32, 27, 22, 17], bak: [3.8, 3.4, 3.0, 2.5], hum_db: 10,           // noisy
  clip_pct: [0.01, 0.05, 0.2, 1],                                              // clipped (% of samples, lower is better)
  dropouts_per_hour: [0.5, 2, 5, 15], discontinuity: [3.5, 3.0, 2.5, 2.0],   // dropouts (NISQA discontinuity also reads codec artifacts: kept loose)
  lufs_bands: [[-26, -14], [-30, -12], [-34, -10], [-40, -8]], imbalance_db: [3, 6, 9, 12],   // level
  f0_ok: [70, 260], f0_doubt: [60, 300],                                       // speed / pitch
  asr_logprob: [-0.2, -0.3, -0.45, -0.65], low_conf_share: [0.02, 0.05, 0.12, 0.25],   // intelligibility
  nisqa_mos: [3.6, 3.0, 2.4, 1.8], dnsmos_ovrl: [3.3, 3.0, 2.6, 2.2],          // perceived overall
};

/** Processing cost per audio hour of each fix (CPU on tower unless noted). */
export const FIXES = {
  declip: { tool: 'ffmpeg adeclip', cpu_min_per_hour: 2, usd_per_hour: 0 },
  'hum notch': { tool: 'ffmpeg bandreject at the mains frequency + 2 harmonics', cpu_min_per_hour: 0.5, usd_per_hour: 0 },
  denoise: { tool: 'DeepFilterNet3', cpu_min_per_hour: 3, usd_per_hour: 0 },
  'vocal isolation': { tool: 'Demucs (music bed)', cpu_min_per_hour: 40, usd_per_hour: 0 },
  dereverb: { tool: 'dereverb (not yet installed)', cpu_min_per_hour: 10, usd_per_hour: 0 },
  'bandwidth restoration': { tool: 'Resemble Enhance / AudioSR', cpu_min_per_hour: 45, gpu_min_per_hour: 3, usd_per_hour: 0 },
  'leveling / per-speaker gain': { tool: 'ffmpeg loudnorm + per-speaker gain', cpu_min_per_hour: 1, usd_per_hour: 0 },
  'speed correction': { tool: 'pitch-checked rubberband (by ear first)', cpu_min_per_hour: 2, usd_per_hour: 0 },
  'manual/spectral repair': { tool: 'a person in a spectral editor', cpu_min_per_hour: 0, usd_per_hour: null },
};
const ORDER = ['declip', 'hum notch', 'denoise', 'vocal isolation', 'dereverb', 'manual/spectral repair', 'bandwidth restoration', 'speed correction', 'leveling / per-speaker gain'];
const ISSUE = { bandwidth: 'muffled', noise: 'noisy', reverb: 'reverberant', clipping: 'clipped', dropouts: 'dropouts', level: 'low-level', speed: 'speed' };

/** m: media_tool `grade` output (+ asr: { logprob, low_conf_share, low_conf_minutes, spans }, levels: { S1: { rms_dbfs, seconds } }) */
export function gradeReport(m = {}, { asr = null, levels = null } = {}) {
  const d = {};
  const col = m.nisqa?.coloration ?? null;
  d.bandwidth = { kHz: m.bandwidth_khz ?? null, coloration: col, grade: worst(up(m.bandwidth_khz, THRESHOLDS.bandwidth_khz), up(col, THRESHOLDS.coloration)),
    fix: 'bandwidth restoration (Resemble Enhance / AudioSR)' };
  const hum = Math.max(m.hum50_db ?? -99, m.hum60_db ?? -99);
  const humHz = (m.hum50_db ?? -99) >= (m.hum60_db ?? -99) ? 50 : 60;
  const snrG = up(m.snr_db, THRESHOLDS.snr_db), bakG = up(m.dnsmos?.bak, THRESHOLDS.bak);
  const humG = hum >= THRESHOLDS.hum_db + 10 ? 3 : hum >= THRESHOLDS.hum_db ? 2 : null;
  const type = hum >= THRESHOLDS.hum_db ? `hum (${humHz} Hz + harmonics)` : (snrG ?? 0) >= 2 ? 'broadband hiss' : (bakG ?? 0) >= 2 ? 'crowd/room' : 'low';
  d.noise = { snr_db: m.snr_db ?? null, bak: m.dnsmos?.bak ?? null, hum_db: Math.round(hum * 10) / 10, type, grade: worst(snrG, bakG, humG),
    fix: type.startsWith('hum') ? 'notch' : type === 'crowd/room' ? 'DeepFilterNet' : 'DeepFilterNet' };
  d.reverb = { c50_db: m.c50_db ?? null, grade: m.c50_db == null ? null : up(m.c50_db, [20, 12, 6, 2]), fix: 'dereverb', note: m.c50_db == null ? 'not measured yet (Brouhaha C50 not installed)' : undefined };
  d.clipping = { pct: m.clip_pct ?? null, grade: down(m.clip_pct, THRESHOLDS.clip_pct), fix: 'declip' };
  d.dropouts = { count: m.dropouts ?? null, per_hour: m.dropouts_per_hour ?? null, discontinuity: m.nisqa?.discontinuity ?? null,
    grade: worst(down(m.dropouts_per_hour, THRESHOLDS.dropouts_per_hour), up(m.nisqa?.discontinuity, THRESHOLDS.discontinuity)), fix: 'manual/spectral repair' };
  const lufs = m.lufs ?? null;
  const lufsG = lufs == null ? null : (() => { for (let i = 0; i < 4; i++) { const [lo, hi] = THRESHOLDS.lufs_bands[i]; if (lufs >= lo && lufs <= hi) return i; } return 4; })();
  const lv = levels ? Object.values(levels).filter((x) => x.seconds >= 30).map((x) => x.rms_dbfs) : [];
  const imbalance = lv.length > 1 ? Math.round((Math.max(...lv) - Math.min(...lv)) * 10) / 10 : null;
  d.level = { lufs, dynamic_range_db: m.loudness_range_db ?? null, speaker_imbalance_db: imbalance, grade: worst(lufsG, down(imbalance, THRESHOLDS.imbalance_db)), fix: 'leveling / per-speaker gain' };
  const f0 = m.f0_median_hz ?? null;
  d.speed = { f0_median_hz: f0, grade: f0 == null ? null : f0 >= THRESHOLDS.f0_ok[0] && f0 <= THRESHOLDS.f0_ok[1] ? 0 : f0 >= THRESHOLDS.f0_doubt[0] && f0 <= THRESHOLDS.f0_doubt[1] ? 2 : 3,
    fix: 'speed correction', note: 'median speaking pitch against the usual range; a check by ear decides' };
  d.intelligibility = asr ? { asr_logprob: asr.logprob ?? null, low_conf_share: asr.low_conf_share ?? null, low_conf_minutes: asr.low_conf_minutes ?? null,
    spans: (asr.spans || []).slice(0, 10), grade: worst(up(asr.logprob, THRESHOLDS.asr_logprob), down(asr.low_conf_share, THRESHOLDS.low_conf_share)) } : { grade: null, note: 'after transcription' };
  const perceived = { nisqa_mos: m.nisqa?.mos ?? null, dnsmos_ovrl: m.dnsmos?.ovrl ?? null, grade: worst(up(m.nisqa?.mos, THRESHOLDS.nisqa_mos), up(m.dnsmos?.ovrl, THRESHOLDS.dnsmos_ovrl)) };

  for (const k of Object.keys(d)) d[k].grade = d[k].grade == null ? null : g(d[k].grade);
  perceived.grade = perceived.grade == null ? null : g(perceived.grade);
  // overall: 35 % intelligibility, 35 % perceived quality, 30 % the worst fixable dimension (missing parts drop out)
  const fixable = ['bandwidth', 'noise', 'reverb', 'clipping', 'dropouts', 'level', 'speed'];
  const worstFix = worst(...fixable.map((k) => (d[k].grade ? idx(d[k].grade) : null)));
  const parts = [[d.intelligibility.grade ? idx(d.intelligibility.grade) : null, 0.35], [perceived.grade ? idx(perceived.grade) : null, 0.35], [worstFix, 0.3]].filter(([v]) => v != null);
  const wsum = parts.reduce((s, [, w]) => s + w, 0);
  const overall = parts.length ? g(Math.round(parts.reduce((s, [v, w]) => s + v * w, 0) / wsum)) : null;
  // issues: fixable dimensions at C or worse, worst first
  const issues = fixable.filter((k) => d[k].grade && idx(d[k].grade) >= 2).sort((a, b) => idx(d[b].grade) - idx(d[a].grade));
  const primary = issues.length ? (d[issues[0]].type?.startsWith('hum') && issues[0] === 'noise' ? 'hum' : ISSUE[issues[0]]) : 'ok';
  const chain = chainFor(d, issues);
  const hours = (m.duration_s || 0) / 3600;
  return { dimensions: d, perceived, overall, primary_issue: primary, secondary_issues: issues.slice(1).map((k) => ISSUE[k]), chain, chain_key: chain.map((c) => c.step).join(' → ') || 'none',
    cost: { cpu_minutes: Math.round(chain.reduce((s, c) => s + (c.cpu_min_per_hour || 0) * hours, 0) * 10) / 10, usd: 0, note: 'estimates per FIXES (planning §10)' } };
}

/** The fixes for the issues, in processing order (declip → hum notch → denoise → dereverb → … → bandwidth → level). Pure. */
export function chainFor(d, issues) {
  const steps = new Set();
  for (const k of issues) {
    if (k === 'clipping') steps.add('declip');
    if (k === 'noise') steps.add(d.noise.type?.startsWith('hum') ? 'hum notch' : d.noise.type === 'music bed' ? 'vocal isolation' : 'denoise');
    if (k === 'noise' && d.noise.type?.startsWith('hum') && d.noise.snr_db != null && d.noise.snr_db < THRESHOLDS.snr_db[1]) steps.add('denoise');
    if (k === 'reverb') steps.add('dereverb');
    if (k === 'dropouts') steps.add('manual/spectral repair');
    if (k === 'bandwidth') steps.add('bandwidth restoration');
    if (k === 'speed') steps.add('speed correction');
    if (k === 'level') steps.add('leveling / per-speaker gain');
  }
  return ORDER.filter((s) => steps.has(s)).map((step) => ({ step, ...FIXES[step] }));
}

/** Repair priority = (5 − grade score) × importance, grade score A=5 … E=1 (Chad 10-22). importance: speaker tier (Hands of
 *  the Cause / UHJ 3, curated scholars 2, others 1) × uniqueness (1, or 0.5 when another copy exists) + plays/hits later. */
export function priorityOf(overall, { tier = 1, unique = true, plays = 0 } = {}) {
  if (!overall) return null;
  const score = 5 - idx(overall);
  const importance = tier * (unique ? 1 : 0.5) + Math.min(2, Math.log10(1 + plays));
  return Math.round((5 - score) * importance * 100) / 100;
}

/** Intelligibility measures from an aligned transcript: mean word score, the share and minutes of low-confidence speech, the
 *  worst spans (≥ 10 s windows with a mean word score under 0.5). Pure. */
export function asrConfidence(segments = [], logprob = null) {
  const words = segments.flatMap((sg) => sg.words || []).filter((w) => w.p != null && w.s != null && w.e != null);
  if (!words.length) return { logprob, low_conf_share: null, low_conf_minutes: null, spans: [] };
  const low = words.filter((w) => w.p < 0.4);
  const spans = [];
  let cur = null;
  for (const w of words) {
    const bucket = Math.floor(w.s / 10);
    if (!cur || cur.b !== bucket) { if (cur) spans.push(cur); cur = { b: bucket, t0: bucket * 10, sum: 0, n: 0 }; }
    cur.sum += w.p; cur.n++;
  }
  if (cur) spans.push(cur);
  const bad = spans.filter((s) => s.n >= 5 && s.sum / s.n < 0.5);
  return { logprob, mean_word_score: Math.round((words.reduce((s, w) => s + w.p, 0) / words.length) * 1000) / 1000,
    low_conf_share: Math.round((low.length / words.length) * 1000) / 1000, low_conf_minutes: Math.round((bad.length * 10 / 60) * 10) / 10,
    spans: bad.sort((a, b) => a.sum / a.n - b.sum / b.n).slice(0, 10).map((s) => ({ t0: s.t0, t1: s.t0 + 10, score: Math.round((s.sum / s.n) * 100) / 100 })) };
}

export const gradeScore = (letter) => (letter ? 5 - idx(letter) : null);
