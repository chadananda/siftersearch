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
export function chooseListening(variants) {
  const by = Object.fromEntries(variants.filter(Boolean).map((v) => [v.name, v]));
  const l = by.light, d = by.dfn;
  if (d && l && d.snr_db != null && l.snr_db != null && d.snr_db - l.snr_db >= 3 && (d.avg_logprob ?? -9) >= (l.avg_logprob ?? -9) - 0.05) {
    return { name: 'dfn', why: `DeepFilterNet SNR +${(d.snr_db - l.snr_db).toFixed(1)} dB, ASR not worse` };
  }
  return { name: 'light', why: d ? 'DeepFilterNet did not clearly help' : 'light chain' };
}
