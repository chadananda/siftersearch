// The instructor-notes ledger — the persistent research-notes database Chad asked for, and the mechanism
// that makes "avoid repetition" enforceable rather than a prompt instruction.
//
// Two invariants carry the whole design, and both come from mistakes this codebase has already paid for:
//   1. ONLY KEPT NOTES COUNT AS TAUGHT. A rejected note must never suppress a later good one, or the
//      anti-repetition mechanism silently becomes a gap-maker.
//   2. COMPLETION IS A STAMP, NEVER A NOTE COUNT. Chad's first rule is "many paragraphs need one note or
//      none", so empty is the COMMON, CORRECT outcome — and measuring done-ness by output is the bug that
//      cost 2026-08-13 twice (disambiguation, then hype).
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

let raw;
const SCHEMA = `
CREATE TABLE study_notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id INTEGER NOT NULL, para_id TEXT NOT NULL,
  paragraph_index INTEGER NOT NULL, chapter_num TEXT, chapter_title TEXT, category TEXT NOT NULL,
  subject_key TEXT NOT NULL, subject_entity_id INTEGER, body TEXT NOT NULL, edited_body TEXT,
  claim_kind TEXT, sources_json TEXT, new_dimension TEXT, review TEXT NOT NULL DEFAULT 'pending',
  model TEXT, version TEXT, created_at INTEGER DEFAULT (unixepoch()), reviewed_at INTEGER);
CREATE TABLE study_note_pass (
  doc_id INTEGER NOT NULL, para_id TEXT NOT NULL, version TEXT NOT NULL,
  notes_written INTEGER NOT NULL DEFAULT 0, at INTEGER DEFAULT (unixepoch()),
  PRIMARY KEY (doc_id, para_id, version));`;

vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async (sql, p = []) => { const r = raw.prepare(sql).run(...p); return { lastInsertRowid: r.lastInsertRowid, changes: r.changes }; }),
  queryAll: vi.fn(async (sql, p = []) => raw.prepare(sql).all(...p)),
  queryOne: vi.fn(async (sql, p = []) => raw.prepare(sql).get(...p) ?? null),
}));

const L = await import('../../api/lib/notes/ledger.js');
const DOC = 21308;
const note = (over = {}) => ({ docId: DOC, paraId: 'para_312', paragraphIndex: 312, chapterNum: '3',
  category: 'person', subjectKey: 'entity:1247564', body: 'Mullá Ḥusayn: the first to recognise the Báb.', ...over });

beforeEach(() => { raw = new Database(':memory:'); raw.exec(SCHEMA); });

describe('subject keys are stable', () => {
  it('prefers a resolved entity id — an id cannot drift, a spelling can', () => {
    expect(L.subjectKey({ entityId: 1247564 })).toBe('entity:1247564');
  });
  it('folds diacritics and punctuation so one term is one key', () => {
    expect(L.subjectKey({ term: "Bábu'l-Báb" })).toBe(L.subjectKey({ term: 'Babu l Bab' }));
  });
});

describe('only KEPT notes count as taught', () => {
  it('a pending note does not yet suppress anything', async () => {
    await L.addNote(note());
    expect(await L.taughtAbout(DOC, ['entity:1247564'])).toHaveLength(0);
  });

  it('an accepted note is taught', async () => {
    const id = await L.addNote(note());
    await L.reviewNote(id, { review: 'accepted' });
    const t = await L.taughtAbout(DOC, ['entity:1247564']);
    expect(t).toHaveLength(1);
    expect(t[0].note).toMatch(/first to recognise/);
  });

  it('a REJECTED note never suppresses a later good one — the gap-maker guard', async () => {
    const bad = await L.addNote(note({ body: 'a poor note' }));
    await L.reviewNote(bad, { review: 'rejected' });
    expect(await L.taughtAbout(DOC, ['entity:1247564'])).toHaveLength(0);
  });

  it('an EDITED note is kept, and the human text is what later notes see', async () => {
    const id = await L.addNote(note());
    await L.reviewNote(id, { review: 'edited', editedBody: "Mullá Ḥusayn — the Bábu'l-Báb, first Letter of the Living." });
    const t = await L.taughtAbout(DOC, ['entity:1247564']);
    expect(t[0].note).toMatch(/Letter of the Living/);
  });

  it('keeps the original beside the edit, so the prompt can be judged against what a human kept', async () => {
    const id = await L.addNote(note());
    await L.reviewNote(id, { review: 'edited', editedBody: 'better' });
    const row = raw.prepare('SELECT body, edited_body FROM study_notes WHERE id=?').get(id);
    expect(row.body).toMatch(/first to recognise/);
    expect(row.edited_body).toBe('better');
  });

  it('scopes by book — Chad chose a book-wide ledger', async () => {
    const id = await L.addNote(note());
    await L.reviewNote(id, { review: 'accepted' });
    expect(await L.taughtAbout(21310, ['entity:1247564'])).toHaveLength(0);
  });

  it('rejects an unknown review state rather than storing it', async () => {
    const id = await L.addNote(note());
    await expect(L.reviewNote(id, { review: 'maybe' })).rejects.toThrow(/bad review state/);
  });
});

