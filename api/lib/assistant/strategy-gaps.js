// Strategy GAPS (strategy graph Phase 3): which turns no strategy served, and their CLASSES. Pure. A gap = Jev was unsure which
// strategy (strategy decision reason low-confidence / no-answer) OR the improve judge named a STRATEGY weakness. Gaps cluster by
// Jev's label first (what he leaned to, or the judge's `right`), then by word overlap (Intl.Segmenter words — no regex on the
// reader's text; `sim` is injectable for an embedding). A cluster is READY at ≥ min_questions distinct questions from ≥ min_threads
// threads: one question is never acted on. Thresholds: config/strategy-improve.json.
import { readFileSync } from 'fs';

export const IMPROVE_CFG = JSON.parse(readFileSync(new URL('../../../config/strategy-improve.json', import.meta.url), 'utf8'));
const UNSURE = new Set(['low-confidence', 'no-answer']);

/** One turn → a gap row, or null. turn: { turnId, threadId, question, path (path_json), judge (parseJudge) }. */
export function gapOf({ turnId, threadId = null, question, path = {}, judge = null }) {
  if (!turnId || !question) return null;
  const d = (path?.decisions || []).find((x) => x?.point === 'strategy');
  const probs = d?.probabilities && typeof d.probabilities === 'object' ? d.probabilities : {};
  const top = Object.entries(probs).filter(([, v]) => typeof v === 'number').sort((a, b) => b[1] - a[1])[0] || null;
  const unsure = d && UNSURE.has(d.reason);
  const judged = judge?.verdict === 'weak' && judge.stage === 'STRATEGY';
  if (!unsure && !judged) return null;
  const jevChoice = top?.[0] ?? d?.chosen ?? path?.strategy?.choice ?? null;
  // the class label: the judge's named right option, else what Jev leaned to (old logs say 'other' for 'unmatched': same row)
  const label = (judged && judge.gate === 'anis-strategy' && judge.right) || jevChoice || 'none';
  return { turn_id: String(turnId), thread_id: threadId != null ? String(threadId) : null, question: String(question), label: String(label),
    source: judged ? 'judge' : 'jev', jev_choice: jevChoice, jev_confidence: top?.[1] ?? null, reason: d?.reason ?? (judged ? 'judge' : null),
    judge_why: judged ? (judge.why || null) : null };
}

// ── words (no regex): Intl.Segmenter word-like segments, lower-cased, short function words dropped ──
const SEG = new Intl.Segmenter(undefined, { granularity: 'word' });
const MIN_LEN = 4;
export function words(text) {
  const out = new Set();
  for (const s of SEG.segment(String(text || '').toLowerCase())) if (s.isWordLike && [...s.segment].length >= MIN_LEN) out.add(s.segment);
  return out;
}
export function jaccardWords(a, b) {
  const A = a instanceof Set ? a : words(a), B = b instanceof Set ? b : words(b);
  if (!A.size || !B.size) return 0;
  let n = 0;
  for (const w of A) if (B.has(w)) n++;
  return n / (A.size + B.size - n);
}

/** Gaps → clusters [{ key, label, gaps, questions (distinct), threads, ready }], biggest first. Centre-based: a gap joins the
 *  first cluster of its label whose CENTRE question it resembles (sim ≥ similarity); fuzzy matches never chain. */
export function clusterGaps(gaps, { sim = jaccardWords, similarity = IMPROVE_CFG.gaps.similarity, minQuestions = IMPROVE_CFG.gaps.min_questions,
  minThreads = IMPROVE_CFG.gaps.min_threads } = {}) {
  const clusters = [];
  for (const g of gaps) {
    const c = clusters.find((x) => x.label === g.label && sim(x.centre, g.question) >= similarity);
    if (c) c.gaps.push(g); else clusters.push({ label: g.label, centre: g.question, centreTurn: g.turn_id, gaps: [g] });
  }
  return clusters.map((c) => {
    const seen = new Map();
    for (const g of c.gaps) { const k = [...words(g.question)].sort().join(' ') || String(g.question).trim().toLowerCase(); if (!seen.has(k)) seen.set(k, g.question); }
    const threads = new Set(c.gaps.map((g) => g.thread_id ?? g.turn_id));
    return { key: `${c.label}#${c.centreTurn}`, label: c.label, gaps: c.gaps, questions: [...seen.values()], threads: threads.size,
      reasons: [...new Set(c.gaps.map((g) => g.judge_why).filter(Boolean))],
      ready: seen.size >= minQuestions && threads.size >= minThreads };
  }).sort((a, b) => b.questions.length - a.questions.length);
}
