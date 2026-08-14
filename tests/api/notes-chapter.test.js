// The chapter runner: "read the entire chapter first for context, then research it paragraph by paragraph."
// Everything is injected, so the orchestration is tested here with no model call and no database — which is
// how the expensive part (chapter 1 of Dawn-Breakers) gets to be a review of CONTENT rather than a debug
// session about plumbing.
import { describe, it, expect, vi } from 'vitest';
// chapter.js imports the ledger for subjectKey (one owner for the repetition key); the ledger imports db.
// This test exercises ORCHESTRATION only, so the db is stubbed rather than opened.
vi.mock('../../api/lib/db.js', () => ({ query: vi.fn(), queryAll: vi.fn(async () => []), queryOne: vi.fn(async () => null) }));
import { annotateChapter, parseNotes } from '../../api/lib/notes/chapter.js';
import { profile as dawnBreakers } from '../../api/lib/notes/profiles/dawn-breakers.js';

const PROFILE = { ...dawnBreakers, version: 'notes-v1' };
const PARAS = [
  { para_id: 'para_37', paragraph_index: 37, text: 'Mullá Ḥusayn came at last to Shíráz, and there met his Host.', subjects: [{ key: 'entity:1247564' }] },
  { para_id: 'para_38', paragraph_index: 38, text: 'They spoke until dawn.', subjects: [] },
];

const fakeModel = (notesByPara = {}) => ({
  id: 'test-model',
  chapterFrame: vi.fn(async () => 'Chapter 3: Mullá Ḥusayn reaches Shíráz and recognises the Báb.'),
  research: vi.fn(async ({ paragraph }) => JSON.stringify({ notes: notesByPara[paragraph.para_id] || [] })),
});

const fakeLedger = () => {
  const notes = []; const stamps = new Map();
  return {
    notes, stamps,
    taughtAbout: vi.fn(async () => []),
    addNote: vi.fn(async (n) => { notes.push(n); return notes.length; }),
    isParagraphProcessed: vi.fn(async (d, p, v) => stamps.has(`${d}|${p}|${v}`)),
    markParagraphProcessed: vi.fn(async (d, p, n, v) => { stamps.set(`${d}|${p}|${v}`, n); }),
  };
};
const loadChapter = async () => ({ title: 'Chapter 3', paragraphs: PARAS });

describe('the context pass happens once, before any paragraph', () => {
  it('reads the whole chapter and passes the frame to every research call', async () => {
    const model = fakeModel();
    const r = await annotateChapter({ docId: 21308, chapter: '3', profile: PROFILE, deps: { loadChapter, model, ledger: fakeLedger() } });
    expect(model.chapterFrame).toHaveBeenCalledTimes(1);
    expect(model.research).toHaveBeenCalledTimes(2);
    for (const call of model.research.mock.calls) expect(call[0].chapterFrame).toMatch(/Shíráz/);
    expect(r.stats.processed).toBe(2);
  });
});

describe('a paragraph that warrants nothing is PROCESSED, not pending', () => {
  it('stamps an empty paragraph and counts it', async () => {
    const ledger = fakeLedger();
    const r = await annotateChapter({ docId: 21308, chapter: '3', profile: PROFILE, deps: { loadChapter, model: fakeModel(), ledger } });
    expect(r.stats.empty).toBe(2);
    expect(ledger.markParagraphProcessed).toHaveBeenCalledTimes(2);
    expect(await ledger.isParagraphProcessed(21308, 'para_38', 'notes-v1')).toBe(true);
    expect(ledger.addNote).not.toHaveBeenCalled();
  });
});

describe('resume is free', () => {
  it('skips paragraphs already stamped at this version', async () => {
    const ledger = fakeLedger();
    ledger.stamps.set('21308|para_37|notes-v1', 0);
    const model = fakeModel();
    const r = await annotateChapter({ docId: 21308, chapter: '3', profile: PROFILE, deps: { loadChapter, model, ledger } });
    expect(r.stats.skipped).toBe(1);
    expect(model.research).toHaveBeenCalledTimes(1);          // the skipped ¶ costs nothing
  });

  it('a version bump makes the work outstanding again', async () => {
    const ledger = fakeLedger();
    ledger.stamps.set('21308|para_37|notes-v1', 0);
    const model = fakeModel();
    await annotateChapter({ docId: 21308, chapter: '3', profile: { ...PROFILE, version: 'notes-v2' }, deps: { loadChapter, model, ledger } });
    expect(model.research).toHaveBeenCalledTimes(2);
  });
});

describe('the gates run, and nothing disappears silently', () => {
  it('keeps a good note and records it as pending — nothing is taught until a human keeps it', async () => {
    const ledger = fakeLedger();
    const model = fakeModel({ para_37: [{ category: 'name', subject: "Bábu'l-Báb", body: "The title means 'the Gate of the Gate'." }] });
    const r = await annotateChapter({ docId: 21308, chapter: '3', profile: PROFILE, deps: { loadChapter, model, ledger } });
    expect(r.stats.kept).toBe(1);
    expect(ledger.addNote).toHaveBeenCalledTimes(1);
    expect(ledger.notes[0].subjectKey).toBe('term:babu-l-bab');
  });

  it('drops a note that restates the paragraph, WITH a reason', async () => {
    const model = fakeModel({ para_37: [{ category: 'person', subject: 'x', body: 'Mullá Ḥusayn came at last to Shíráz, and there met his Host.' }] });
    const r = await annotateChapter({ docId: 21308, chapter: '3', profile: PROFILE, deps: { loadChapter, model, ledger: fakeLedger() } });
    expect(r.stats.dropped).toBe(1);
    expect(r.results[0].dropped[0]._judge.reason).toMatch(/restates the paragraph/);
  });

  it('HOLDS an unsourced fact and still records it, so it can be chased', async () => {
    const ledger = fakeLedger();
    const model = fakeModel({ para_37: [{ category: 'detail', subject: 'y', body: 'The house was demolished in 1979.', claimKind: 'fact' }] });
    const r = await annotateChapter({ docId: 21308, chapter: '3', profile: PROFILE, deps: { loadChapter, model, ledger } });
    expect(r.stats.held).toBe(1);
    expect(ledger.addNote).toHaveBeenCalledTimes(1);           // held ≠ discarded
  });
});

describe('dryRun judges without touching the ledger', () => {
  it('runs the model and the gates but writes nothing', async () => {
    const ledger = fakeLedger();
    const model = fakeModel({ para_37: [{ category: 'name', subject: 'z', body: 'A useful gloss on a title.' }] });
    const r = await annotateChapter({ docId: 21308, chapter: '3', profile: PROFILE, deps: { loadChapter, model, ledger }, dryRun: true });
    expect(r.stats.kept).toBe(1);
    expect(ledger.addNote).not.toHaveBeenCalled();
    expect(ledger.markParagraphProcessed).not.toHaveBeenCalled();
  });
});

describe('a bad model response cannot abort a chapter', () => {
  it('treats unparseable output as no notes and keeps going', async () => {
    expect(parseNotes('the model rambled')).toEqual([]);
    expect(parseNotes('{"notes":[{"category":"name","body":"ok"}]}')).toHaveLength(1);
    const model = { id: 'm', chapterFrame: async () => 'frame', research: async () => 'not json at all' };
    const r = await annotateChapter({ docId: 21308, chapter: '3', profile: PROFILE, deps: { loadChapter, model, ledger: fakeLedger() } });
    expect(r.stats.processed).toBe(2);
    expect(r.stats.empty).toBe(2);
  });
});
