// Implied-question index: question flattening, ingest rows, premise-repo over real SQLite, the ingest job, indexer wiring.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import { flattenQuestions } from '../../api/lib/premise-questions.js';
import { indexerArgs } from '../../api/lib/ops/phrase-index-job.js';
import { premiseIngestJob } from '../../api/lib/pipeline/premise-ingest.js';

let raw;
vi.mock('../../api/lib/db.js', () => ({
  queryAll: vi.fn(async (sql, p = []) => raw.prepare(sql).all(...p)),
  transaction: vi.fn(async (stmts) => { raw.transaction(() => { for (const s of stmts) raw.prepare(s.sql).run(...(s.args || [])); })(); }),
}));
const repo = await import('../../api/lib/repos/premise-repo.js');
beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(`CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, external_para_id TEXT);
    CREATE TABLE premise_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id INTEGER NOT NULL, para_id INTEGER NOT NULL, external_para_id TEXT,
      premise TEXT NOT NULL, implies TEXT, questions_json TEXT NOT NULL DEFAULT '[]', proof TEXT, concept TEXT, basis TEXT, verdict TEXT, run_file TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);`);
  raw.prepare('INSERT INTO content (id, doc_id, external_para_id) VALUES (?,?,?)').run(21, 7, 'a21');
  raw.prepare('INSERT INTO content (id, doc_id, external_para_id) VALUES (?,?,?)').run(22, 7, null);
});
const E = (o) => ({ docId: 7, paraId: 21, premise: 'The unborn child inherits.', implies: 'moral status of the unborn', questions: ['Do the unborn have rights?', 'Do rights come from the state?'], proof: 'as yet unborn', concept: 'source of rights', basis: 'implicit', verdict: 'keep', ...o });

describe('flattenQuestions', () => {
  it('orders rows, dedupes by folded text, accepts JSON strings or arrays, skips junk', () => {
    expect(flattenQuestions(['["Do the unborn have rights?","B?"]', ['do the UNBORN have rights', 'C?'], 'not json', [3, '  ']])).toEqual(['Do the unborn have rights?', 'B?', 'C?']);
    expect(flattenQuestions()).toEqual([]);
  });
});

describe('premise-repo', () => {
  it('premiseRows: keep/rescope/move stored (rescope = newPremise, move = movedTo); drop/skipped/unjudged/empty excluded; max 3 questions', () => {
    const rows = repo.premiseRows([E(), E({ verdict: 'rescope', newPremise: 'Narrower.' }), E({ verdict: 'move', movedTo: 'the family and inheritance' }),
      E({ verdict: 'drop' }), E({ verdict: 'skipped' }), E({ verdict: 'unjudged' }), E({ paraId: 0 }), E({ questions: ['a?', 'b?', 'c?', 'd?'] })]);
    expect(rows.map((r) => [r.verdict, r.premise, r.concept])).toEqual([['keep', 'The unborn child inherits.', 'source of rights'], ['rescope', 'Narrower.', 'source of rights'],
      ['move', 'The unborn child inherits.', 'the family and inheritance'], ['keep', 'The unborn child inherits.', 'source of rights']]);
    expect(rows[3].questions).toEqual(['a?', 'b?', 'c?']);
  });
  it('replacePremises is idempotent per paragraph, drops a paragraph whose entries were all dropped, stamps the external para id', async () => {
    const rows = repo.premiseRows([E(), E({ paraId: 22, verdict: 'keep', questions: ['Q22?'] })]);
    expect(await repo.replacePremises(rows, [21, 22], 'f.json')).toEqual({ paragraphs: 2, rows: 2 });
    await repo.replacePremises(rows, [21, 22], 'f.json');
    expect(raw.prepare('SELECT COUNT(*) n FROM premise_claims').get().n).toBe(2);
    expect(raw.prepare('SELECT external_para_id e FROM premise_claims WHERE para_id IN (21, 22) ORDER BY para_id').all().map((r) => r.e)).toEqual(['a21', 'p22']);
    await repo.replacePremises([], [22]);   // re-judged: all dropped
    expect(raw.prepare('SELECT para_id FROM premise_claims').all()).toEqual([{ para_id: 21 }]);
  });
  it('impliedFor: a hit k → the question at that position and the premise/implies of the row that carries it', async () => {
    await repo.replacePremises(repo.premiseRows([E(), E({ premise: 'Second premise.', implies: 'other debate', questions: ['Third question?'] })]), [21]);
    const m = await repo.impliedFor([{ paragraph_id: 21, k: 2 }, { paragraph_id: 99, k: 0 }]);
    expect(m.get(21)).toEqual({ question: 'Third question?', premise: 'Second premise.', implies: 'other debate', proof: 'as yet unborn' });
    expect(m.has(99)).toBe(false);
    expect((await repo.impliedFor([{ paragraph_id: 21, k: 0 }])).get(21)).toMatchObject({ question: 'Do the unborn have rights?', premise: 'The unborn child inherits.' });
    expect((await repo.impliedFor([])).size).toBe(0);
  });
});

