// Audio enhancement BY MEASUREMENT (planning/media-library-plan.md §1): a light ffmpeg chain always (the hum notch only
// when hum was measured), DeepFilterNet as a second candidate, and the transcription input chosen by ASR confidence on
// the same excerpts — heavy enhancement can hurt recognition, so the listening copy and the ASR input may differ. Pure.

/** The light chain: rumble/hiss band limits (the low-pass under the original's own Nyquist — never cutting speech it has),
 *  a mains-hum notch (+2 harmonics) only when measured, declick, gentle FFT denoise, EBU R128 loudness.
 *  metrics: media_tool.py `metrics` output for the original + its sample_rate (ffprobe). */
export function lightChain(metrics = {}) {
  const f = ['highpass=f=70', `lowpass=f=${Math.round(Math.min(9500, 0.47 * (metrics.sample_rate || 44100)))}`];
  const hum = (metrics.hum50_db || 0) > (metrics.hum60_db || 0) ? { f: 50, v: metrics.hum50_db } : { f: 60, v: metrics.hum60_db || 0 };
  if (hum.v >= 10) for (const h of [1, 2, 3]) f.push(`bandreject=f=${hum.f * h}:width_type=q:w=12`);
  f.push('adeclick', 'afftdn=nr=8:nf=-45', 'loudnorm=I=-18:TP=-1.5:LRA=11');
  return f.join(',');
}

/** Excerpt starts for the ASR probe: three minutes spread over the talk, clear of the first/last minute. */
export function probeStarts(duration, n = 3, len = 60) {
  const d = Number(duration) || 0;
  if (d <= len * 2) return [0];
  const usable = d - len - 60, from = Math.min(60, d / 10);
  return Array.from({ length: n }, (_, i) => Math.max(0, Math.round(from + (usable - from) * (i + 0.5) / n)));
}

/**
 * Pick the transcription input among probed variants [{ name, avg_logprob, words, snr_db }]: the highest ASR confidence,
 * but a more processed variant must beat a less processed one by `margin` (log-prob units) — processing that does not
 * clearly help recognition is not used for it. Order of processing: original < light < dfn.
 */
export function chooseAsrInput(variants, { margin = 0.03 } = {}) {
  const order = ['original', 'light', 'dfn'];
  const ok = variants.filter((v) => v && v.avg_logprob != null).sort((a, b) => order.indexOf(a.name) - order.indexOf(b.name));
  if (!ok.length) return { name: 'light', why: 'no probe result — the light chain by default' };
  let best = ok[0];
  for (const v of ok.slice(1)) if (v.avg_logprob > best.avg_logprob + margin && (v.words || 0) >= (best.words || 0) * 0.9) best = v;
  const why = ok.map((v) => `${v.name} ${v.avg_logprob.toFixed(3)}`).join(' · ');
  return { name: best.name, why: `ASR confidence ${why} → ${best.name}` };
}

/** The listening copy: DeepFilterNet when it raised the measured SNR by ≥ 3 dB and did not cost recognition, else light. */
/** The LISTENING copy is the ORIGINAL with transparent processing only (Chad 10-23, by ear on Ioas: the DeepFilterNet and
 *  restored copies "badly mangled" the words — denoise gates speech onsets and quiet syllables). Light (afftdn) and dfn stay
 *  ASR inputs only; no neural or denoised copy is ever picked for listening until Chad approves a chain by ear. */
export function chooseListening() {
  return { name: 'safe', why: 'the original, transparent processing only (high-pass, loudness; hum notch when measured) — Chad 10-23' };
}

/** The transparent chain: a 70 Hz high-pass (rumble), a narrow notch at the hum fundamental and 2nd harmonic only when hum
 *  is measured (≥ 10 dB prominence), loudness −18 LUFS. No denoise, no gating, no bandwidth synthesis. */
export function safeChain(metrics = {}) {
  const f = ['highpass=f=70'];
  const hum = (metrics.hum50_db || 0) > (metrics.hum60_db || 0) ? { f: 50, v: metrics.hum50_db } : { f: 60, v: metrics.hum60_db || 0 };
  if (hum.v >= 10) for (const h of [1, 2]) f.push(`bandreject=f=${hum.f * h}:width_type=q:w=12`);
  f.push('loudnorm=I=-18:TP=-1.5:LRA=11');
  return f.join(',');
}

/** The web Ogg: Opus in 'audio' mode (fullband) at 56 kbps — the old 32 kbps 'voip' setting capped every talk at ~4 kHz. */
export const OGG_ARGS = ['-c:a', 'libopus', '-b:a', '56k', '-application', 'audio'];
/** The web copies' settings, recorded per talk (meta.web_codec): the transparent listening source + the encoders above. */
export const WEB_CODEC = 'safe+opus56audio';
/** A REMASTERED listening copy (UniPASE, 48 kHz): Opus 96k 'audio' so the restored band survives; m4a AAC 128k. */
export const OGG_ARGS_REMASTER = ['-c:a', 'libopus', '-b:a', '96k', '-application', 'audio'];
export const M4A_BITRATE_REMASTER = '128k';
export const WEB_CODEC_REMASTER = 'unipase+opus96audio';
/** Is the talk's listening copy a remaster (a variant that shifts time)? */
export const isRemastered = (meta = {}) => !!(meta.enhancement?.variants || []).find((v) => v.name === meta.enhancement?.listening)?.shifts_time;
/** Remaster eligibility (Chad 10-23: every talk graded B or worse; A stays transparent — MEDIA_REMASTER_GRADES; the
 *  non-English skip is a flag, default OFF — Chad: "this is working fine with non-English"). → { ok, why } */
export function remasterEligible(meta = {}, paragraphs = [], env = process.env) {
  const grades = String(env.MEDIA_REMASTER_GRADES || 'B,C,D,E').split(',').map((x) => x.trim().toUpperCase());
  const g = String(meta.quality?.overall || '').toUpperCase();
  if (!grades.includes(g)) return { ok: false, why: `grade ${g || '?'} (remaster grades ${grades.join('')})` };
  if (env.MEDIA_REMASTER_SKIP_NONEN === '1') {
    let other = 0, total = 0;
    for (const p of paragraphs) { const d = Math.max(0, (p.t1 || 0) - (p.t0 || 0)); total += d; if (p.lang && !/^en/.test(p.lang)) other += d; }
    if (other > 30 || (total && other / total > 0.03)) return { ok: false, why: `non-English ${Math.round(other)} s (skip on)` };
  }
  return { ok: true, why: `grade ${g}` };
}

/** Where the listening copy is encoded from: the 'safe' variant is the original + its chain at encode time; any other
 *  variant is its own file. → { src, af } */
export function listeningSource(meta = {}, dir = '') {
  const vs = meta.enhancement?.variants || [];
  const v = vs.find((x) => x.name === meta.enhancement?.listening) || vs.find((x) => x.name === 'safe');
  const join = (a, b) => (a ? `${a.replace(/\/$/, '')}/${b}` : b);
  if (!v || v.name === 'safe') return { src: join(dir, meta.original), af: v?.af || safeChain(vs.find((x) => x.name === 'original') || {}) };
  return { src: join(dir, v.file), af: null };
}
