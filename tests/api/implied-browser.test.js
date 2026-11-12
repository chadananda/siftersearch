// Implication browser backend over real in-memory SQLite: repo (one-transaction writes, ids kept, edits log), service (hydrate, graph, propose mocked, import), routes, report job. No LLM, no network.
import { describe, it, expect, beforeEach, vi } from 'vitest';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let raw;
vi.mock('../../api/lib/db.js', () => ({
  queryAll: vi.fn(async (sql, p = []) => raw.prepare(sql).all(...p)),
  queryOne: vi.fn(async (sql, p = []) => raw.prepare(sql).get(...p) ?? null),
  query: vi.fn(async (sql, p = []) => raw.prepare(sql).run(...p)),
  transaction: vi.fn(async (stmts) => { raw.transaction(() => { for (const s of stmts) raw.prepare(s.sql).run(...(s.args || [])); })(); }),
}));
vi.mock('../../api/lib/auth.js', () => ({ requireAdmin: async (req) => { req.user = { sub: 1, email: 'chad@test', tier: 'admin' }; } }));
const repo = await import('../../api/lib/repos/implied-repo.js');
const S = await import('../../api/lib/implied/service.js');
const { default: routes } = await import('../../api/routes/implied-admin.js');
const { impliedOverviewJob } = await import('../../api/lib/ops/implied-overview-job.js');
const { default: Fastify } = await import('fastify');