describe('the fuzzy channel catches the same idea under another label', () => {
  it('finds a kept note by phrase', async () => {
    const id = await L.addNote(note({ body: 'The title means the Gate of the Gate.' }));
    await L.reviewNote(id, { review: 'accepted' });
    expect(await L.similarNotes(DOC, 'Gate of the Gate')).toHaveLength(1);
  });
  it('ignores rejected notes here too', async () => {
    const id = await L.addNote(note({ body: 'The title means the Gate of the Gate.' }));
    await L.reviewNote(id, { review: 'rejected' });
    expect(await L.similarNotes(DOC, 'Gate of the Gate')).toHaveLength(0);
  });
  it('does not fire on a fragment too short to mean anything', async () => {
    expect(await L.similarNotes(DOC, 'th')).toEqual([]);
  });
});

describe('completion is a stamp, not a note count', () => {
  it('a paragraph with NO notes is processed — the common, correct outcome', async () => {
    await L.markParagraphProcessed(DOC, 'para_400', 0);
    expect(await L.isParagraphProcessed(DOC, 'para_400')).toBe(true);
  });

  it('an unprocessed paragraph is not processed', async () => {
    expect(await L.isParagraphProcessed(DOC, 'para_999')).toBe(false);
  });

  it('re-running a paragraph updates rather than duplicates', async () => {
    await L.markParagraphProcessed(DOC, 'para_400', 0);
    await L.markParagraphProcessed(DOC, 'para_400', 2);
    const rows = raw.prepare('SELECT notes_written FROM study_note_pass WHERE doc_id=? AND para_id=?').all(DOC, 'para_400');
    expect(rows).toHaveLength(1);
    expect(rows[0].notes_written).toBe(2);
  });

  it('a version bump makes work outstanding again without losing the old stamp', async () => {
    await L.markParagraphProcessed(DOC, 'para_400', 1, 'notes-v1');
    expect(await L.isParagraphProcessed(DOC, 'para_400', 'notes-v2')).toBe(false);
    expect(await L.isParagraphProcessed(DOC, 'para_400', 'notes-v1')).toBe(true);
  });
});

describe('progress reports the number that matters', () => {
  it('keepRate is null until a human has judged anything — not 0%, which would read as failure', async () => {
    await L.addNote(note());
    expect((await L.noteProgress(DOC)).keepRate).toBeNull();
  });

  it('counts kept over judged, ignoring still-pending notes', async () => {
    const a = await L.addNote(note({ paraId: 'p1' }));
    const b = await L.addNote(note({ paraId: 'p2' }));
    const c = await L.addNote(note({ paraId: 'p3' }));
    await L.addNote(note({ paraId: 'p4' }));                    // pending — must not count
    await L.reviewNote(a, { review: 'accepted' });
    await L.reviewNote(b, { review: 'edited', editedBody: 'x' });
    await L.reviewNote(c, { review: 'rejected' });
    const p = await L.noteProgress(DOC);
    expect(p.keepRate).toBe(67);
    expect(p.pending).toBe(1);
  });
});
