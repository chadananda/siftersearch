// The chapter runner: "read the entire chapter first for context, then research it paragraph by paragraph."
//
// Everything it needs is INJECTED — the model, the ledger, the paragraph loader — so the orchestration can
// be tested without a model call or a database, and so a second book means a second profile rather than a
// second runner.
//
// Two properties matter more than the flow itself, and both come from mistakes this codebase has paid for:
//   RESUME IS FREE. Every paragraph is stamped processed, including the ones that warrant no note. Re-running
//   a chapter costs nothing and cannot duplicate; a version bump makes the work outstanding again.
//   NOTHING IS LOST SILENTLY. Held and dropped notes are returned with their reasons, so a review sees what
//   the gates removed rather than an unexplained gap.
// Deps: ./gates, ./ledger (injectable). Plan: planning/dawn-breakers-notes-plan.md

import { judgeParagraph } from './gates.js';
// The subject key MUST come from the ledger: it is the key the repetition lookup reads, and a second
// derivation here silently produced 'term:b-bu-l-b-b' for Bábu'l-Báb — diacritics eaten, so the note would
// never match its own subject again. One owner ([[feedback_transliteration_vs_aliases]]).
import { subjectKey } from './ledger.js';

/** Parse the model's JSON. Returns [] on anything unparseable — a bad response must not abort a chapter. */
export function parseNotes(raw) {
  const m = String(raw ?? '').match(/\{[\s\S]*\}/);
  if (!m) return [];
  try {
    const j = JSON.parse(m[0]);
    return Array.isArray(j.notes) ? j.notes : [];
  } catch { return []; }
}

/**
 * Annotate ONE chapter.
 * deps: { loadChapter, model, ledger, log }  — see tests for the shapes.
 * opts: { dryRun } — dryRun runs the model and the gates but writes nothing, which is how a prompt change
 *                    is judged before it touches the ledger.
 */
export async function annotateChapter({ docId, chapter, profile, deps, dryRun = false }) {
  const { loadChapter, model, ledger, log = { info() {} } } = deps;
  const { title, paragraphs } = await loadChapter(docId, chapter);
  const stats = { chapter, paragraphs: paragraphs.length, processed: 0, skipped: 0, kept: 0, held: 0, dropped: 0, empty: 0 };
  const results = [];

  // 1. THE CONTEXT PASS — the whole chapter, once, before any paragraph is judged. This is what lets a note
  //    say "watch for it: from here Nabíl never calls him anything else" instead of reading each ¶ blind.
  const chapterFrame = await model.chapterFrame({ title, text: paragraphs.map((p) => p.text).join('\n\n') });

  for (const p of paragraphs) {
    // RESUME: already stamped at this version ⇒ nothing to do, at zero cost.
    if (!dryRun && await ledger.isParagraphProcessed(docId, p.para_id, profile.version)) { stats.skipped++; continue; }

    // 2. What is this paragraph about? Resolved entity ids where the corpus knows them — identity is not a
    //    string match ([[feedback_no_literal_name_binding]]).
    const subjectKeys = (p.subjects || []).map((s) => s.key);
    const taught = subjectKeys.length ? await ledger.taughtAbout(docId, subjectKeys) : [];
    const taughtBySubject = {};
    for (const t of taught) (taughtBySubject[t.subject_key] ||= []).push(t);

    // 3. Research it, given the chapter frame and what is already covered.
    const raw = await model.research({ paragraph: p, chapterFrame, taught });
    const proposed = parseNotes(raw).map((n) => ({
      ...n,
      category: n.category,
      subjectKey: n.subjectKey || (n.subject ? subjectKey({ term: n.subject }) : 'term:unknown'),
      paragraphIndex: p.paragraph_index,
      paraId: p.para_id,
    }));

    // 4. The gates — Chad's rules, enforced (gates.js).
    const { kept, held, dropped } = judgeParagraph(proposed, { paragraph: p.text, taughtBySubject, profile });
    if (!proposed.length) stats.empty++;
    stats.kept += kept.length; stats.held += held.length; stats.dropped += dropped.length;

    // 5. Record. Notes enter as 'pending' — nothing is taught until a human keeps it.
    if (!dryRun) {
      for (const n of [...kept, ...held]) {
        await ledger.addNote({ docId, paraId: p.para_id, paragraphIndex: p.paragraph_index,
          chapterNum: chapter, chapterTitle: title, category: n.category, subjectKey: n.subjectKey,
          subjectEntityId: n.subjectEntityId ?? null, body: n.body, claimKind: n.claimKind ?? null,
          sources: n.sources, newDimension: n.newDimension ?? null, model: model.id, version: profile.version });
      }
      // THE STAMP — written even when the paragraph produced nothing, because "no note" is a correct result.
      await ledger.markParagraphProcessed(docId, p.para_id, kept.length + held.length, profile.version);
    }
    stats.processed++;
    results.push({ paraId: p.para_id, index: p.paragraph_index, kept, held, dropped });
  }

  log.info?.({ docId, ...stats }, 'notes/annotate-chapter');
  return { title, chapterFrame, stats, results };
}
