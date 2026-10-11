// deep-research-repo — the ONE data interface for deep research. In-memory better-sqlite3 routed through
// a mocked db.js (pattern: tests/api/notes-ledger.test.js) so these tests exercise real SQL, not a stand-in.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';

let raw;
const SCHEMA = `
CREATE TABLE deep_research (
  id INTEGER PRIMARY KEY AUTOINCREMENT, canonical_question TEXT NOT NULL, question_embedding BLOB,
  question_hash TEXT NOT NULL UNIQUE, status TEXT NOT NULL DEFAULT 'pending', priority INTEGER NOT NULL DEFAULT 5,
  topic_tags TEXT, question_type TEXT, traditions_covered TEXT, angles_json TEXT, total_candidates INTEGER DEFAULT 0,
  total_selected INTEGER DEFAULT 0, research_model TEXT, rerank_model TEXT, ask_count INTEGER DEFAULT 0,
  last_asked_at TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, completed_at TEXT, reviewed_at TEXT,
  reviewed_by TEXT, worker_id TEXT, heartbeat_at TEXT, error TEXT, slug TEXT, sections_json TEXT,
  summary_json TEXT, convergence_json TEXT, qa_json TEXT, assessment_json TEXT, hero_image TEXT, hero_prompt TEXT,
  llm_input_tokens INTEGER, llm_output_tokens INTEGER, llm_cost_usd REAL, cost_breakdown_json TEXT, started_at TEXT);
CREATE TABLE deep_research_quotes (
  id INTEGER PRIMARY KEY AUTOINCREMENT, research_id INTEGER NOT NULL, para_id INTEGER NOT NULL,
  tradition TEXT, authority INTEGER, relevance_score REAL, contextual_note TEXT, rank INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP);
CREATE TABLE deep_research_queue (
  id INTEGER PRIMARY KEY AUTOINCREMENT, research_id INTEGER NOT NULL, job_type TEXT NOT NULL DEFAULT 'research',
  status TEXT NOT NULL DEFAULT 'pending', attempts INTEGER DEFAULT 0, priority INTEGER NOT NULL DEFAULT 5,
  payload TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP, started_at TEXT, completed_at TEXT, error TEXT);
CREATE TABLE deep_research_notify (
  id INTEGER PRIMARY KEY AUTOINCREMENT, research_id INTEGER NOT NULL, email TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP, notified_at TEXT);
CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, author TEXT, religion TEXT, source_site TEXT, source_url TEXT);
CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, text TEXT, heading TEXT, external_para_id TEXT);
`;

vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async (sql, p = []) => { const r = raw.prepare(sql).run(...p); return { rows: [{ lastInsertRowid: r.lastInsertRowid, changes: r.changes }], lastInsertRowid: r.lastInsertRowid }; }),
  queryAll: vi.fn(async (sql, p = []) => raw.prepare(sql).all(...p)),
  queryOne: vi.fn(async (sql, p = []) => raw.prepare(sql).get(...p) ?? null),
}));

const repo = await import('../../api/lib/repos/deep-research-repo.js');

beforeEach(() => { raw = new Database(':memory:'); raw.exec(SCHEMA); });

describe('deep_research create / find by hash', () => {
  it('creates a pending record and finds it by question_hash', async () => {
    const result = await repo.createPendingResearch({ question: 'Why suffering?', embedBuf: Buffer.from([1, 2]), hash: 'abc123', slug: 'why-suffering', now: '2026-10-11T00:00:00Z' });
    expect(result.lastInsertRowid).toBeGreaterThan(0);
    const found = await repo.findByQuestionHash('abc123');
    expect(found).toMatchObject({ canonical_question: 'Why suffering?', status: 'pending', ask_count: 1, slug: 'why-suffering' });
  });

  it('findCompleteByHash only matches status=complete', async () => {
    await repo.createPendingResearch({ question: 'Q', embedBuf: null, hash: 'h1', slug: 's1', now: 'now' });
    expect(await repo.findCompleteByHash('h1')).toBeNull();
    raw.prepare("UPDATE deep_research SET status = 'complete' WHERE question_hash = ?").run('h1');
    expect(await repo.findCompleteByHash('h1')).toMatchObject({ question_hash: 'h1', status: 'complete' });
  });
});

