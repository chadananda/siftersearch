// Per-talk remaster quality verdict (Chad 10-24: which talks are usable, which must be archived). Pure: meta.json → meta.qa.remaster.
// usable (pure generative copy published) · cleaned (deterministic cleanup published) · spliced (original sentences mixed in: NEVER published, Chad 10-29) · review (fallback > 15 %, original kept, Chad listens)
// · unchanged (measured: no different from the original) · unverified (no measurement yet) · unrepairable (still playing the original audio: ~2 kHz source or decided by Chad; archive candidate) · skipped (grade A, duplicate, ineligible) · unknown.
const num = (v) => (v == null || Number.isNaN(Number(v)) ? null : Math.round(Number(v) * 100) / 100);
export const UNREPAIRABLE_BW_KHZ = 2.5;
export const assessmentOf = (meta = {}) => meta.remaster?.output_assessment || meta.qa?.remaster?.output_assessment || null;
/** Measured proof the remaster stands: the worker's paired check passed, the judge published it from the stored scores (10-31), or Chad published it. */
export const remasterProven = (meta = {}) => assessmentOf(meta)?.passed === true || meta.remaster?.judged?.action === 'publish' || meta.remaster?.verdict === 'pass-human-full';
export const JUDGE_RULE = 'v1-2026-10-31';
const R = (n, d = 2) => (Number.isFinite(Number(n)) ? Math.round(Number(n) * 10 ** d) / 10 ** d : null);
/** THE JUDGE (Chad 10-31: "if they are actually worse, held for review; the same or better, published with the remaster"). Pure: meta.json → { action, reason, problems[], scores }.
 *  hold = actually worse (a regression check, NISQA mean down > 0.1, a decoded-length mismatch > 1 s, words changed > 15 %, original sentences mixed in) · rerun = a pipeline failure, not audio
 *  (realign placed 0 words, no assessment) · publish = the same or better (a missing quality GAIN alone is "same"). The length is the DECODED one (meta.duration_s), never an MP3 header estimate. */
export function remasterJudgement(meta = {}) {
  const r = meta.remaster || {}, a = assessmentOf(meta), c = a?.checks || null, problems = [], words = [];
  const nb = a?.reference?.nisqa?.[0], na = a?.restored?.nisqa?.[0], delta = nb != null && na != null ? na - nb : null;
  const scores = a ? { nisqa: [R(nb), R(na)], dnsmos_overall: [R(a.reference?.dnsmos?.[3]), R(a.restored?.dnsmos?.[3])], dnsmos_speech: [R(a.reference?.dnsmos?.[1]), R(a.restored?.dnsmos?.[1])], clip_pct: R(a.technical?.clip_pct, 3), duration_s: R(a.technical?.duration_s) } : null;
  const flag = (code, text) => { problems.push(code); words.push(text); };
  if (c) {
    if (c.overall_no_regression === false) flag('overall_regression', `overall sound quality dropped (${scores.dnsmos_overall[0]} to ${scores.dnsmos_overall[1]})`);
    if (c.speech_no_material_regression === false) flag('speech_regression', `the speech itself sounds worse (${scores.dnsmos_speech[0]} to ${scores.dnsmos_speech[1]})`);
    if (c.no_bad_excerpt === false) flag('bad_excerpt', 'at least one stretch of the talk sounds clearly worse than the original');
    if (c.no_material_clipping === false) flag('clipping', `the remaster distorts in loud places (${scores.clip_pct} % of samples clipped)`);
  }
  if (delta != null && delta < -0.1) flag('nisqa_down', `speech quality score fell from ${R(nb)} to ${R(na)}`);
  const dur = Number(meta.duration_s), rd = Number(a?.technical?.duration_s);
  if (Number.isFinite(dur) && dur > 0 && Number.isFinite(rd) && rd > 0 && Math.abs(rd - dur) > 1) flag('duration', `the remaster is ${R(Math.abs(rd - dur), 1)} s ${rd > dur ? 'longer' : 'shorter'} than the talk`);
  const fb = r.fallback_sent_pct ?? r.swapped_pct;
  if (Number(fb) > 15) flag('word_fallback', `the remaster changed the words: ${R(fb, 1)} % of sentences had to be replaced by the original`);
  else if (Number(r.swapped) > 0) flag('spliced', `the copy mixes in ${r.swapped} sentences of the original`);
  if (problems.length) return { action: 'hold', reason: `Held: ${words.join('; ')}.`, problems, scores, rule: JUDGE_RULE };
  if (/realign placed 0 of \d+ words/.test(r.why || '')) return Number(r.rerun_n || 0) >= 1
    ? { action: 'hold', reason: 'Held: the word timings could not be placed on the remaster twice.', problems: ['realign_failed'], scores, rule: JUDGE_RULE }
    : { action: 'rerun', stages: ['realign', 'web', 'trim', 'update'], reason: 'The word timing failed, not the audio: aligning the words again.', problems: ['realign_failed'], scores, rule: JUDGE_RULE };
  if (!c) return { action: 'rerun', stages: ['remaster'], reason: 'No quality assessment is stored: the remaster is assessed again.', problems: ['no_assessment'], scores, rule: JUDGE_RULE };
  return { action: 'publish', reason: delta != null && delta >= 0.15 ? `Better: speech quality ${R(nb)} to ${R(na)}.` : 'The same or better than the original.', problems: [], scores, rule: JUDGE_RULE };
}

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
  const tierOf = (v) => ({ usable: 'heavy', cleaned: 'cleaned', light: 'light' }[v] || null);
  const out = (verdict, reason) => ({ verdict, tier: tierOf(verdict), reason, metrics, ...(meta.remaster?.output_assessment || meta.qa?.remaster?.output_assessment ? { output_assessment: meta.remaster?.output_assessment || meta.qa.remaster.output_assessment } : {}), at: new Date().toISOString() });
  if (meta.remaster_tier === 'light' && meta.enhancement?.listening !== 'unipase') {
    if (['D','E'].includes(meta.quality?.overall)) return out(r?.status === 'review' ? 'review' : 'pending', 'poor-quality source has only basic cleanup; full restoration has not passed the publication checks');
    return out('light', 'deterministic light restoration (high-pass, hum notch, loudness); the raw original is kept beside it');
  }
  if (!r) return out('unknown', 'no remaster record');
  const s = r.status;
  if (s === 'skipped') return out('skipped', r.why || 'not eligible');
  if (s === 'archived') return out('archived', r.archived_why || 'archived by Chad: kept for better technology, out of every queue');
  if (s === 'waiting' || s == null) return out('unknown', r.why || 'not processed yet');
  const lowBw = bw != null && bw <= UNREPAIRABLE_BW_KHZ;
  if (s === 'kept' || s === 'deferred') return out('unrepairable', `still playing the original audio${lowBw ? ` (source bandwidth ${bw} kHz)` : ''}${fb != null ? `, ${fb} % of sentences fell back` : ''}${r.verdict === 'keep-human' ? ' — decided by Chad' : ''}`);
  if (s === 'review') {
    if (lowBw && fb != null && fb > 15) return out('unrepairable', `source bandwidth ${bw} kHz and ${fb} % of sentences fell back: real word damage`);
    return out('review', r.why || `${fb} % of sentences fell back (> 15 %)`);
  }
  if (s === 'done') {
    if (meta.enhancement?.listening !== 'unipase') return out('unknown', 'marked done but the listening copy is not the remaster');
    // MEASURED PROOF (Chad 10-29): published only if the audio is shown to differ — the worker's paired quality check passed, or the verify stage measured a change
    const assessed = remasterProven(meta), ck = r.check?.verdict;
    if (!assessed && ck !== 'changed') return ['unchanged', 'suspect'].includes(ck) ? out('unchanged', r.check.why || 'the remaster is not measurably different from the original') : out('unverified', 'no measured proof that the remaster differs from, or improves on, the original');
    if (r.verdict === 'pass-human-full') return out('usable', 'published in full by Chad (no sentence splicing)');   // the full copy is pure by construction
    // NEVER A SPLICE (Chad 10-29): any sentence from the original inside the listening copy = not publishable (the old word guard spliced)
    if ((r.swapped || 0) > 0 || (fb || 0) > 0) return out('spliced', `mixes original and remastered audio (${r.swapped ?? '?'} sentences, ${fb ?? '?'} % from the original): revert, then re-render the pure copy`);
    if (r.method === 'cleaned') return out('cleaned', 'deterministic cleanup published (the generative copy was held by the word guard)');
    return out('usable', 'pure remaster (no sentence from the original)');
  }
  return out('unknown', `status ${s}`);
}

