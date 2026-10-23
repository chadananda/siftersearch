// The library browse never sorts the docs table on the request path (10-23). GET /api/library/documents (no filter, limit 5)
// ran `docs ⋈ library_nodes ORDER BY COALESCE(authority,5), collection, title` — USE TEMP B-TREE over every live doc, 5.6 s
// with siftersearch-api frozen. Now api/lib/repos/library-browse-repo.js walks collections (snapshot counts) over indexes.
//
// RATCHET: (1) a request-path SQL literal on docs with ORDER BY and no indexed narrowing (`= ?`, `IS ?`, `IN (?`, or an
// INDEXED BY hint) fails here, beyond the shrinking legacy list. (2) EXPLAIN of every browse plan shows no temp B-tree
// over docs. Need a new ordered listing? Give it an index (and an INDEXED BY) or serve it from a snapshot.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import {
  BROWSE_INDEXES, PREVIEW_SQL, collectionSliceSql, sortedSql, narrowedCountsSql, filterSql,
  countsFromFacets, orderCollections, planSlices, compareCollections,
} from '../../api/lib/repos/library-browse-repo.js';

const ROOT = join(import.meta.dirname, '..', '..');
const REQUEST_PATH = ['api/routes', 'api/lib/repos', 'api/lib/docs-repo.js', 'api/lib/paragraphs-repo.js', 'api/lib/search.js'];
// Out of process (siftersearch-reports / ops jobs), never on a request path.
const OUT_OF_PROCESS = new Set(['api/lib/repos/pipeline-snapshot-repo.js']);
// Legacy un-narrowed ORDER BY literals on docs, file → allowed count. MEASURED 2026-10-23; only shrinks.
//   admin.js (7) admin dashboards/scans · chat.js (2) collection list + narrowed-by-${where} source pick ·
//   documents.js (3) DISTINCT facet lists · grounding.js (1) LIKE-prefix path list · ingest.js (2) RANDOM() samples ·
//   library.js (1) a shelf listing joined by ${where} · public-api.js (2) /v1 browse ORDER BY title + authors list ·
//   tablets.js (1) · coverage-repo (2) · rights-repo (1) · sections-repo (1) · docs-repo (1) listDocs.
const LEGACY = new Map([
  ['api/routes/admin.js', 7], ['api/routes/chat.js', 2], ['api/routes/documents.js', 3], ['api/routes/grounding.js', 1],
  ['api/routes/ingest.js', 2], ['api/routes/library.js', 1], ['api/routes/public-api.js', 2], ['api/routes/tablets.js', 1],
  ['api/lib/repos/coverage-repo.js', 2], ['api/lib/repos/rights-repo.js', 1], ['api/lib/repos/sections-repo.js', 1],
  ['api/lib/docs-repo.js', 1],
]);