describe('getResearchById', () => {
  it('returns the full row by id', async () => {
    const { lastInsertRowid } = await repo.createPendingResearch({ question: 'Q2', embedBuf: null, hash: 'h2', slug: 's2', now: 'now' });
    const row = await repo.getResearchById(lastInsertRowid);
    expect(row).toMatchObject({ id: lastInsertRowid, canonical_question: 'Q2' });
  });

  it('returns null for a missing id', async () => {
    expect(await repo.getResearchById(999)).toBeNull();
  });
});

describe('deep_research_quotes — replaceQuotes', () => {
  it('replaces the full curated set for a research record in one call', async () => {
    const { lastInsertRowid: researchId } = await repo.createPendingResearch({ question: 'Q3', embedBuf: null, hash: 'h3', slug: 's3', now: 'now' });
    raw.prepare('INSERT INTO docs (id, title, author, religion, source_site, source_url) VALUES (1, \'Gleanings\', \'Baha’u’llah\', \'Baha’i\', null, null)').run();
    raw.prepare("INSERT INTO content (id, doc_id, text, heading) VALUES (10, 1, 'first passage', 'h')").run();
    raw.prepare("INSERT INTO content (id, doc_id, text, heading) VALUES (11, 1, 'second passage', 'h')").run();

    await repo.replaceQuotes(researchId, [
      { para_id: 10, tradition: "Baha'i", authority: 9, relevance_score: 8, contextual_note: 'note1', rank: 0 },
    ]);
    let quotes = await repo.listQuotes(researchId);
    expect(quotes).toHaveLength(1);
    expect(quotes[0]).toMatchObject({ para_id: 10, text: 'first passage', title: 'Gleanings' });

    // Calling again fully replaces the prior set rather than appending to it.
    await repo.replaceQuotes(researchId, [
      { para_id: 11, tradition: "Baha'i", authority: 9, relevance_score: 7, contextual_note: 'note2', rank: 0 },
    ]);
    quotes = await repo.listQuotes(researchId);
    expect(quotes).toHaveLength(1);
    expect(quotes[0].para_id).toBe(11);
  });

  it('findExistingContentIds filters out para_ids that are not in content', async () => {
    raw.prepare("INSERT INTO content (id, doc_id, text) VALUES (1, 1, 't')").run();
    const ids = await repo.findExistingContentIds([1, 2, 3]);
    expect(ids).toEqual([1]);
  });

  it('appendQuote inserts without clobbering an existing row for the same para_id (INSERT OR IGNORE)', async () => {
    const { lastInsertRowid: researchId } = await repo.createPendingResearch({ question: 'Q4', embedBuf: null, hash: 'h4', slug: 's4', now: 'now' });
    raw.prepare("INSERT INTO docs (id, title) VALUES (1, 'D')").run();
    raw.prepare("INSERT INTO content (id, doc_id, text) VALUES (20, 1, 'p')").run();
    await repo.appendQuote(researchId, { para_id: 20, tradition: 'Islam', authority: 8, relevance_score: 7, contextual_note: 'n', rank: 1 });
    const rows = raw.prepare('SELECT COUNT(*) n FROM deep_research_quotes WHERE research_id = ?').get(researchId);
    expect(rows.n).toBe(1);
  });
});

describe('deep_research_notify — markNotified', () => {
  it('addNotify then getPendingNotifications sees it as pending', async () => {
    const { lastInsertRowid: researchId } = await repo.createPendingResearch({ question: 'Q5', embedBuf: null, hash: 'h5', slug: 's5', now: 'now' });
    await repo.addNotify(researchId, '  Chad@Example.com  ');
    const pending = await repo.getPendingNotifications(researchId);
    expect(pending).toHaveLength(1);
    expect(pending[0].email).toBe('chad@example.com'); // trimmed + lowercased
  });

  it('markNotified clears notified_at IS NULL for the given ids', async () => {
    const { lastInsertRowid: researchId } = await repo.createPendingResearch({ question: 'Q6', embedBuf: null, hash: 'h6', slug: 's6', now: 'now' });
    await repo.addNotify(researchId, 'a@example.com');
    await repo.addNotify(researchId, 'b@example.com');
    const pending = await repo.getPendingNotifications(researchId);
    await repo.markNotified(pending.map(p => p.id));
    expect(await repo.getPendingNotifications(researchId)).toHaveLength(0);
  });
});

