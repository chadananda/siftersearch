// REMASTER QA (Chad 10-23: "check the output of every single one … and ensure the fix was optimal"; planning/
// media-library-plan.md §13). Pure: the LISTENING PICK by perceived quality with vetoes (never worse than the original),
// and the per-talk QA VERDICT. Metrics per version: { nisqa, dnsmos_ovrl, bandwidth_khz, rolloff99_hz, clip_pct, lufs,
// asr_logprob, voice_sim (speaker-embedding cosine to the original), flatness_spikes }. Not wired into enhance until Chad
// has heard the Ioas proof of fix.

export const QA = {
  bandLossMax: 0.20,      // bandwidth or 99 % roll-off may not fall more than 20 % below the original's
  clipRiseMax: 0.1,       // percentage points of new clipping
  lufsTarget: -18, lufsTol: 2,
  asrWorseMax: 0.05,      // avg logprob may not drop more than this
  voiceMin: 0.5,          // below: the voice is no longer the speaker's (provisional — set from Chad's ear on Ioas)
  voiceBorder: 0.65,      // between voiceMin and this: a human listens
  smallGain: 0.3,         // NISQA gain that counts as "barely helped"
  poorSource: 2.5,        // NISQA below this is a poor source
};

/** A candidate's perceived score: NISQA, DNSMOS overall as the tie-breaker. */
export const perceived = (m = {}) => (m.nisqa ?? 0) + 0.25 * (m.dnsmos_ovrl ?? 0);

/** Why a candidate may not be published (empty = allowed), measured against the original. */
export function vetoes(c = {}, orig = {}, q = QA) {
  const out = [];
  const drop = (a, b) => (a != null && b != null && b > 0 ? (b - a) / b : 0);
  if (drop(c.bandwidth_khz, orig.bandwidth_khz) > q.bandLossMax && !c.removed_noise_above_speech) out.push(`bandwidth ${orig.bandwidth_khz} → ${c.bandwidth_khz} kHz`);
  if (drop(c.rolloff99_hz, orig.rolloff99_hz) > q.bandLossMax && !c.removed_noise_above_speech) out.push(`roll-off ${orig.rolloff99_hz} → ${c.rolloff99_hz} Hz`);
  if ((c.clip_pct ?? 0) - (orig.clip_pct ?? 0) > q.clipRiseMax) out.push(`new clipping ${c.clip_pct}%`);
  if (c.lufs != null && Math.abs(c.lufs - q.lufsTarget) > q.lufsTol) out.push(`loudness ${c.lufs} LUFS`);
  if (c.asr_logprob != null && orig.asr_logprob != null && orig.asr_logprob - c.asr_logprob > q.asrWorseMax) out.push(`ASR confidence ${orig.asr_logprob} → ${c.asr_logprob}`);
  if (c.voice_sim != null && c.voice_sim < q.voiceMin) out.push(`voice changed (similarity ${c.voice_sim})`);
  if ((c.flatness_spikes ?? 0) > 0) out.push(`artefacts (${c.flatness_spikes} spectral-flatness spikes)`);
  return out;
}

/** candidates: { name: metrics } incl. 'original'. → { pick, why, ranked, vetoed } — never a version that scores worse
 *  than the original or carries a veto. */
export function pickListening(candidates = {}, q = QA) {
  const orig = candidates.original || {};
  const vetoed = {};
  const ok = [];
  for (const [name, m] of Object.entries(candidates)) {
    if (name === 'original') continue;
    const v = vetoes(m, orig, q);
    if (v.length) vetoed[name] = v; else if (perceived(m) > perceived(orig)) ok.push(name);
  }
  ok.sort((a, b) => perceived(candidates[b]) - perceived(candidates[a]));
  const pick = ok[0] || 'original';
  const why = pick === 'original' ? 'no candidate beats the original without a veto' : `perceived ${perceived(orig).toFixed(2)} → ${perceived(candidates[pick]).toFixed(2)} (NISQA ${orig.nisqa} → ${candidates[pick].nisqa})`;
  return { pick, why, ranked: ok, vetoed };
}

/** The QA verdict for one published talk. strongerAvailable: a chain the grade suggests that was not tried. →
 *  { verdict: 'pass-auto' | 'needs-work' | 'review', reasons[], gain } */
export function qaVerdict({ original = {}, published = {}, strongerAvailable = false } = {}, q = QA) {
  const gain = Math.round(((published.nisqa ?? 0) - (original.nisqa ?? 0)) * 100) / 100;
  const v = vetoes(published, original, q);
  if (v.length) return { verdict: 'review', reasons: v, gain };
  if (perceived(published) < perceived(original)) return { verdict: 'review', reasons: ['published scores below the original'], gain };
  if ((original.nisqa ?? 5) < q.poorSource && gain < q.smallGain && strongerAvailable) return { verdict: 'needs-work', reasons: [`poor source (NISQA ${original.nisqa}), gain ${gain}: try the stronger chain`], gain };
  if (published.voice_sim != null && published.voice_sim < q.voiceBorder) return { verdict: 'review', reasons: [`voice similarity ${published.voice_sim}: a human listens`], gain };
  return { verdict: 'pass-auto', reasons: [], gain };
}
