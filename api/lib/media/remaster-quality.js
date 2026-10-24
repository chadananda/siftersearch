// Per-talk remaster quality verdict (Chad 10-24: which talks are usable, which must be archived). Pure: meta.json → meta.qa.remaster.
// usable (generative copy published, <= 5 % of sentences from the original) · cleaned (deterministic cleanup published) · partial (published, 5-15 %) · review (fallback > 15 %, original kept, Chad listens)
// · unrepairable (still playing the original audio: ~2 kHz source or decided by Chad; archive candidate) · skipped (grade A, duplicate, ineligible) · unknown.
const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
export const UNREPAIRABLE_BW_KHZ = 2.5;

export function qualityOf(meta = {}) {
  const r = meta.remaster || null, raw = meta.quality?.raw || {};
  const g = (meta.enhancement?.variants || []).find((v) => v.name === 'unipase')?.guard || {};
  const fb = num(r?.fallback_sent_pct ?? r?.swapped_pct);
  const bw = num(raw.bandwidth_khz);
  const metrics = {
    grade: meta.quality?.overall ?? null, source_bandwidth_khz: bw, source_rolloff_hz: num(raw.rolloff_hz), source_snr_db: num(raw.snr_db),
    output_bandwidth_khz: num(g.output_bandwidth_khz), fallback_pct: fb, sentences: r?.sentences ?? null, sentences_from_original: r?.swapped ?? null,
    words_lost_confident: g.lost_words ?? g.lost_confident ?? null, confidence_delta: num(g.conf_delta ?? g.confidence_delta),
    unguardable_s: num(r?.unguardable_s), languages: meta.languages || (meta.language ? [meta.language] : null),
    realign_unplaced_pct: num(r?.realign_unplaced_pct), listening: meta.enhancement?.listening ?? null,
  };
  const out = (verdict, reason) => ({ verdict, reason, metrics, at: new Date().toISOString() });
  if (!r) return out('unknown', 'no remaster record');
  const s = r.status;
  if (s === 'skipped') return out('skipped', r.why || 'not eligible');
  if (s === 'waiting' || s == null) return out('unknown', r.why || 'not processed yet');
  const lowBw = bw != null && bw <= UNREPAIRABLE_BW_KHZ;
  if (s === 'kept' || s === 'deferred') return out('unrepairable', `still playing the original audio${lowBw ? ` (source bandwidth ${bw} kHz)` : ''}${fb != null ? `, ${fb} % of sentences fell back` : ''}${r.verdict === 'keep-human' ? ' — decided by Chad' : ''}`);
  if (s === 'review') {
    if (lowBw && fb != null && fb > 15) return out('unrepairable', `source bandwidth ${bw} kHz and ${fb} % of sentences fell back: real word damage`);
    return out('review', r.why || `${fb} % of sentences fell back (> 15 %)`);
  }
  if (s === 'done') {
    if (meta.enhancement?.listening !== 'unipase') return out('unknown', 'marked done but the listening copy is not the remaster');
    if (r.method === 'cleaned') return out('cleaned', 'deterministic cleanup published (the generative copy was held by the word guard)');
    if (r.verdict === 'pass-human-full') return out('usable', 'published in full by Chad (no sentence splicing)');
    return fb != null && fb > 5 ? out('partial', `${fb} % of sentences are the original`) : out('usable', fb != null ? `${fb} % of sentences from the original` : 'passed the word guard');
  }
  return out('unknown', `status ${s}`);
}

/** Summary over [{ slug, hours, grade, qa }]: counts by verdict and grade, the review + unrepairable lists, published remasters with no verdict. */
export function summarize(rows) {
  const by = {}, byGrade = {}, review = [], unrepairable = [];
  let noVerdict = 0;
  for (const x of rows) {
    const v = x.qa?.verdict || 'unknown';
    by[v] = (by[v] || 0) + 1;
    const g = (byGrade[x.grade || '?'] ||= {}); g[v] = (g[v] || 0) + 1;
    const row = { slug: x.slug, hours: Math.round((x.hours || 0) * 100) / 100, grade: x.grade, reason: x.qa?.reason, fallback_pct: x.qa?.metrics?.fallback_pct ?? null, bandwidth_khz: x.qa?.metrics?.source_bandwidth_khz ?? null };
    if (v === 'review') review.push(row); else if (v === 'unrepairable') unrepairable.push(row);
    if (x.published_remaster && !(x.stored ?? !!x.qa?.verdict)) noVerdict++;
  }
  return { by_verdict: by, by_grade: byGrade, review, unrepairable, published_without_verdict: noVerdict, at: new Date().toISOString() };
}

export function deferredMarkdown(sum) {
  const L = ['# Remaster deferred / archive candidates (written by media-remaster-quality)', '', 'The original stays published. Archive-or-not is Chad\'s call; nothing leaves the library.', '',
    '| slug | grade | hours | bandwidth kHz | fallback % | reason |', '|---|---|---|---|---|---|'];
  for (const x of sum.unrepairable) L.push(`| ${x.slug} | ${x.grade ?? ''} | ${x.hours} | ${x.bandwidth_khz ?? ''} | ${x.fallback_pct ?? ''} | ${x.reason ?? ''} |`);
  return `${L.join('\n')}\n`;
}