describe('deep_research_queue', () => {
  it('claimQueueTask claims a pending task and reports success', async () => {
    const { lastInsertRowid: researchId } = await repo.createPendingResearch({ question: 'Q7', embedBuf: null, hash: 'h7', slug: 's7', now: 'now' });
    await repo.autoQueueResearch(researchId, 3);
    const row = raw.prepare('SELECT id FROM deep_research_queue WHERE research_id = ?').get(researchId);
    expect(await repo.claimQueueTask(row.id)).toBe(true);
    expect(await repo.claimQueueTask(row.id)).toBe(false); // no longer pending — second claim fails
  });

  it('finishQueueTask marks complete or failed based on the error arg', async () => {
    const { lastInsertRowid: researchId } = await repo.createPendingResearch({ question: 'Q8', embedBuf: null, hash: 'h8', slug: 's8', now: 'now' });
    await repo.autoQueueResearch(researchId, 1);
    const row = raw.prepare('SELECT id FROM deep_research_queue WHERE research_id = ?').get(researchId);
    await repo.finishQueueTask(row.id);
    expect(raw.prepare('SELECT status FROM deep_research_queue WHERE id = ?').get(row.id).status).toBe('complete');
  });

  it('getPendingResearchTasks orders by priority DESC, created_at ASC', async () => {
    const { lastInsertRowid: r1 } = await repo.createPendingResearch({ question: 'Low', embedBuf: null, hash: 'hlow', slug: 'slow', now: 'now' });
    const { lastInsertRowid: r2 } = await repo.createPendingResearch({ question: 'High', embedBuf: null, hash: 'hhigh', slug: 'shigh', now: 'now' });
    await repo.autoQueueResearch(r1, 1);
    await repo.autoQueueResearch(r2, 9);
    const tasks = await repo.getPendingResearchTasks(10);
    expect(tasks[0].research_id).toBe(r2);
  });
});

describe('heartbeat / startResearch / completeResearch / failResearch', () => {
  it('startResearch marks in_progress and heartbeat stamps a fresh timestamp', async () => {
    const { lastInsertRowid: researchId } = await repo.createPendingResearch({ question: 'Q9', embedBuf: null, hash: 'h9', slug: 's9', now: 'now' });
    await repo.startResearch(researchId, 'worker-1', '2026-10-11T00:00:00Z');
    expect((await repo.getResearchById(researchId)).status).toBe('in_progress');
    await repo.heartbeat(researchId);
    expect((await repo.getResearchById(researchId)).heartbeat_at).toBeTruthy();
  });

  it('failResearch marks failed with the error message', async () => {
    const { lastInsertRowid: researchId } = await repo.createPendingResearch({ question: 'Q10', embedBuf: null, hash: 'h10', slug: 's10', now: 'now' });
    await repo.failResearch(researchId, 'boom');
    expect(await repo.getResearchById(researchId)).toMatchObject({ status: 'failed', error: 'boom' });
  });

  it('completeResearch stamps every field from the data object', async () => {
    const { lastInsertRowid: researchId } = await repo.createPendingResearch({ question: 'Q11', embedBuf: null, hash: 'h11', slug: 's11', now: 'now' });
    await repo.completeResearch(researchId, {
      totalSelected: 5, traditionsCovered: "Baha'i,Islam", sectionsJson: '[]', summaryJson: '{}', convergenceJson: '{}',
      inputTokens: 100, outputTokens: 200, costUsd: 0.5, costBreakdownJson: '{}', assessmentJson: '{}',
    });
    expect(await repo.getResearchById(researchId)).toMatchObject({ status: 'complete', total_selected: 5, traditions_covered: "Baha'i,Islam", llm_cost_usd: 0.5 });
  });
});
