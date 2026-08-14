// Book Notes — the admin surface for the instructor-notes companion.
//
// Chad: "something we could build interactively, but it would remain in storage by book, available in the
// admin area as book-notes. Later we will create an exporter to export to OceanLibrary.com notes."
//
// The interactive loop this serves: pick a book + chapter → run → review each note (accept / edit / reject)
// → accepted notes enter the repetition ledger → the next chapter starts better informed.
//
// Read paths are free. The RUN costs model tokens and the APPLY writes to the ledger, so both are explicit:
// a run is a dry run unless asked otherwise, and writing requires a confirm token.
// Deps: api/lib/notes/*. Plan: planning/dawn-breakers-notes-plan.md

import { requireInternal } from '../lib/auth.js';
import { ApiError } from '../lib/errors.js';
import { queryAll } from '../lib/db.js';

export default async function bookNotesRoutes(fastify) {
  const admin = { preHandler: requireInternal };   // same guard as every other admin route here

  // Which books have notes, and how far along each is.
  fastify.get('/book-notes', admin, async () => {
    const rows = await queryAll(
      `SELECT n.doc_id, d.title, d.author,
              COUNT(*) notes,
              SUM(CASE WHEN n.review='pending' THEN 1 ELSE 0 END) pending,
              SUM(CASE WHEN n.review IN ('accepted','edited') THEN 1 ELSE 0 END) kept,
              COUNT(DISTINCT n.chapter_num) chapters
         FROM study_notes n LEFT JOIN docs d ON d.id = n.doc_id
        GROUP BY n.doc_id ORDER BY notes DESC`, [], 'book-notes:list').catch(() => []);
    return { books: rows };
  });

  // One book: chapter-by-chapter progress, so a reviewer can see where to pick up.
  fastify.get('/book-notes/:docId', admin, async (req) => {
    const docId = Number(req.params.docId);
    if (!Number.isFinite(docId)) throw ApiError.badRequest('numeric docId required');
    const { noteProgress } = await import('../lib/notes/ledger.js');
    const chapters = await queryAll(
      `SELECT chapter_num, MAX(chapter_title) title, COUNT(*) notes,
              SUM(CASE WHEN review='pending' THEN 1 ELSE 0 END) pending,
              SUM(CASE WHEN review IN ('accepted','edited') THEN 1 ELSE 0 END) kept,
              SUM(CASE WHEN review='rejected' THEN 1 ELSE 0 END) rejected
         FROM study_notes WHERE doc_id=? GROUP BY chapter_num ORDER BY CAST(chapter_num AS INT)`,
      [docId], 'book-notes:chapters').catch(() => []);
    return { docId, progress: await noteProgress(docId), chapters };
  });

  // A chapter's notes, for review. Markdown is rendered on request — storage holds MEANING, so the same rows
  // serve the reviewer, a future OceanLibrary export, and anything else without being re-shaped.
  fastify.get('/book-notes/:docId/chapter/:chapter', admin, async (req) => {
    const docId = Number(req.params.docId);
    const chapter = String(req.params.chapter);
    const notes = await queryAll(
      `SELECT * FROM study_notes WHERE doc_id=? AND chapter_num=? ORDER BY paragraph_index, id`,
      [docId, chapter], 'book-notes:chapter-notes').catch(() => []);
    const out = { docId, chapter, notes };
    if (req.query?.format === 'markdown') {
      const { renderChapter } = await import('../lib/notes/render.js');
      const { CATEGORIES } = await import('../lib/notes/profiles/dawn-breakers.js');
      // Only KEPT notes render: a reviewer's page shows the book as it would read, not the raw proposals.
      const kept = notes.filter((n) => ['accepted', 'edited'].includes(n.review));
      out.markdown = renderChapter(kept, { categories: CATEGORIES, chapterTitle: notes[0]?.chapter_title || `Chapter ${chapter}` });
    }
    return out;
  });

  // Review one note. An edit is stored separately from the model's original, so the prompt can be judged
  // against what a human actually kept.
  fastify.post('/book-notes/note/:id/review', admin, async (req) => {
    const id = Number(req.params.id);
    const { review, editedBody } = req.body || {};
    if (!Number.isFinite(id)) throw ApiError.badRequest('numeric note id required');
    const { reviewNote } = await import('../lib/notes/ledger.js');
    await reviewNote(id, { review, editedBody: editedBody ?? null });
    return { id, review };
  });

  // Run a chapter. DRY RUN unless confirmed: this is the only endpoint here that spends money, and applying
  // also writes to the ledger. Returns the rendered notes AND the gate rejections with their reasons —
  // a review that only shows survivors hides the reason a prompt is going wrong.
  fastify.post('/book-notes/:docId/chapter/:chapter/run', admin, async (req) => {
    const docId = Number(req.params.docId);
    const chapter = String(req.params.chapter);
    const apply = req.body?.confirm === 'write-notes';
    const [{ loadChapter, makeModel }, { annotateChapter }, { renderChapter }, ledger, profileModule] = await Promise.all([
      import('../lib/notes/runtime.js'), import('../lib/notes/chapter.js'), import('../lib/notes/render.js'),
      import('../lib/notes/ledger.js'), import('../lib/notes/profiles/dawn-breakers.js'),
    ]);
    const profile = { ...profileModule.profile, version: ledger.NOTES_VERSION };
    const model = await makeModel(profileModule);
    const r = await annotateChapter({ docId, chapter, profile, dryRun: !apply,
      deps: { loadChapter, model, ledger, log: fastify.log } });
    const kept = r.results.flatMap((p) => p.kept.map((n) => ({ ...n, paragraph_index: p.index, claim_kind: n.claimKind })));
    return {
      docId, chapter, applied: apply, model: model.id, stats: r.stats,
      chapterFrame: r.chapterFrame,
      markdown: renderChapter(kept, { categories: profileModule.CATEGORIES, chapterTitle: r.title }),
      rejections: r.results.flatMap((p) => [...p.held, ...p.dropped].map((n) => ({
        paragraph: p.index, verdict: n._judge.verdict, category: n.category, reason: n._judge.reason, body: n.body,
      }))),
    };
  });
}
