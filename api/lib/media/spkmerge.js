// INVENTED SECOND SPEAKERS (10-23: in ~16 % of diarized talks a labelled "other speaker" — "Co-presenter", "Chair",
// "Participant" — is the main speaker's own voice, e.g. Nakhjavání's own reminiscence of the House labelled "Co-presenter").
// media_tool.py spkmerge scores each other speaker (60 s excerpt) and each of its paragraphs against the main voice (titanet);
// a paragraph goes back to the main speaker only when BOTH its speaker and the paragraph itself match — so a real questioner
// in the same room stays apart. Pure decisions + the edit of the transcript files.

export const MERGE = { speakerMin: 0.85, spanMin: 0.80 };

/** paragraphs [{ t0, t1, spk }] → { mainKey, main: [[s, e]], others: { spk: [[s, e]] }, index: { spk: [paragraph index] } } */
export function spansOf(paragraphs = []) {
  const time = new Map();
  for (const p of paragraphs) if (p.spk) time.set(p.spk, (time.get(p.spk) || 0) + Math.max(0, (p.t1 || 0) - (p.t0 || 0)));
  const mainKey = [...time].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  const main = [], others = {}, index = {};
  paragraphs.forEach((p, i) => {
    if (!p.spk || p.t1 == null || p.t0 == null) return;
    if (p.spk === mainKey) main.push([p.t0, p.t1]);
    else { (others[p.spk] ||= []).push([p.t0, p.t1]); (index[p.spk] ||= []).push(i); }
  });
  return { mainKey, main, others, index };
}

/** media_tool spkmerge's answer → [paragraph index] to relabel as the main speaker, with the per-speaker summary. */
export function decideMerge(result = {}, spans = {}, q = MERGE) {
  const merge = [], summary = {};
  for (const [spk, r] of Object.entries(result.others || {})) {
    const idx = spans.index?.[spk] || [];
    if (r.cos == null || r.cos < q.speakerMin) { summary[spk] = { cos: r.cos, merged: 0, kept: idx.length, why: 'a different voice' }; continue; }
    let m = 0;
    (r.spans || []).forEach((c, k) => { if (c != null && c >= q.spanMin && idx[k] != null) { merge.push(idx[k]); m++; } });
    summary[spk] = { cos: r.cos, merged: m, kept: idx.length - m };
  }
  return { merge, summary };
}

/** Relabel the merged paragraphs; drop speaker names left with no paragraph. → { paragraphs, speakers, merged } */
export function applyMerge(paragraphs = [], speakers = {}, mainKey, merge = []) {
  const set = new Set(merge);
  const out = paragraphs.map((p, i) => (set.has(i) ? { ...p, spk: mainKey, spk_merged_from: p.spk } : p));
  const used = new Set(out.map((p) => p.spk));
  const sp = Object.fromEntries(Object.entries(speakers || {}).filter(([k]) => used.has(k)));
  return { paragraphs: out, speakers: sp, merged: set.size };
}
