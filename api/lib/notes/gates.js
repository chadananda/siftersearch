// Chad's "Important Rules" for instructor notes, made enforceable.
//
// The prompt states them and a good model mostly obeys; these are the backstop that catches the times it
// does not, and — more importantly — the record of WHY a note was dropped. Prompt-first, determinism as
// backstop ([[feedback_prompt_tuning_over_determinism]]).
//
// A rule that only lives in a prompt is a wish. Each gate below exists because one of Chad's rules is
// otherwise unverifiable after the fact:
//   "Do not summarize the paragraph."          → summary
//   "Avoid repetition ... unless a new dimension" → repetition
//   "Provide sources for factual claims"       → source
//   "Clearly distinguish teaching/parallel/interpretive" → label
//   "Be selective. Many paragraphs need one note or none." → selectivity
//
// Nothing here silently deletes: every rejection carries a reason, and HOLD is distinct from DROP because a
// note that is right but unsourced is worth chasing, not binning.
// Deps: none (pure). Plan: planning/dawn-breakers-notes-plan.md

/** Word shingles for overlap comparison; diacritics folded so Ṭáhirih and Tahirih compare equal. */
const shingles = (s, n = 4) => {
  const w = String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
  const out = new Set();
  for (let i = 0; i + n <= w.length; i++) out.add(w.slice(i, i + n).join(' '));
  return out;
};

/**
 * How much of the NOTE is lifted from the paragraph. A note that restates the passage is the single most
 * common way this kind of output turns worthless: it reads as diligent and teaches nothing.
 */
export function summaryOverlap(note, paragraph) {
  const a = shingles(note), b = shingles(paragraph);
  if (!a.size) return 0;
  let hit = 0;
  for (const s of a) if (b.has(s)) hit++;
  return hit / a.size;
}

export const SUMMARY_MAX_OVERLAP = 0.35;   // a note may quote a phrase; it may not be built from the passage

/**
 * Judge ONE note. `taught` is the ledger's answer for this note's subject (kept notes only). Returns
 * { verdict: keep | hold | drop, reason }.
 */
export function judgeNote(note, { paragraph = '', taught = [], profile = {} } = {}) {
  const body = String(note?.body || '').trim();
  if (!body) return { verdict: 'drop', reason: 'empty note' };

  // 2. Never summarise the paragraph.
  const overlap = summaryOverlap(body, paragraph);
  if (overlap > SUMMARY_MAX_OVERLAP) {
    return { verdict: 'drop', reason: `restates the paragraph (${Math.round(overlap * 100)}% overlap) — a note must ADD something`, overlap };
  }

  // 4. Avoid repetition; re-mention only for a NEW DIMENSION.
  if (taught.length && !String(note.newDimension || '').trim()) {
    return { verdict: 'drop', reason: `subject already covered at ¶${taught[0].paragraph_index} and no new dimension declared`, priorNoteId: taught[0].id };
  }

  // 5. Distinguish explicit teaching from parallel from interpretation.
  const needsLabel = (profile.labelledCategories || ['connection']).includes(note.category);
  const LABELS = ['explicit_teaching', 'strong_parallel', 'interpretive'];
  if (needsLabel && !LABELS.includes(note.claimKind)) {
    return { verdict: 'hold', reason: `a ${note.category} note must be labelled ${LABELS.join(' | ')} — an unlabelled parallel reads as doctrine` };
  }

  // 6. Sources for factual claims and quotations.
  const isFactual = note.claimKind === 'fact' || /["“][^"”]{12,}["”]/.test(body);
  if (isFactual && !(note.sources || []).length) {
    return { verdict: 'hold', reason: 'a factual claim or quotation needs a source — held for sourcing, not discarded' };
  }
  return { verdict: 'keep' };
}

/**
 * Judge a paragraph's whole set. Enforces selectivity LAST, so the strongest survive rather than the first
 * few the model happened to emit. Nothing is discarded silently: `dropped` and `held` carry their reasons.
 */
export function judgeParagraph(notes = [], { paragraph = '', taughtBySubject = {}, profile = {} } = {}) {
  const kept = []; const held = []; const dropped = [];
  for (const n of notes) {
    const j = judgeNote(n, { paragraph, taught: taughtBySubject[n.subjectKey] || [], profile });
    if (j.verdict === 'keep') kept.push({ ...n, _judge: j });
    else if (j.verdict === 'hold') held.push({ ...n, _judge: j });
    else dropped.push({ ...n, _judge: j });
  }
  // 1/3. Be selective; do not be comprehensive. Over the cap, keep the notes that add most — a note with a
  // declared new dimension or an explicit teaching outranks a bare aside.
  const cap = profile.maxNotesPerParagraph ?? 3;
  let trimmed = [];
  if (kept.length > cap) {
    const rank = (n) => (n.newDimension ? 2 : 0) + (n.claimKind === 'explicit_teaching' ? 2 : 0) + ((n.sources || []).length ? 1 : 0);
    const ordered = [...kept].sort((a, b) => rank(b) - rank(a));
    trimmed = ordered.slice(cap).map((n) => ({ ...n, _judge: { verdict: 'drop', reason: `over the ${cap}-note cap for one paragraph — kept the strongest` } }));
    return { kept: ordered.slice(0, cap), held, dropped: [...dropped, ...trimmed] };
  }
  return { kept, held, dropped };
}