const TEXT = 'The soul of man is a sign of God and it is immortal beyond the death of the body.';
const item = (q, extra = {}) => ({ q, premise: 'The soul survives death', implies: 'Death is not annihilation of the person', proof: 'it is immortal beyond the death', concept: 'immortality-of-the-soul', ...extra });
beforeEach(() => {
  raw = new Database(':memory:');
  raw.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, author TEXT, religion TEXT, collection TEXT, slug TEXT);
    CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, external_para_id TEXT, paragraph_index INTEGER, text TEXT, original_text TEXT, hyp_questions TEXT, hyp_thesis TEXT, hyp_model TEXT, enhanced_synced INTEGER, updated_at TEXT, deleted_at TEXT);
    CREATE TABLE premise_claims (id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id INTEGER NOT NULL, para_id INTEGER NOT NULL, external_para_id TEXT, premise TEXT NOT NULL, implies TEXT, questions_json TEXT NOT NULL DEFAULT '[]', proof TEXT, concept TEXT, basis TEXT, verdict TEXT, run_file TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      question TEXT, status TEXT DEFAULT 'unreviewed', source TEXT, model TEXT, k INTEGER, updated_at TEXT, editor TEXT, note TEXT);
    CREATE TABLE implied_edits (id INTEGER PRIMARY KEY AUTOINCREMENT, claim_id INTEGER, para_id INTEGER, action TEXT NOT NULL, before_json TEXT, after_json TEXT, note TEXT, editor TEXT, at TEXT);`);
  raw.prepare(`INSERT INTO docs VALUES (7, 'Some Questioned Answers', 'Abdu''l-Baha', 'Baha''i', 'Core', 'saq')`).run();
  raw.prepare(`INSERT INTO content (id, doc_id, paragraph_index, text, hyp_questions) VALUES (1, 7, 3, ?, ?)`).run(TEXT, JSON.stringify(['What is the soul?']));
  raw.prepare(`INSERT INTO content (id, doc_id, paragraph_index, text, hyp_questions) VALUES (2, 7, 4, 'Another paragraph about nothing in particular here.', NULL)`).run();
});
const hyp = (id) => JSON.parse(raw.prepare('SELECT hyp_questions FROM content WHERE id = ?').get(id).hyp_questions);

describe('implied-repo', () => {
  it('saveImplied: live rows land in hyp_questions after the stated, k from 900, premise_claims in step, edits logged', async () => {
    const r = await repo.saveImplied(1, [item('Does death end the person?'), item('Is the soul eternal?')], { model: 'm' });
    expect(r).toMatchObject({ reindex: true, docId: 7 });
    const h = hyp(1);
    expect(h[0]).toBe('What is the soul?');
    expect(h.slice(1).map((x) => x.q)).toEqual(['Does death end the person?', 'Is the soul eternal?']);
    expect(h[1]).toMatchObject({ implied: true, concept: 'immortality-of-the-soul' });
    const rows = raw.prepare('SELECT * FROM premise_claims ORDER BY id').all();
    expect(rows.map((x) => [x.status, x.k, x.source])).toEqual([['unreviewed', 900, 'hype'], ['unreviewed', 901, 'hype']]);
  });
  it('saveImplied again keeps ids and status of a held question; unchanged payload needs no reindex', async () => {
    await repo.saveImplied(1, [item('Does death end the person?')]);
    const id = raw.prepare('SELECT id FROM premise_claims').get().id;
    await repo.patchImplied(id, { status: 'approved' });
    const r = await repo.saveImplied(1, [item('Does death end the person?')]);
    expect(raw.prepare('SELECT id, status FROM premise_claims').get()).toEqual({ id, status: 'approved' });
    expect(r.reindex).toBe(false);
  });
  it('patch: text edit marks edited; reject removes it from hyp_questions but keeps the row; log has before/after', async () => {
    await repo.saveImplied(1, [item('Does death end the person?'), item('Is the soul eternal?')]);
    const [a, b] = raw.prepare('SELECT id FROM premise_claims ORDER BY id').all().map((x) => x.id);
    const p = await repo.patchImplied(a, { question: 'Does death end the self?' }, { editor: 'chad' });
    expect(p.item.status).toBe('edited');
    const d = await repo.patchImplied(b, { status: 'rejected' });
    expect(d.reindex).toBe(true);
    expect(hyp(1).filter((x) => x.implied).map((x) => x.q)).toEqual(['Does death end the self?']);
    expect(raw.prepare('SELECT status, k FROM premise_claims WHERE id = ?').get(b)).toEqual({ status: 'rejected', k: null });
    const edits = raw.prepare('SELECT action, editor FROM implied_edits ORDER BY id').all();
    expect(edits.map((e) => e.action)).toContain('edit');
    expect(edits.map((e) => e.action)).toContain('status:rejected');
    expect(JSON.parse(raw.prepare('SELECT before_json FROM implied_edits WHERE claim_id = ? ORDER BY id LIMIT 1').get(a).before_json).question).toBe('Does death end the person?');
  });
  it('create rejects a duplicate live question (409); hard delete removes the row and the indexed copy', async () => {
    const c = await repo.createImplied(1, { question: 'Is the soul eternal?', premise: 'p', implies: 'i', proof: 'it is immortal beyond the death' });
    expect(c.item).toMatchObject({ status: 'approved', source: 'manual' });
    await expect(repo.createImplied(1, { question: 'is the SOUL eternal', premise: 'p', implies: 'i' })).rejects.toMatchObject({ statusCode: 409 });
    await repo.deleteImplied(c.item.id);
    expect(raw.prepare('SELECT COUNT(*) n FROM premise_claims').get().n).toBe(0);
    expect(hyp(1)).toEqual(['What is the soul?']);
  });
  it('proposed rows are browsable but never indexed; bulkStatus approves them into hyp_questions', async () => {
    const c = await repo.createImplied(1, { question: 'Is the soul eternal?', premise: 'p', implies: 'i', status: 'proposed', source: 'hype-propose' });
    expect(hyp(1)).toEqual(['What is the soul?']);
    const r = await repo.bulkStatus([c.item.id], 'approved');
    expect(r).toMatchObject({ updated: 1, docIds: [7] });
    expect(hyp(1).filter((x) => x.implied)).toHaveLength(1);
    await expect(repo.bulkStatus([c.item.id], 'bogus')).rejects.toMatchObject({ statusCode: 400 });
  });
  it('saveStated replaces stated items, leaves implied untouched', async () => {
    await repo.saveImplied(1, [item('Is the soul eternal?')]);
    await repo.saveStated(1, { stated: [{ q: 'What happens at death?', a: 'x' }], thesis: 'T' });
    const h = hyp(1);
    expect(h[0]).toMatchObject({ q: 'What happens at death?' });
    expect(h[1]).toMatchObject({ implied: true });
    expect(raw.prepare('SELECT hyp_thesis FROM content WHERE id = 1').get().hyp_thesis).toBe('T');
  });
  it('listImplied filters and pages', async () => {
    await repo.saveImplied(1, [item('Does death end the person?'), item('Is the soul eternal?', { concept: 'other' })]);
    expect((await repo.listImplied({ concept: 'other' })).rows).toHaveLength(1);
    expect((await repo.listImplied({ limit: 1 })).next).toBeTruthy();
    expect((await repo.listImplied({ text: 'eternal' })).rows).toHaveLength(1);
  });
});

describe('implied service', () => {
  it('shapeItem carries doc and a reader link; itemDetail adds paragraph + edits', async () => {
    await repo.saveImplied(1, [item('Is the soul eternal?')]);
    const id = raw.prepare('SELECT id FROM premise_claims').get().id;
    const d = await S.itemDetail(id);
    expect(d).toMatchObject({ question: 'Is the soul eternal?', doc: { title: 'Some Questioned Answers' }, paragraph: { index: 3 } });
    expect(typeof d.link).toBe('string');
    expect(Array.isArray(d.edits)).toBe(true);
  });
  it('searchHits hydrates implied hits from premise_claims and filters by status', async () => {
    await repo.saveImplied(1, [item('Is the soul eternal?')]);
    const search = vi.fn(async () => ({ hits: [{ paragraph_id: 1, doc_id: 7, score: 0.9, k: 900, implied: true }, { paragraph_id: 1, doc_id: 7, score: 0.5, k: 901, implied: true }] }));
    const r = await S.searchHits({ q: 'soul' }, { search });
    expect(search.mock.calls[0][1].filters.implied).toBe(true);
    expect(r.hits).toHaveLength(1);
    expect(r.hits[0]).toMatchObject({ kind: 'implied', score: 0.9 });
    expect((await S.searchHits({ q: 'soul', status: 'approved' }, { search })).hits).toHaveLength(0);
  });
  it('similarTo leaves out the item itself', async () => {
    await repo.saveImplied(1, [item('Is the soul eternal?')]);
    const id = raw.prepare('SELECT id FROM premise_claims').get().id;
    const search = vi.fn(async () => ({ hits: [{ paragraph_id: 1, doc_id: 7, score: 1, k: 900, implied: true }] }));
    expect((await S.similarTo(id, {}, { search })).hits).toEqual([]);
    expect(await S.similarTo(999, {}, { search })).toBeNull();
  });
  it('propose: mocked model; keeps only grounded, fresh items as status proposed; no LLM spend', async () => {
    await repo.saveImplied(1, [item('Does death end the person?')]);
    const content = JSON.stringify({ questions: [], implied: [item('Does death end the person?'), item('Is the soul eternal?'), item('Is it a lie?', { proof: 'words that are nowhere in the paragraph at all' })] });
    const ask = vi.fn(async () => ({ content }));
    const r = await S.propose(1, { ask, usd: 0.0123 });
    expect(ask).toHaveBeenCalledTimes(1);
    expect(r.usd).toBe(0.0123);
    expect(r.items.map((i) => [i.question, i.status])).toEqual([['Is the soul eternal?', 'proposed']]);
    expect(hyp(1).filter((x) => x.implied)).toHaveLength(1);
    expect(await S.propose(99, { ask })).toBeNull();
  });
  it('importRun imports keep/rescope entries as source pilot; drop and ungrounded skipped; a path is never followed', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-'));
    fs.writeFileSync(path.join(dir, 'premise-reconcile-20261112.json'), JSON.stringify({ entries: [
      { paraId: 1, verdict: 'rescope', premise: 'old', newPremise: 'new premise', implies: 'impl', proof: 'it is immortal beyond the death', concept: 'x', questions: [{ q: 'Is the soul eternal?' }] },
      { paraId: 1, verdict: 'drop', questions: ['Never?'] },
      { paraId: 2, verdict: 'keep', premise: 'p', proof: 'not in the text whatsoever really', questions: ['Anything?'] }] }));
    const r = await S.importRun({ file: '../../etc/premise-reconcile-20261112.json' }, { dir });
    expect(r.file).toBe('premise-reconcile-20261112.json');
    expect(r.imported).toBe(1);
    expect(r.skipped).toBeGreaterThanOrEqual(2);
    expect(raw.prepare('SELECT premise, source, status FROM premise_claims').get()).toEqual({ premise: 'new premise', source: 'pilot', status: 'unreviewed' });
    expect((await S.importRun({ file: 'evil.json' }, { dir })).error).toBeTruthy();
  });
  it('buildGraph links concept → question → passage → author', () => {
    const g = S.buildGraph([{ id: 1, concept: 'c', question: 'q?', status: 'approved', paraId: 5, docId: 7, doc: { author: 'A', religion: 'R', title: 'T' } }]);
    expect(g.nodes.map((n) => n.type).sort()).toEqual(['author', 'concept', 'passage', 'question']);
    expect(g.links.map((l) => l.type).sort()).toEqual(['about', 'answeredBy', 'wrote']);
  });
});

describe('implied routes', () => {
  const app = async (deps = {}) => { const f = Fastify(); await f.register(routes, { prefix: '/api/admin', deps }); return f; };
  it('create (proof gate 422, force), patch, bulk, delete, edits, list', async () => {
    const f = await app({ queueFollowIndex: async () => ({ queued: true }) });
    const bad = await f.inject({ method: 'POST', url: '/api/admin/implied', payload: { paraId: 1, question: 'Q one here?', implies: 'i', proof: 'nothing like this appears anywhere' } });
    expect(bad.statusCode).toBe(422);
    const ok = await f.inject({ method: 'POST', url: '/api/admin/implied', payload: { paraId: 1, question: 'Q one here?', premise: 'p', implies: 'i', proof: 'it is immortal beyond the death' } });
    expect(ok.statusCode).toBe(200);
    const id = ok.json().id;
    expect(ok.json()).toMatchObject({ status: 'approved', reindex: 'queued' });
    const pat = await f.inject({ method: 'PATCH', url: `/api/admin/implied/${id}`, payload: { note: 'checked' } });
    expect(pat.json().item.note).toBe('checked');
    expect((await f.inject({ method: 'POST', url: '/api/admin/implied/bulk', payload: { ids: [id], status: 'rejected' } })).json().updated).toBe(1);
    expect((await f.inject({ method: 'POST', url: '/api/admin/implied/bulk', payload: { ids: [] } })).statusCode).toBe(400);
    expect((await f.inject({ method: 'GET', url: '/api/admin/implied?status=rejected' })).json().items).toHaveLength(1);
    expect((await f.inject({ method: 'GET', url: '/api/admin/implied/edits' })).json().edits.length).toBeGreaterThan(0);
    expect((await f.inject({ method: 'DELETE', url: `/api/admin/implied/${id}?hard=1` })).json().hard).toBe(true);
    expect((await f.inject({ method: 'GET', url: `/api/admin/implied/${id}` })).statusCode).toBe(404);
  });
  it('HyPE editor get/put and propose (mocked)', async () => {
    const f = await app({ propose: { ask: async () => ({ content: JSON.stringify({ implied: [item('Is the soul eternal?')] }) }), usd: 0 } });
    const g = await f.inject({ method: 'GET', url: '/api/admin/hype/paragraph/1' });
    expect(g.json()).toMatchObject({ paragraph: { id: 1 }, doc: { title: 'Some Questioned Answers' } });
    expect((await f.inject({ method: 'PUT', url: '/api/admin/hype/paragraph/1', payload: { stated: ['New stated?'] } })).json().ok).toBe(true);
    const p = await f.inject({ method: 'POST', url: '/api/admin/hype/paragraph/1/propose' });
    expect(p.json().items[0].status).toBe('proposed');
    expect((await f.inject({ method: 'GET', url: '/api/admin/hype/paragraph/999' })).statusCode).toBe(404);
  });
  it('search needs q', async () => {
    expect((await (await app()).inject({ method: 'GET', url: '/api/admin/implied/search' })).statusCode).toBe(400);
  });
});

describe('implied-overview report', () => {
  it('real spend by day/model, attribution share, estimated labels, featured', async () => {
    await repo.saveImplied(1, [item('Does death end the person?'), item('Is the soul eternal?')]);
    const id = raw.prepare('SELECT id FROM premise_claims').get().id;
    await repo.patchImplied(id, { status: 'approved' });
    const r = await impliedOverviewJob({}, {
      now: () => new Date('2026-11-12T12:00:00Z'), firstAt: async () => '2026-11-10 00:00:00', maxId: async () => 2, yieldTick: async () => {},
      spendWindow: async (a) => (a.startsWith('2026-11-10') ? [{ day: '2026-11-11', model: 'haiku', usd: 3, calls: 10, docId: 7 }, { day: '2026-11-11', model: 'haiku', usd: 1, calls: 5, docId: null }] : []),
      counts: async (from) => (from === 0 ? [{ doc_id: 7, paragraphs: 2, questions: 4 }] : []), side: async () => ({ premise: 0.5, propose: 0, judge: 0 }),
      coverage: async () => [{ religion: "Baha'i", layer: 'hype', generated: 2, total: 10 }] });
    expect(r.totals).toMatchObject({ items: 2, byStatus: { approved: 1, unreviewed: 1 } });
    expect(r.spend).toMatchObject({ hypeUsd: 4, totalUsd: 4.5, attributedShare: 0.75, impliedShareEstimated: true });
    expect(r.spend.byModel).toEqual([{ model: 'haiku', usd: 4 }]);
    expect(r.spend.byDay[0]).toMatchObject({ day: '2026-11-11', usd: 4 });
    expect(typeof r.spend.byDay[0].implied).toBe('number');
    expect(r.spend.byReligion[0]).toMatchObject({ religion: "Baha'i", usd: 4, estimated: true });
    expect(r.spend.coverage).toEqual([{ religion: "Baha'i", hyped: 2, total: 10 }]);
    expect(r.featured.length).toBeGreaterThan(0);
  });
});