/** Summary over [{ slug, hours, grade, qa }]: counts by verdict and grade, the review + unrepairable lists, published remasters with no verdict. */
export function summarize(rows) {
  const by = {}, byGrade = {}, byTier = {}, review = [], unrepairable = [], insufficient = [];
  let noVerdict = 0;
  const assessment = { passed: 0, failed: 0, none: 0 }, unassessed = [], spliced = [];
  for (const x of rows) {
    const v = x.qa?.verdict || 'unknown';
    by[v] = (by[v] || 0) + 1;
    const t = x.qa?.tier || 'none'; byTier[t] = (byTier[t] || 0) + 1;
    const g = (byGrade[x.grade || '?'] ||= {}); g[v] = (g[v] || 0) + 1;
    const row = { slug: x.slug, hours: Math.round((x.hours || 0) * 100) / 100, grade: x.grade, reason: x.qa?.reason, fallback_pct: x.qa?.metrics?.fallback_pct ?? null, bandwidth_khz: x.qa?.metrics?.source_bandwidth_khz ?? null };
    if (v === 'pending') insufficient.push(row);
    if (v === 'review') review.push(row); else if (v === 'unrepairable') unrepairable.push(row);
    if (v === 'spliced') spliced.push(x.slug);
    if (x.published_remaster && !(x.stored ?? !!x.qa?.verdict)) noVerdict++;
    // publishable on level-change proof alone = different, not shown BETTER (no paired listening assessment): the re-assess queue
    if (['usable', 'cleaned'].includes(v)) {
      const a = x.qa?.output_assessment?.passed;
      assessment[a === true ? 'passed' : a === false ? 'failed' : 'none']++;
      if (a !== true) unassessed.push(x.slug);
    }
  }
  return { by_verdict: by, by_tier: byTier, by_grade: byGrade, review, unrepairable, insufficient_restoration: insufficient.length, insufficient, published_without_verdict: noVerdict, assessment, unassessed, spliced, at: new Date().toISOString() };
}

export function deferredMarkdown(sum) {
  const L = ['# Remaster deferred / archive candidates (written by media-remaster-quality)', '', 'The original stays published. Archive-or-not is Chad\'s call; nothing leaves the library.', '',
    '| slug | grade | hours | bandwidth kHz | fallback % | reason |', '|---|---|---|---|---|---|'];
  for (const x of sum.unrepairable) L.push(`| ${x.slug} | ${x.grade ?? ''} | ${x.hours} | ${x.bandwidth_khz ?? ''} | ${x.fallback_pct ?? ''} | ${x.reason ?? ''} |`);
  return `${L.join('\n')}\n`;
}