describe('premise-ingest job', () => {
  const src = { entries: [E(), E({ verdict: 'drop', paraId: 22 }), E({ verdict: 'unjudged', paraId: 23 })] };
  it('dry run reports the plan and writes nothing', async () => {
    const r = await premiseIngestJob({ dry: true }, { latest: () => 'premise-reconcile-x.json', read: () => src, repo });
    expect(r).toMatchObject({ dryRun: true, file: 'premise-reconcile-x.json', entries: 3, rows: 1, paragraphs: 3, questions: 2, docs: [7], byVerdict: { keep: 1 } });
    expect(raw.prepare('SELECT COUNT(*) n FROM premise_claims').get().n).toBe(0);
  });
  it('writes the kept rows, replacing every judged paragraph; errors name the missing input', async () => {
    const r = await premiseIngestJob({ file: '/x/premise-reconcile-y.json' }, { read: () => src, repo });
    expect(r).toMatchObject({ status: 'complete', file: 'premise-reconcile-y.json', rows: 1 });
    expect(raw.prepare('SELECT run_file r FROM premise_claims').get().r).toBe('premise-reconcile-y.json');
    expect((await premiseIngestJob({}, { latest: () => null })).status).toBe('error');
    expect((await premiseIngestJob({ file: 'a.json' }, { read: () => ({ premises: [] }) })).error).toMatch(/no reconcile entries/);
  });
});

describe('indexer wiring', () => {
  it('field premises → its own store + collection', () => {
    const a = indexerArgs({ docs: [21307], field: 'premises', maxUsd: 1 });
    expect(a.slice(a.indexOf('--field'), a.indexOf('--field') + 6)).toEqual(['--field', 'premises', '--store', '/tank/sifter/premise-vectors/vectors.db', '--collection', 'premises']);
  });
});

describe('indexer --field premises (scan-only on a temp db: no network, no spend)', () => {
  it('each implied question is a unit (flattened + deduped across a paragraph\'s rows); paragraphs without rows are not read', async () => {
    const { execFileSync } = await import('node:child_process');
    const { mkdtempSync } = await import('node:fs');
    const { tmpdir } = await import('node:os');
    const { join } = await import('node:path');
    const dir = mkdtempSync(join(tmpdir(), 'premise-idx-')), db = join(dir, 'c.db');
    const d = new Database(db);
    d.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, deleted_at TEXT, duplicate_of INTEGER, source_site TEXT, title TEXT, language TEXT, author TEXT, religion TEXT, collection TEXT, scope TEXT);
      CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, text TEXT, authors TEXT, external_para_id TEXT, deleted_at TEXT, is_duplicate INTEGER, original_text TEXT);
      CREATE TABLE premise_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id INTEGER, para_id INTEGER, questions_json TEXT);
      INSERT INTO docs (id, title, language, author, religion, scope) VALUES (7, 'Aqdas', 'en', 'Bahá’u’lláh', 'Baha''i', 'primary');
      INSERT INTO content (id, doc_id, text) VALUES (21, 7, 'Ye are the unborn'), (22, 7, 'No premises here');
      INSERT INTO premise_claims (doc_id, para_id, questions_json) VALUES (7, 21, '["Do the unborn have rights?","B?"]'), (7, 21, '["b?","C?"]');`);
    d.close();
    const out = execFileSync(process.execPath, ['scripts/phrase-index/indexer.mjs', '--field', 'premises', '--docs', '7', '--scan-only', '--db', db, '--store', join(dir, 'v.db'), '--ledger', join(dir, 'l.db')], { cwd: process.cwd(), encoding: 'utf8' });
    const scan = JSON.parse(out.trim().split('\n').pop());
    expect(scan).toMatchObject({ phase: 'scan', paragraphs: 1, units: 3, to_embed: 3 });
  });
});
