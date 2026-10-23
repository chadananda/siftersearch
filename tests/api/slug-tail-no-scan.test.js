// Doc-page slug fallback never scans docs (10-23). `slug LIKE '%\_<slug>'` over the whole table froze siftersearch-api
// 7.3 s (SCAN docs) for a stale URL like .../hidden-words_fa. Now: the URL's religion/collection candidates come from an
// index (docsForPathSlugs, idx_docs_collection) and the "_<slug>" tail is matched in memory (resolveBySlugTail).
//
// RATCHET: a slug/title LIKE on docs in a request-path file that is not narrowed by an indexed equality (`= ?` / `IN (?`)
// fails here, as does any leading-wildcard pattern built next to a slug/title LIKE. Lists only shrink.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, relative } from 'path';
import { resolveBySlugTail } from '../../api/lib/slug.js';
import { PATH_SLUG_CANDIDATES_SQL } from '../../api/lib/docs-repo.js';

const ROOT = join(import.meta.dirname, '..', '..');
const REQUEST_PATH = ['api/routes', 'api/lib/repos', 'api/lib/docs-repo.js', 'api/lib/paragraphs-repo.js'];
// Legacy un-narrowed slug/title LIKE literals on docs, file → allowed count. MEASURED 2026-10-23; only shrinks.
//   library.js  — the collection-page search fragments (2; the queries they join ARE narrowed by religion+collection).
//   admin.js    — admin-only title search (LIMIT 20).
//   chat.js     — OL title clause fragment appended to a narrowed query.
//   docs-repo.js — findDocuments' optional title filter.
const LEGACY = new Map([['api/routes/library.js', 2], ['api/routes/admin.js', 1], ['api/routes/chat.js', 1], ['api/lib/docs-repo.js', 1]]);

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
/** SQL literals with a docs slug/title LIKE that no indexed equality narrows (other tables' aliases, e.g. s.title, skip). */
function unnarrowedSlugLikes(src) {
  const code = codeOnly(src), out = [];
  for (const m of code.matchAll(/(?<![\w.])(?:d\.)?(slug|title)\s+LIKE\b/gi)) {
    const q = enclosingLiteral(code, m.index);
    if (/LIKE\s+'%/i.test(q) || !/(?<![!<>])=\s*\?|\bIN\s*\(\s*\?|\bIN\s*\(\$\{/i.test(q)) { if (!out.includes(q)) out.push(q); }
  }
  return out;
}

describe('request path never runs an un-narrowed slug/title LIKE on docs', () => {
  it('detector catches the 10-23 offender and spares narrowed queries', () => {
    expect(unnarrowedSlugLikes("queryOne(`SELECT id FROM docs WHERE slug LIKE ? ESCAPE '\\\\' AND slug != ?`, [p, s])")).toHaveLength(1);
    expect(unnarrowedSlugLikes("queryOne(`SELECT id FROM docs WHERE slug LIKE '%_x'`)")).toHaveLength(1);
    expect(unnarrowedSlugLikes('queryAll(`SELECT id FROM docs WHERE religion = ? AND collection = ? AND slug LIKE ? AND id != ?`, a)')).toHaveLength(0);
    expect(unnarrowedSlugLikes("queryAll(`SELECT s.title FROM sections s WHERE s.title LIKE '% %'`)")).toHaveLength(0);
  });

  it('no request-path file adds one (outside the shrinking legacy list)', () => {
    const offenders = [];
    for (const base of REQUEST_PATH) {
      for (const f of walk(join(ROOT, base))) {
        const rel = relative(ROOT, f);
        const hits = unnarrowedSlugLikes(readFileSync(f, 'utf8'));
        if (hits.length > (LEGACY.get(rel) ?? 0)) offenders.push(`${rel}: ${hits.map((h) => h.replace(/\s+/g, ' ').slice(0, 100)).join(' | ')}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('the by-path handler no longer builds a leading-wildcard slug pattern', () => {
    const src = codeOnly(readFileSync(join(ROOT, 'api/routes/library.js'), 'utf8'));
    expect(src).not.toMatch(/`%\\\\_\$\{/);
    expect(src).toMatch(/resolveBySlugTail\(slug, candidates\)/);
  });
});

describe('slug fallback candidates use an index', () => {
  it('EXPLAIN QUERY PLAN: collection IN (...) searches idx_docs_collection, never SCAN docs', () => {
    const db = new Database(':memory:');
    db.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, title TEXT, author TEXT, religion TEXT, collection TEXT, language TEXT,
      year INTEGER, description TEXT, paragraph_count INTEGER, encumbered INTEGER, purchase_url TEXT, cover_url TEXT,
      file_path TEXT, filename TEXT, slug TEXT, created_at TEXT, updated_at TEXT, deleted_at TEXT, duplicate_of INTEGER);
      CREATE INDEX idx_docs_slug ON docs(slug); CREATE INDEX idx_docs_religion ON docs(religion);
      CREATE INDEX idx_docs_collection ON docs(collection);`);
    const ins = db.prepare('INSERT INTO docs (religion, collection, slug) VALUES (?, ?, ?)');
    for (let i = 0; i < 2000; i++) ins.run(i % 3 ? 'Islam' : "Bahá'í", `C${i % 200}`, `a${i}_t${i}_en`);
    db.exec('ANALYZE');
    const plan = db.prepare(`EXPLAIN QUERY PLAN ${PATH_SLUG_CANDIDATES_SQL(2)}`).all('C1', 'C2').map((r) => r.detail).join(' | ');
    expect(plan).toMatch(/USING INDEX idx_docs_collection/);
    expect(plan).not.toMatch(/SCAN docs(?! USING)/);
    db.close();
  });
});

describe('resolveBySlugTail (same answers the LIKE gave, within the URL\'s collection)', () => {
  const C = [
    { id: 1, slug: 'bahaullah_hidden-words_fa', religion: "Bahá'í", collection: 'Core' },
    { id: 2, slug: 'bahaullah_hidden-words_en', religion: "Bahá'í", collection: 'Core' },
    { id: 3, slug: 'hidden-words_fa', religion: "Bahá'í", collection: 'Core' },
  ];
  it('URL missing the author prefix → the stored slug ending _<slug>', () => {
    expect(resolveBySlugTail('hidden-words_en', C)?.id).toBe(2);
    expect(resolveBySlugTail('hidden-words_fa', C)?.id).toBe(1);   // the exact-slug row itself is excluded (slug != ?)
  });
  it('the tail must follow an underscore — "words_fa" matches, "ords_fa" does not', () => {
    expect(resolveBySlugTail('ords_fa', C)).toBeNull();
    expect(resolveBySlugTail('words_fa', [{ id: 9, slug: 'x_words_fa' }])?.id).toBe(9);
  });
  it('case-insensitive like SQLite LIKE', () => {
    expect(resolveBySlugTail('Hidden-Words_EN', C)?.id).toBe(2);
  });
  it('prefers a live, non-duplicate copy', () => {
    const rows = [{ id: 5, slug: 'a_b_en', duplicate_of: 6 }, { id: 6, slug: 'c_b_en' }];
    expect(resolveBySlugTail('b_en', rows)?.id).toBe(6);
  });
  it('nothing, empty slug, or no candidates → null', () => {
    expect(resolveBySlugTail('', C)).toBeNull();
    expect(resolveBySlugTail('no-such_en', C)).toBeNull();
    expect(resolveBySlugTail('hidden-words_fa', [])).toBeNull();
  });
});

describe('search_log is telemetry, not a direct write on the API thread', () => {
  it('search.js logs through telemetryQuery (batched to the writer), never userQuery', () => {
    const src = codeOnly(readFileSync(join(ROOT, 'api/routes/search.js'), 'utf8'));
    expect(src).toMatch(/telemetryQuery\(\s*`INSERT INTO search_log/);
    expect(src).not.toMatch(/userQuery\(\s*`INSERT INTO search_log/);
  });
  it('userQuery/userTransaction defer to the routed content path when the user DB is the content DB', () => {
    const src = readFileSync(join(ROOT, 'api/lib/db.js'), 'utf8');
    expect(src).toMatch(/export async function userQuery[^{]*\{\s*const db = await getUserDb\(\);\s*if \(userIsContent\(db\)\) return query\(/);
    expect(src).toMatch(/export async function userTransaction[^{]*\{\s*const db = await getUserDb\(\);\s*if \(userIsContent\(db\)\) return transaction\(/);
  });
});
