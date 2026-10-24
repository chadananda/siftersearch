// REMASTER QA (Chad 10-23: "check the output of every single one … and ensure the fix was optimal"; planning/
// media-library-plan.md §13). Pure: the LISTENING PICK by perceived quality with vetoes (never worse than the original),
// and the per-talk QA VERDICT. Metrics per version: { nisqa, dnsmos_ovrl, bandwidth_khz, rolloff99_hz, clip_pct, lufs,
// asr_logprob, voice_sim (speaker-embedding cosine to the original), flatness_spikes }. Not wired into enhance until Chad
// has heard the Ioas proof of fix.
// 10-23 Chad, by ear on Ioas: NISQA 1.2 → 4.6 and DNSMOS 1.2 → 3.1, yet "badly mangled … many words are clipped" — the
// perceived-quality models rewarded noise removal while INTELLIGIBILITY got worse. So intelligibility is checked FIRST and
// dominates: any word lost against the original is a veto; and no processing chain is picked at all until Chad has
// approved it by ear (approvedChains, empty by default → the transparent original).

export const QA = {
  wordsLostMax: 0,        // ANY word the original's transcript has (confident) and the candidate's lacks → veto
  lowConfRiseMax: 0.02,   // share of low-confidence words may not rise by more than 2 points
  onsetLossMaxDb: 2,      // speech-onset energy (first 50 ms of each word) may not fall by more than 2 dB
  approvedChains: [],     // chains Chad approved BY EAR; empty → no processed copy is ever picked
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
/** Word-level comparison on the same segments: the original's confident words (conf ≥ 0.5) the candidate's transcript
 *  lacks (an LCS alignment of normalised tokens), and the change in the low-confidence share. words: [{ w, conf }] */
export function compareWords(origWords = [], candWords = []) {
  const norm = (x) => String(x.w ?? x.word ?? x).toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
  const a = origWords.map(norm), b = candWords.map(norm);
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const kept = new Set();
  for (let i = 0, j = 0; i < n && j < m;) { if (a[i] === b[j]) { kept.add(i); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) i++; else j++; }
  const lost = origWords.map((w, i) => ({ w: a[i], conf: w.conf ?? w.score ?? 1, i })).filter((x) => !kept.has(x.i) && x.conf >= 0.5 && x.w);
  const low = (ws) => (ws.length ? ws.filter((w) => (w.conf ?? w.score ?? 1) < 0.5).length / ws.length : 0);
  return { words_lost: lost.length, lost: lost.slice(0, 20).map((x) => x.w), low_conf_rise: Math.round((low(candWords) - low(origWords)) * 1000) / 1000 };
}

export function vetoes(c = {}, orig = {}, q = QA) {
  const out = [];
  // INTELLIGIBILITY first (it dominates — Chad 10-23)
  if (c.words_lost != null && c.words_lost > q.wordsLostMax) out.push(`intelligibility: ${c.words_lost} word(s) lost against the original${c.lost?.length ? ` (${c.lost.slice(0, 5).join(', ')})` : ''}`);
  if (c.low_conf_rise != null && c.low_conf_rise > q.lowConfRiseMax) out.push(`intelligibility: low-confidence words +${Math.round(c.low_conf_rise * 100)} points`);
  if (c.onset_loss_db != null && c.onset_loss_db > q.onsetLossMaxDb) out.push(`intelligibility: word onsets ${c.onset_loss_db} dB weaker`);
  if (c.words_lost == null && !c.is_original) out.push('intelligibility not measured (word-level comparison required)');
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
    const chain = m.chain || name;
    if (!q.approvedChains.includes(chain)) v.unshift(`chain '${chain}' not approved by ear (a human A/B is mandatory)`);
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
