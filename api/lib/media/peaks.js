// Waveform peaks in the BBC audiowaveform JSON format (v2, 8-bit, mono): { version, channels, sample_rate,
// samples_per_pixel, bits, length, data: [min0, max0, min1, max1, …] } — what peaks.js / wavesurfer read. Computed from
// mono PCM (Float32 in [-1, 1]) so no system package is needed. Pure.

export function computePeaks(samples, sampleRate, { pixelsPerSecond = 20 } = {}) {
  const spp = Math.max(1, Math.round(sampleRate / pixelsPerSecond));
  const length = Math.ceil(samples.length / spp);
  const data = new Array(length * 2);
  const q = (v) => Math.max(-128, Math.min(127, Math.round(v * 127)));
  for (let i = 0; i < length; i++) {
    let lo = 0, hi = 0;
    const end = Math.min(samples.length, (i + 1) * spp);
    for (let j = i * spp; j < end; j++) { const v = samples[j]; if (v < lo) lo = v; if (v > hi) hi = v; }
    data[2 * i] = q(lo); data[2 * i + 1] = q(hi);
  }
  return { version: 2, channels: 1, sample_rate: sampleRate, samples_per_pixel: spp, bits: 8, length, data };
}

/** Peaks scaled so the loudest pixel reaches full height (quiet old tapes still draw a readable wave). */
export function normalizePeaks(p) {
  const max = Math.max(1, ...p.data.map((v) => Math.abs(v)));
  const k = 127 / max;
  return { ...p, data: p.data.map((v) => Math.max(-128, Math.min(127, Math.round(v * k)))) };
}
