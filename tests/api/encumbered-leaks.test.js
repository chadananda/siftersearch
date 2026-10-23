// The other ways a copyrighted (encumbered) book's text could be paged out (Chad 10-23, closed after the reader limit):
// search hits, entity mentions/dossier, /api/v1/paragraph/:id, /api/v1/library/quotes, translate-batch, Anís evidence.
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import Fastify from 'fastify';
import { guardRows, excerpt, clipHit, EXCERPT_WORDS } from '../../api/lib/rights/guard.js';

const db = new Database(':memory:');
const graph = new Database(':memory:');
vi.mock('../../api/lib/db.js', () => ({
  query: vi.fn(async (sql, params = []) => db.prepare(sql).run(...params)),
  queryAll: vi.fn(async (sql, params = []) => db.prepare(sql).all(...params)),
  queryOne: vi.fn(async (sql, params = []) => db.prepare(sql).get(...params)),
  graphQueryAll: vi.fn(async (sql, params = []) => graph.prepare(sql).all(...params)),
  graphQueryOne: vi.fn(async (sql, params = []) => graph.prepare(sql).get(...params)),
  userQueryOne: vi.fn(async () => null), userQuery: vi.fn(async () => null), telemetryQuery: vi.fn(async () => null),
}));
vi.mock('../../api/lib/api-keys.js', () => ({ validateApiKey: vi.fn(async () => ({ id: 1, name: 't', legacy: true })) }));
vi.mock('../../api/lib/passage-links.js', async () => {
  const p = (id, doc, idx) => ({ id, documentId: doc, paragraphIndex: idx, text: `doc ${doc} paragraph ${idx}` });
  return {
    getPassages: vi.fn(async (ids) => new Map(ids.map((id) => [id, id < 1000 ? p(id, 1, id) : p(id, 2, id - 1000)]))),
    resolveLinks: vi.fn(async (ids) => new Map(ids.map((id) => [id, { original: null, originals: [], sources: [] }]))),
    findOriginals: vi.fn(async () => []),
  };
});
vi.mock('../../api/lib/auth.js', async (orig) => {
  const real = await orig();
  const set = async (request) => { const r = request.headers['x-test-role']; if (r) request.user = { sub: 1, role: r, tier: r }; };
  return { ...real, optionalAuthenticate: set, requireAuth: async (request) => { await set(request); if (!request.user) throw Object.assign(new Error('auth'), { statusCode: 401 }); } };
});

const LONG = Array.from({ length: 200 }, (_, i) => `w${i}`).join(' ');
let app;
beforeAll(async () => {
  db.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, author TEXT, religion TEXT, collection TEXT, language TEXT, year TEXT,
    description TEXT, source_url TEXT, slug TEXT, deleted_at TEXT, encumbered INTEGER DEFAULT 0)`);
  db.exec(`CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, paragraph_index INTEGER, text TEXT, heading TEXT, blocktype TEXT,
    translation TEXT, context TEXT, external_para_id TEXT, deleted_at TEXT)`);
  db.exec(`CREATE TABLE graph_entities (id INTEGER PRIMARY KEY, name TEXT, canonical_name TEXT, entity_type TEXT, religion TEXT, era TEXT, description TEXT, mention_count INTEGER)`);
  db.exec('CREATE TABLE graph_relations (source_entity_id INTEGER, target_entity_id INTEGER, relation_type TEXT, weight REAL)');
  graph.exec('CREATE TABLE entity_mentions (id INTEGER PRIMARY KEY, entity_id INTEGER, content_id INTEGER, role TEXT)');
  graph.exec('CREATE TABLE entity_aliases (entity_id INTEGER, surface TEXT, lang TEXT, confidence REAL)');
  db.prepare(`INSERT INTO docs (id, title, author, language, encumbered) VALUES (1, 'Modern Book', 'An Author', 'fa', 1), (2, 'Gleanings', 'Bahá’u’lláh', 'fa', 0)`).run();
  const ins = db.prepare('INSERT INTO content (id, doc_id, paragraph_index, text, blocktype) VALUES (?, ?, ?, ?, ?)');
  for (let i = 0; i < 60; i++) { ins.run(i, 1, i, `${LONG} (doc 1 #${i})`, 'paragraph'); ins.run(1000 + i, 2, i, `${LONG} (doc 2 #${i})`, 'paragraph'); }
  db.prepare("INSERT INTO graph_entities (id, name, canonical_name, entity_type, mention_count) VALUES (7, 'X', 'X', 'person', 2)").run();
  graph.prepare('INSERT INTO entity_mentions (entity_id, content_id, role) VALUES (7, 50, NULL), (7, 1050, NULL)').run();
  app = Fastify();
  const { errorHandler } = await import('../../api/lib/errors.js');
  app.setErrorHandler(errorHandler);
  await app.register((await import('../../api/routes/graph.js')).default, { prefix: '/api/graph' });
  await app.register((await import('../../api/routes/public-api.js')).default, { prefix: '/api/v1' });
  await app.register((await import('../../api/routes/library.js')).default, { prefix: '/api/library' });
  await app.ready();
}, 60_000);
afterAll(async () => { await app?.close(); });
const inject = (method, url, { role, body } = {}) => app.inject({ method, url, payload: body,
  headers: { 'x-api-key': 'k', ...(role ? { 'x-test-role': role } : {}) } });
