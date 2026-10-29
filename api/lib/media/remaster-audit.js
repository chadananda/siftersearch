// Objective "did the remaster change anything" test on level measurements (dB) of the same window of both copies.
// compareCopies is pure; measureCopy/verifyRemaster spawn light ffmpeg analysis (tower 'light' class, -f null) through tools.run. Used by the 'verify' stage in item.js.

/** main/original: { all, hf4, hf8, trough } dB (mean volume overall, above 4 kHz, above 8 kHz; RMS trough = noise-floor proxy). */
export function compareCopies(main, original, tier = 'heavy') {
  const ok = (m) => m && ['all', 'hf4', 'hf8', 'trough'].every((k) => Number.isFinite(m[k]));
  if (!ok(main) || !ok(original)) {
    const bad = (m, who) => ['all', 'hf4', 'hf8', 'trough'].filter((k) => !Number.isFinite(m?.[k])).map((k) => `${who}.${k}`);
    return { verdict: 'error', why: `measurement failed: ${[...bad(main, 'remaster'), ...bad(original, 'original')].join(', ')}` };
  }
  // high-band energy relative to the whole signal: bandwidth restoration raises it, noise removal lowers it
  const rel4 = (main.hf4 - main.all) - (original.hf4 - original.all);
  const rel8 = (main.hf8 - main.all) - (original.hf8 - original.all);
  const floor = main.trough - original.trough - (main.all - original.all);   // noise floor relative to level; negative = quieter noise
  const delta = { rel4: +rel4.toFixed(1), rel8: +rel8.toFixed(1), floor: +floor.toFixed(1) };
  const moved = Math.abs(rel4) >= 2 || Math.abs(rel8) >= 2 || Math.abs(floor) >= 3;
  if (!moved) return { verdict: 'unchanged', delta, why: `no measurable change vs original (hf4 ${delta.rel4} dB, hf8 ${delta.rel8} dB, floor ${delta.floor} dB)` };
  if (tier === 'heavy' && rel4 < 1 && rel8 < 1 && floor > -3) return { verdict: 'suspect', delta, why: `heavy tier but no bandwidth gain or noise drop (hf4 ${delta.rel4}, hf8 ${delta.rel8}, floor ${delta.floor})` };
  return { verdict: 'changed', delta, why: 'differs from the original' };
}

import { existsSync } from 'node:fs';
// '-inf' (digital silence) and the -195 dB a silent stretch gives are clamped to -120 dB, so a talk with a gap still measures
const dbOf = (txt, re) => { const m = re.exec(txt || ''); return !m ? NaN : m[1] === '-inf' ? -120 : Math.max(-120, Number(m[1])); };

/** Levels of one 60 s window (starting at 40 % of the talk): overall, above 4 kHz, above 8 kHz, RMS trough (noise-floor proxy). */
export async function measureCopy(run, file, durationS = 0) {
  const ss = String(Math.max(0, Math.min(Math.round((durationS || 600) * 0.4), Math.max(0, (durationS || 600) - 70))));
  const pass = async (af) => (await run('ffmpeg', ['-nostdin', '-v', 'info', '-ss', ss, '-t', '60', '-i', file, '-af', af, '-f', 'null', '-'])).stderr;
  const level = async (af) => dbOf(await pass(`${af},volumedetect`), /mean_volume: (-inf|-?[\d.]+) dB/);
  const trough = dbOf(await pass('astats=metadata=0'), /RMS th?rough dB: (-inf|-?[\d.]+)/);
  return { all: await level('anull'), hf4: await level('highpass=f=4000'), hf8: await level('highpass=f=8000'), trough };
}

/** Did the remaster change the audio for the better? → { verdict: changed|unchanged|suspect|error, delta, why, original, remaster }. */
export async function verifyRemaster({ run, original, remaster, durationS, tier }) {
  if (!original || !existsSync(original) || !existsSync(remaster)) return { verdict: 'unverifiable', why: 'the original or the remastered audio is not on this host' };
  const [o, m] = [await measureCopy(run, original, durationS), await measureCopy(run, remaster, durationS)];
  return { ...compareCopies(m, o, tier), original: o, remaster: m };
}
