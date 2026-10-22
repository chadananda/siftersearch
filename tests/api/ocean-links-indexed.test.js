// 10-22: 'ocean-links:resolve' was an OR-of-200 join on docs.source_url (no index) — 5.2 s blocking reads, and two 19.6 s
// gateway timeouts on /api/v1/people/:id. The lookup is now two indexed probes (docs-repo.oceanParagraphs); this pins
// that both use their index and that the migration creates the source_url index.
import { describe, it, expect } from 'vitest';
import Database from 'better-sqlite3';
import { readFileSync } from 'fs';
import { join } from 'path';
import { OCEAN_BOOKS_SQL, OCEAN_PARAS_SQL } from '../../api/lib/docs-repo.js';

const ROOT = join(import.meta.dirname, '..', '..');
const plan = (db, sql, args) => db.prepare(`EXPLAIN QUERY PLAN ${sql}`).all(...args).map((r) => r.detail).join(' | ');

function fixture() {
  const db = new Database(':memory:');
  db.exec(`CREATE TABLE docs (id INTEGER PRIMARY KEY, source_url TEXT, source_site TEXT, external_id TEXT, deleted_at TEXT);
    CREATE TABLE content (id INTEGER PRIMARY KEY, doc_id INTEGER, external_para_id TEXT, text TEXT, block_attrs TEXT, deleted_at TEXT);
    CREATE INDEX idx_docs_source_site ON docs(source_site) WHERE source_site IS NOT NULL;
    CREATE INDEX idx_content_external_para ON content(doc_id, external_para_id) WHERE external_para_id IS NOT NULL;
    CREATE INDEX idx_docs_source_url ON docs(source_url) WHERE source_url IS NOT NULL;`);
  const d = db.prepare('INSERT INTO docs (source_url, source_site, external_id) VALUES (?, ?, ?)');
  const c = db.prepare('INSERT INTO content (doc_id, external_para_id, text) VALUES (?, ?, ?)');
  db.transaction(() => {
    for (let i = 1; i <= 3000; i++) d.run(`https://oceanlibrary.com/book-${i}`, 'oceanlibrary.com', `b${i}_en`);
    for (let i = 1; i <= 3000; i++) for (let p = 1; p <= 20; p++) c.run(i, `para_${p}`, 'x');
  })();
  db.exec('ANALYZE');
  return db;
}

describe('OceanLibrary range-link lookup is indexed', () => {
  const db = fixture();
  it('finds books by source_url through idx_docs_source_url (both URL spellings)', () => {
    const urls = ['https://oceanlibrary.com/book-7', 'https://oceanlibrary.com/book-7/'];
    expect(plan(db, OCEAN_BOOKS_SQL(urls.length), urls)).toMatch(/USING INDEX idx_docs_source_url/);
    expect(db.prepare(OCEAN_BOOKS_SQL(urls.length)).all(...urls).map((r) => r.external_id)).toEqual(['b7_en']);
  });
  it("finds a book's paragraphs through (doc_id, external_para_id)", () => {
    const args = [7, 'para_3', 'para_9'];
    expect(plan(db, OCEAN_PARAS_SQL(2), args)).toMatch(/USING INDEX idx_content_external_para/);
    expect(db.prepare(OCEAN_PARAS_SQL(2)).all(...args)).toHaveLength(2);
  });
  it('migration 168 creates the source_url index and CURRENT_VERSION covers it', () => {
    const src = readFileSync(join(ROOT, 'api/lib/migrations/v72-v90.js'), 'utf8');
    expect(src).toMatch(/168: async[\s\S]*CREATE INDEX IF NOT EXISTS idx_docs_source_url ON docs\(source_url\)/);
    expect(Number(/CURRENT_VERSION = (\d+)/.exec(readFileSync(join(ROOT, 'api/lib/migrations/runner.js'), 'utf8'))[1])).toBeGreaterThanOrEqual(168);
  });
});