const words = (s) => String(s).trim().split(/\s+/).length;
const enc = async (ids) => new Set(ids.filter((id) => Number(id) === 1));

describe('guardRows (search hits and any paragraph-shaped rows)', () => {
  const hits = [
    { id: 1, doc_id: 1, paragraph_index: 5, text: LONG },
    { id: 2, doc_id: 1, paragraph_index: 45, text: LONG, _formatted: { text: `<mark>${LONG}</mark>` } },
    { id: 3, doc_id: 2, paragraph_index: 45, text: LONG },
  ];
  it('inside the preview a hit is served whole; past it, an excerpt; other books untouched', async () => {
    const out = await guardRows(hits, { encumbered: enc });
    expect(out[0].text).toBe(LONG);
    expect(out[1]).toMatchObject({ excerpt: true, encumbered: 1 });
    expect(words(out[1].text)).toBeLessThanOrEqual(EXCERPT_WORDS + 1);
    expect(out[1]._formatted.text).toMatch(/<\/mark> …$/);   // highlight kept balanced
    expect(out[2].text).toBe(LONG);
  });
  it('a search scoped to one encumbered book never returns a hit past paragraph 40', async () => {
    const out = await guardRows(hits, { encumbered: enc, dropPastPreview: true });
    expect(out.map((h) => h.id)).toEqual([1, 3]);
  });
  it('staff see hits whole', async () => {
    expect((await guardRows(hits, { encumbered: enc, user: { role: 'admin' } }))[1].text).toBe(LONG);
  });
  it('excerpt keeps short text and cuts long text', () => {
    expect(excerpt('a b c')).toBe('a b c');
    expect(words(excerpt(LONG, 10))).toBe(11);
    expect(clipHit({ text: LONG, paragraph: { text: LONG } }, 5).paragraph.text).toBe('w0 w1 w2 w3 w4 …');
  });
});

describe('entity mentions + dossier', () => {
  it('a copyrighted book’s mention is a short snippet; a canonical one is whole', async () => {
    const m = (await inject('GET', '/api/graph/entity/7/mentions')).json();
    const byDoc = Object.fromEntries(m.paragraphs.map((p) => [p.docId, p]));
    expect(words(byDoc[1].text)).toBeLessThanOrEqual(41);
    expect(byDoc[1].excerpt).toBe(true);
    expect(byDoc[2].text).toContain('(doc 2 #50)');
    const d = (await inject('GET', '/api/graph/entity/7/dossier')).json();
    expect(words(d.mentions.find((x) => x.docId === 1).text)).toBeLessThanOrEqual(41);
  });
  it('the mentions limit is capped', async () => {
    expect((await inject('GET', '/api/graph/entity/7/mentions?limit=100000')).json().limit).toBe(200);
  });
});