const codeOnly = (src) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const walk = (p, out = []) => {
  if (statSync(p).isDirectory()) { for (const e of readdirSync(p)) walk(join(p, e), out); }
  else if (/\.(js|mjs)$/.test(p)) out.push(p);
  return out;
};
function enclosingLiteral(src, i) {
  const ls = src.lastIndexOf('\n', i) + 1, le = src.indexOf('\n', i);
  const line = src.slice(ls, le < 0 ? undefined : le), col = i - ls;
  for (const q of ["'", '"']) {
    const a = line.lastIndexOf(q, col), b = line.indexOf(q, col);
    if (a >= 0 && b >= 0 && !line.slice(a, b).includes('`')) return line.slice(a, b + 1);
  }
  const a = src.lastIndexOf('`', i), b = src.indexOf('`', i);
  return a >= 0 && b >= 0 ? src.slice(a, b + 1) : line;
}
/** SQL literals that ORDER BY over docs with nothing indexed narrowing or ordering them. */
function unnarrowedDocsOrderBy(src) {
  const code = codeOnly(src), out = [];
  for (const m of code.matchAll(/\bFROM\s+docs\b/gi)) {
    const q = enclosingLiteral(code, m.index);
    if (/\bORDER\s+BY\b/i.test(q) && !/(?<![!<>])=\s*\?|\bIS\s+\?|\bIN\s*\(\s*\?|\bIN\s*\(\$\{|\bINDEXED\s+BY\b/i.test(q) && !out.includes(q)) out.push(q);
  }
  return out;
}

describe('request path never sorts docs without an index (static ratchet)', () => {
  it('detector catches the 10-23 offender and spares narrowed / index-hinted queries', () => {
    const offender = "queryAll(`SELECT d.id FROM docs d LEFT JOIN library_nodes ln ON ln.name = d.collection ${w} ORDER BY COALESCE(ln.authority_default, 5) DESC, d.collection, d.title LIMIT ? OFFSET ?`, p)";
    expect(unnarrowedDocsOrderBy(offender)).toHaveLength(1);
    expect(unnarrowedDocsOrderBy('queryAll(`SELECT id FROM docs WHERE collection = ? ORDER BY title LIMIT 5`, [c])')).toHaveLength(0);
    expect(unnarrowedDocsOrderBy('queryAll(`SELECT id FROM docs d INDEXED BY idx_x WHERE ${w} ORDER BY d.title LIMIT ?`, p)')).toHaveLength(0);
  });

  it('no request-path file adds one (outside the shrinking legacy list)', () => {
    const offenders = [];
    for (const base of REQUEST_PATH) {
      for (const f of walk(join(ROOT, base))) {
        const rel = relative(ROOT, f);
        if (OUT_OF_PROCESS.has(rel)) continue;
        const hits = unnarrowedDocsOrderBy(readFileSync(f, 'utf8'));
        if (hits.length > (LEGACY.get(rel) ?? 0)) offenders.push(`${rel} (${hits.length}): ${hits.map((h) => h.replace(/\s+/g, ' ').slice(0, 110)).join(' | ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the documents handler browses through the repo (no ORDER BY of its own)', () => {
    const src = codeOnly(readFileSync(join(ROOT, 'api/routes/library.js'), 'utf8'));
    expect(src).toMatch(/await browseDocuments\(/);
    expect(src).not.toMatch(/COALESCE\(ln\.authority_default, 5\) DESC, d\.collection/);   // the religion page walks too
  });
});

describe('browse plans (EXPLAIN QUERY PLAN): no temp B-tree over docs', () => {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, author TEXT, religion TEXT, collection TEXT, language TEXT,
      year INTEGER, description TEXT, paragraph_count INTEGER, encumbered INTEGER, cover_url TEXT, file_path TEXT, filename TEXT,
      created_at TEXT, updated_at TEXT, deleted_at TEXT, slug TEXT);
    CREATE INDEX idx_docs_religion ON docs(religion); CREATE INDEX idx_docs_collection ON docs(collection);
    CREATE INDEX idx_docs_deleted_at ON docs(deleted_at);
    CREATE INDEX idx_docs_stats ON docs(deleted_at, religion, collection, language);
    CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, paragraph_index INTEGER, text TEXT, deleted_at TEXT);
    CREATE INDEX idx_content_doc ON content(doc_id); CREATE INDEX idx_content_doc_deleted ON content(deleted_at, doc_id);
    CREATE TABLE library_nodes (id INTEGER PRIMARY KEY, parent_id INTEGER, node_type TEXT, name TEXT, authority_default INTEGER);`);
  for (const sql of Object.values(BROWSE_INDEXES)) db.exec(sql);
  const ins = db.prepare('INSERT INTO docs (title, author, religion, collection, language, year, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?)');
  for (let i = 0; i < 3000; i++) ins.run(`T${i}`, `A${i % 40}`, i % 5 ? "Baha'i" : 'Islam', i % 7 ? `C${i % 30}` : null, i % 3 ? 'en' : 'fa', 1800 + (i % 200), i % 50 ? null : 'x');
  db.exec('ANALYZE');
  const rows = (sql, params) => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...params);
  const plan = (sql, params) => rows(sql, params).map((r) => r.detail);
  // the docs loop = top-level plan steps; the preview subquery's own steps (a sort of ≤ PREVIEW_SCAN content rows) nest
  const docsLevel = (sql, params) => rows(sql, params).filter((r) => r.parent === 0).map((r) => r.detail);

  const FILTERS = [{}, { religion: "Baha'i" }, { language: 'fa' }, { collection: 'C3' }, { religion: 'Islam', language: 'en' },
    { author: 'A7' }, { yearFrom: 1850, yearTo: 1900 }];

  it('collection slice (the default authority walk) for every common filter', () => {
    for (const f of FILTERS) {
      const { where, params } = filterSql(f, { withCollection: false });
      for (const dir of ['ASC', 'DESC']) {
        const top = docsLevel(collectionSliceSql(where, dir), ['C3', ...params, 5, 0]).join(' | ');
        expect(top, JSON.stringify(f)).toMatch(/idx_docs_live_coll_title/);
        expect(top, JSON.stringify(f)).not.toMatch(/TEMP B-TREE/);
      }
    }
  });

  it('sort=year|author, unfiltered and by religion/language, walk the sort index', () => {
    for (const f of [{}, { religion: "Baha'i" }, { language: 'en' }, { yearFrom: 1850 }]) {
      const { where, params } = filterSql(f);
      for (const [idx, col] of [['idx_docs_live_year_title', 'd.year'], ['idx_docs_live_author_title', 'd.author']]) {
        if (f.yearFrom && col === 'd.author') continue;
        expect(docsLevel(sortedSql(where, idx, col, 'DESC'), [...params, 5, 0]).join(' | '), `${col} ${JSON.stringify(f)}`).not.toMatch(/TEMP B-TREE/);
      }
    }
  });

  it('the no-snapshot fallback orders straight off idx_docs_live_coll_title', () => {
    const { where, params } = filterSql({});
    expect(docsLevel(sortedSql(where, 'idx_docs_live_coll_title', 'd.collection', 'ASC'), [...params, 5, 0]).join(' | ')).not.toMatch(/TEMP B-TREE/);
  });

  it('author / year counts are narrowed by an index, never SCAN docs', () => {
    for (const f of [{ author: 'A7' }, { yearFrom: 1850, yearTo: 1900 }, { author: 'A7', religion: 'Islam' }]) {
      const { where, params } = filterSql(f);
      const idx = f.author ? 'idx_docs_live_author_title' : 'idx_docs_live_year_title';
      expect(plan(narrowedCountsSql(where, idx), params).join(' | ')).toMatch(/SEARCH d USING (COVERING )?INDEX idx_docs_live_\w+ \((author|year)/);
    }
  });

  it('preview: a LIMITed covering-index lookup per doc, not every paragraph of the doc', () => {
    const lines = plan(`SELECT d.id, ${PREVIEW_SQL} FROM docs d WHERE d.id = ?`, [5]);
    expect(lines.join(' | ')).toMatch(/COVERING INDEX idx_content_doc_deleted \(deleted_at=\? AND doc_id=\?\)/);
    expect(PREVIEW_SQL).toMatch(/ORDER BY id LIMIT \d+\)/);
  });

  it('the slices return the old order: authority, collection, title', () => {
    db.exec(`INSERT INTO library_nodes (node_type, name, authority_default) VALUES ('collection', 'C9', 9), ('collection', 'C2', 7)`);
    const snap = { facets: db.prepare('SELECT religion, collection, language, COUNT(*) n FROM docs WHERE deleted_at IS NULL GROUP BY 1,2,3').all() };
    const auth = new Map(db.prepare("SELECT name, MAX(COALESCE(authority_default,5)) a FROM library_nodes WHERE node_type='collection' GROUP BY name").all().map((r) => [r.name, r.a]));
    const old = db.prepare(`SELECT d.id FROM docs d LEFT JOIN library_nodes ln ON ln.name = d.collection AND ln.node_type = 'collection'
      WHERE d.deleted_at IS NULL ORDER BY COALESCE(ln.authority_default, 5) DESC, d.collection, d.title LIMIT ? OFFSET ?`);
    const { where, params } = filterSql({}, { withCollection: false });
    const slice = db.prepare(collectionSliceSql(where, 'ASC'));
    for (const [offset, limit] of [[0, 5], [95, 20], [2900, 50]]) {
      const got = planSlices(orderCollections(countsFromFacets(snap), auth, 'desc'), offset, limit)
        .flatMap((s) => slice.all(s.collection, ...params, s.limit, s.offset).map((r) => r.id));
      expect(got).toEqual(old.all(limit, offset).map((r) => r.id));
    }
  });
});

describe('walk planning (pure)', () => {
  it('counts from facets honour religion/collection/language; no snapshot → null', () => {
    const snap = { facets: [{ religion: 'B', collection: 'X', language: 'en', n: 3 }, { religion: 'B', collection: 'X', language: 'fa', n: 2 },
      { religion: 'I', collection: null, language: 'en', n: 4 }] };
    expect([...countsFromFacets(snap)]).toEqual([['X', 5], [null, 4]]);
    expect([...countsFromFacets(snap, { language: 'en' })]).toEqual([['X', 3], [null, 4]]);
    expect([...countsFromFacets(snap, { religion: 'I' })]).toEqual([[null, 4]]);
    expect(countsFromFacets({ missing: true, facets: [] })).toBeNull();
    expect(countsFromFacets({ fallback: 'pipeline-status.corpus', facets: [] })).toBeNull();
  });
  it('orders by authority then SQLite BINARY collection order (NULL first)', () => {
    const g = orderCollections(new Map([['b', 1], [null, 1], ['A', 1], ['z', 2], ['e', 0]]), new Map([['z', 9]]));
    expect(g.map((x) => x.collection)).toEqual(['z', null, 'A', 'b']);
    expect(compareCollections('Á', 'B')).toBe(1);   // UTF-8 bytes, not locale
  });
  it('slices span collection boundaries', () => {
    const g = [{ collection: 'a', n: 3 }, { collection: 'b', n: 2 }, { collection: 'c', n: 10 }];
    expect(planSlices(g, 2, 4)).toEqual([{ collection: 'a', offset: 2, limit: 1 }, { collection: 'b', offset: 0, limit: 2 }, { collection: 'c', offset: 0, limit: 1 }]);
    expect(planSlices(g, 20, 5)).toEqual([]);
  });
});
