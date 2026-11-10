// hype-seed-repo over real SQLite: merge semantics (dedupe, ceiling 40, stamp kept / 'linked:'), provenance rows, judged pairs, reapply after a regeneration.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

let raw;
vi.mock('../../api/lib/db.js', () => ({
  queryAll: vi.fn(async (sql, p = []) => raw.prepare(sql).all(...p)),
  transaction: vi.fn(async (stmts) => { raw.transaction(() => { for (const s of stmts) raw.prepare(s.sql).run(...(s.args || [])); })(); }),
}));
const repo = await import('../../api/lib/repos/hype-seed-repo.js');
const V = 'hype-v15-seeker';
beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(`CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, hyp_questions TEXT, hyp_model TEXT, enhanced_synced INTEGER, updated_at TEXT, deleted_at TEXT);
    CREATE TABLE hype_bank_seeds (id INTEGER PRIMARY KEY AUTOINCREMENT, tradition TEXT NOT NULL, bank_id TEXT NOT NULL, question TEXT NOT NULL, para_id INTEGER NOT NULL,
      doc_id INTEGER NOT NULL, version TEXT NOT NULL, verdict TEXT NOT NULL, why TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE UNIQUE INDEX idx_pair ON hype_bank_seeds(bank_id, para_id, version);`);
  raw.prepare('INSERT INTO content (id, doc_id, hyp_questions, hyp_model, enhanced_synced) VALUES (?,?,?,?,1)').run(1, 7, '["What is the soul?"]', V);
  raw.prepare('INSERT INTO content (id, doc_id, hyp_questions, hyp_model, enhanced_synced) VALUES (?,?,?,?,1)').run(2, 7, null, null);
});
const get = (id) => raw.prepare('SELECT * FROM content WHERE id = ?').get(id);

describe('hype-seed-repo', () => {
  it('mergeQuestions: dedupe by folded text, ceiling 40, stamp kept or linked:', () => {
    expect(repo.mergeQuestions('["What is the soul?"]', V, ['what is the SOUL', 'Who was the Báb?'], V)).toEqual({ questions: ['What is the soul?', 'Who was the Báb?'], stamp: V });
    expect(repo.mergeQuestions(null, null, ['Q?'], V)).toEqual({ questions: ['Q?'], stamp: `linked:${V}` });
    expect(repo.mergeQuestions('["Q?"]', V, ['q'], V)).toBeNull();
    expect(repo.mergeQuestions(JSON.stringify(Array.from({ length: 40 }, (_, i) => `q${i}`)), V, ['new'], V)).toBeNull();
  });
  it('saveBankSeeds merges seeded questions, records every verdict, marks the row for re-sync; judgedPairs sees both verdicts', async () => {
    const r = await repo.saveBankSeeds([
      { bankId: 'bahai-001', question: 'Who was the Báb?', paraId: 1, docId: 7, verdict: 'seeded' },
      { bankId: 'bahai-002', question: 'What is prayer?', paraId: 2, docId: 7, verdict: 'seeded' },
      { bankId: 'bahai-003', question: 'What is fasting?', paraId: 2, docId: 7, verdict: 'rejected', why: 'not about fasting' },
    ], { tradition: 'bahai', version: V });
    expect(r).toEqual({ merged: 2, recorded: 3 });
    expect(JSON.parse(get(1).hyp_questions)).toEqual(['What is the soul?', 'Who was the Báb?']);
    expect(get(1)).toMatchObject({ hyp_model: V, enhanced_synced: 0 });
    expect(JSON.parse(get(2).hyp_questions)).toEqual(['What is prayer?']);
    expect(get(2).hyp_model).toBe(`linked:${V}`);   // not hyped yet: its own HyPE run still happens
    expect([...await repo.judgedPairs('bahai', V)].sort()).toEqual(['bahai-001|1', 'bahai-002|2', 'bahai-003|2']);
    expect((await repo.judgedPairs('bahai', 'other')).size).toBe(0);
    const c = await repo.seedCounts();
    expect(c.find((x) => x.verdict === 'seeded')).toMatchObject({ tradition: 'bahai', n: 2, paragraphs: 2 });
  });
  it('reapplySeeds puts seeded questions back after a regeneration replaced them (free), not rejected ones', async () => {
    await repo.saveBankSeeds([{ bankId: 'bahai-001', question: 'Who was the Báb?', paraId: 1, docId: 7, verdict: 'seeded' },
      { bankId: 'bahai-003', question: 'What is fasting?', paraId: 1, docId: 7, verdict: 'rejected' }], { tradition: 'bahai', version: V });
    raw.prepare("UPDATE content SET hyp_questions = '[\"A new question?\"]' WHERE id = 1").run();
    const r = await repo.reapplySeeds('bahai', V);
    expect(r).toEqual({ paragraphs: 1, merged: 1, docIds: [7] });
    expect(JSON.parse(get(1).hyp_questions)).toEqual(['A new question?', 'Who was the Báb?']);
    expect((await repo.reapplySeeds('bahai', V)).merged).toBe(0);   // idempotent
  });
});