describe('/api/v1/paragraph/:id and /api/v1/library/quotes', () => {
  it('refuses a copyrighted book’s paragraph past 40; serves the preview and other books', async () => {
    expect((await inject('GET', '/api/v1/paragraph/39')).statusCode).toBe(200);
    expect((await inject('GET', '/api/v1/paragraph/40')).statusCode).toBe(403);
    expect((await inject('GET', '/api/v1/paragraph/1050')).statusCode).toBe(200);
    expect((await inject('GET', '/api/v1/paragraph/45/links')).statusCode).toBe(403);
  });
  it('quotes past 40 in a copyrighted book are not served', async () => {
    db.exec('CREATE TABLE IF NOT EXISTS content_source_links (quote_id INTEGER, quote_doc INTEGER)');
    db.exec('CREATE TABLE IF NOT EXISTS content_alignment (trans_id INTEGER, trans_doc INTEGER, retired_at TEXT)');
    db.prepare('INSERT INTO content_source_links VALUES (10, 1), (45, 1), (1045, 2)').run();
    db.prepare("UPDATE docs SET author = 'Shared Author'").run();
    const r = (await inject('GET', '/api/v1/library/quotes?author=Shared%20Author')).json();
    expect(r.quotes.map((q) => q.quote.id).sort((a, b) => a - b)).toEqual([10, 1045]);
  });
});

describe('translate-batch', () => {
  it('refuses paragraphs past 40 of a copyrighted book (a staff member may)', { timeout: 30_000 }, async () => {
    const r = await inject('POST', '/api/library/documents/1/translate-batch', { role: 'user', body: { paragraphIds: [45] } });
    expect(r.statusCode).toBe(403);
  });
});

describe('Anís evidence', () => {
  it('respond clips copyrighted evidence to ≤ 80 words, so the quote gate cannot pass a longer quote', async () => {
    const { dropUnverified } = await import('../../api/lib/assistant/quotes.js');
    const [p] = await guardRows([{ doc_id: 1, paragraph_index: 3, text: LONG, citation_url: 'https://x/p3' }], { alwaysClip: true, encumbered: enc });
    expect(words(p.text)).toBeLessThanOrEqual(EXCERPT_WORDS + 1);
    expect(p.citation_url).toBe('https://x/p3');
    const longQuote = `As he wrote, “${LONG.split(' ').slice(0, 120).join(' ')}”. That is all.`;
    expect(dropUnverified(longQuote, [p]).removed).toBe(1);
    const shortQuote = `As he wrote, “${LONG.split(' ').slice(0, 30).join(' ')}”. That is all.`;
    expect(dropUnverified(shortQuote, [p]).removed).toBe(0);
  });
  it('the researcher never reads around a copyrighted book', async () => {
    const { research } = await import('../../api/lib/assistant/researcher.js');
    let calls = 0;
    const create = async () => (++calls === 1
      ? { choices: [{ message: { tool_calls: [{ id: 'a', function: { name: 'search_library', arguments: '{"query":"x"}' } }] } }] }
      : calls === 2 ? { choices: [{ message: { tool_calls: [{ id: 'b', function: { name: 'read_around', arguments: '{"ref":"P1"}' } }] } }] }
        : { choices: [{ message: { content: 'BRIEF: ok\nKEEP: P1' } }] });
    const around = vi.fn(async () => []);
    const r = await research({ messages: [{ role: 'user', content: 'q' }], create, maxRounds: 3,
      tools: { search: async () => [{ text: 'x', document_id: 1, paragraph_index: 3 }], around, encumberedAmong: enc } });
    expect(around).not.toHaveBeenCalled();
    expect(r?.steps?.find((s) => s.tool === 'read_around')).toBeTruthy();
  });
});
