// bioSearch judge:false (planned search's claims layer, 11-03): no model call on any path. The connection path answers
// with its cited-connected set (each person's connecting claim); the meaning path answers nothing (evidence search does);
// the group catalog and the person list are cached, not re-read per request.
import { describe, it, expect, vi, beforeEach } from 'vitest';
import Database from 'better-sqlite3';

const db = new Database(':memory:');
const sqls = [];
vi.mock('../../api/lib/db.js', () => {
  const run = (sql, params = []) => { sqls.push(sql); return db.prepare(sql).all(...params); };
  return { queryAll: vi.fn(async (sql, params) => run(sql, params)), queryOne: vi.fn(async (sql, params) => run(sql, params)[0] ?? null),
    query: vi.fn(async (sql, params) => ({ rows: run(sql, params) })) };
});
const chat = vi.fn(async () => ({ content: '{"lead":"","clauses":[],"matches":[]}' }));
vi.mock('../../api/lib/ai.js', () => ({ chatCompletion: (...a) => chat(...a) }));
const CLAIMS = [
  { eid: 1, name: 'Quddús', imp: 5, tid: 100, relation: 'met', statement: 'Quddús met Bahá’u’lláh at Badasht', proof: 'Quddús attained the presence of Bahá’u’lláh', doc: 1, pid: 'p1' },
  { eid: 2, name: 'Ṭáhirih', imp: 4, tid: null, relation: 'travelled', statement: 'Ṭáhirih travelled to Badasht', proof: 'she proceeded to Badasht', doc: 1, pid: 'p2' },
];
vi.mock('../../api/lib/claim-search.js', () => ({ bioClaimRows: vi.fn(async () => CLAIMS) }));

const { bioSearch, bioGroup, _resetBioListCache } = await import('../../api/lib/bio.js');

db.exec(`CREATE TABLE graph_entities (id INTEGER PRIMARY KEY, canonical_name TEXT, importance REAL, last_assessed_version TEXT, entity_type TEXT);
  CREATE TABLE entity_research (canonical_name TEXT, aliases TEXT, summary TEXT);
  CREATE TABLE graph_relations (source_entity_id INTEGER, target_entity_id INTEGER);
  CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, source_url TEXT);
  INSERT INTO graph_entities VALUES (1, 'Quddús', 5, NULL, 'person'), (2, 'Ṭáhirih', 4, NULL, 'person'), (100, 'Bahá’u’lláh', 10, NULL, 'person'),
    (900, 'Letters of the Living', 3, NULL, 'group');
  INSERT INTO graph_relations VALUES (1, 900), (2, 900);
  INSERT INTO docs VALUES (1, 'The Dawn-Breakers', 'https://oceanlibrary.com/db');`);

beforeEach(() => { chat.mockClear(); sqls.length = 0; _resetBioListCache(); });

describe('bioSearch judge:false', () => {
  it('connection question: the cited-connected set with its claim, no model call', async () => {
    const r = await bioSearch('Who met Bahaullah?', { judge: false });
    expect(chat).not.toHaveBeenCalled();
    expect(r.deterministic).toBe(true);
    expect(r.ids).toEqual([1]);
    expect(r.reasoning.evidence[1].paraId).toBe('p1');
  });

  it('meaning question: no ids (the evidence search answers), group kept as the bound, no model call', async () => {
    const r = await bioSearch('Letters of the Living who travelled to Badasht', { judge: false });
    expect(chat).not.toHaveBeenCalled();
    expect(r.ids).toEqual([]);
    expect(r.group).toBe(900);
  });

  it('judge:true (biography browser / Anís tool) still asks the judge', async () => {
    await bioSearch('Letters of the Living who travelled to Badasht');
    expect(chat).toHaveBeenCalled();
  });

  it('bare group answers from the roster; the group catalog is read once per 5 min', async () => {
    const a = await bioGroup('Letters of the Living');
    expect(a.bareGroup).toBe(true);
    expect(a.memberIds.sort()).toEqual([1, 2]);
    await bioGroup('the Letters of the Living at Badasht');
    expect(sqls.filter((s) => /entity_type='group'/.test(s))).toHaveLength(1);
  });
});
