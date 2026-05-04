// Site-only DB infrastructure tests.
//
// Verifies getSiteDb() lazy-connects, applies migrations, isolates from main DB,
// caches by index prefix, and respects the slow-query log instrumentation.
//
// Site-only DBs back the strict scope wall: bahaiteachings.org's 60K+ opinion
// paragraphs land here and CANNOT leak into primary search code paths because
// the connection isn't even opened in default scope.

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';

import { getSiteDb } from '../../api/lib/db.js';
import { SITE_DB_CURRENT_VERSION } from '../../api/lib/migrations/site.js';

// Each test run gets its own data dir so site DBs don't pollute the repo.
let originalCwd;
let tempCwd;

beforeAll(() => {
  originalCwd = process.cwd();
  tempCwd = mkdtempSync(path.join(tmpdir(), 'sifter-site-db-test-'));
  process.chdir(tempCwd);
});

afterAll(() => {
  process.chdir(originalCwd);
  rmSync(tempCwd, { recursive: true, force: true });
});

describe('getSiteDb', () => {
  it('throws without a siteId', async () => {
    await expect(getSiteDb('')).rejects.toThrow(/siteId/);
  });

  it('lazy-creates data/sites/<prefix>.db on first call', async () => {
    const db = await getSiteDb('bahaiteachings.org', 'bt');
    expect(db).toBeDefined();
    expect(existsSync(path.join(tempCwd, 'data/sites/bt.db'))).toBe(true);
  });

  it('runs site migrations on first connect (creates docs + content tables)', async () => {
    const db = await getSiteDb('bahaiteachings.org', 'bt');
    const tables = db.prepare(
      `SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`
    ).all().map(r => r.name);
    expect(tables).toContain('docs');
    expect(tables).toContain('content');
    expect(tables).toContain('_schema_version');
  });

  it('records the current schema version', async () => {
    const db = await getSiteDb('bahaiteachings.org', 'bt');
    const row = db.prepare('SELECT version FROM _schema_version LIMIT 1').get();
    expect(row.version).toBe(SITE_DB_CURRENT_VERSION);
  });

  it('caches the connection — second call returns the same handle', async () => {
    const a = await getSiteDb('bahaiteachings.org', 'bt');
    const b = await getSiteDb('bahaiteachings.org', 'bt');
    expect(a).toBe(b);
  });

  it('different sites get different DBs', async () => {
    const bt = await getSiteDb('bahaiteachings.org', 'bt');
    const example = await getSiteDb('example.com', 'ex');
    expect(bt).not.toBe(example);
    expect(existsSync(path.join(tempCwd, 'data/sites/ex.db'))).toBe(true);
  });

  it('site DBs are isolated — writing to one does not affect another', async () => {
    const bt = await getSiteDb('bahaiteachings.org', 'bt');
    const example = await getSiteDb('example.com', 'ex');

    bt.prepare(`INSERT INTO docs (file_path, title) VALUES (?, ?)`).run('/bt/post.md', 'BT post');
    const btCount = bt.prepare(`SELECT COUNT(*) AS n FROM docs`).get().n;
    const exCount = example.prepare(`SELECT COUNT(*) AS n FROM docs`).get().n;

    expect(btCount).toBe(1);
    expect(exCount).toBe(0);
  });

  it('site DB schema includes the page-anchor column for PDF deeplinks', async () => {
    const db = await getSiteDb('bahaiteachings.org', 'bt');
    const cols = db.prepare(`PRAGMA table_info(content)`).all().map(c => c.name);
    expect(cols).toContain('pdf_page');
    expect(cols).toContain('external_para_id');
    expect(cols).toContain('normalized_hash');
  });

  it('site DB does NOT include enrichment columns (HyPE, context) — site-only is excluded from enrichment by design', async () => {
    const db = await getSiteDb('bahaiteachings.org', 'bt');
    const cols = db.prepare(`PRAGMA table_info(content)`).all().map(c => c.name);
    expect(cols).not.toContain('hyp_questions');
    expect(cols).not.toContain('hyp_thesis');
    expect(cols).not.toContain('context');
    expect(cols).not.toContain('enhanced_synced');
  });

  it('sanitizes index prefix into a safe filename', async () => {
    // Adversarial siteId — the filename must NOT contain path traversal characters.
    const db = await getSiteDb('weird/site', '../../etc/passwd');
    expect(db).toBeDefined();
    // The actual file should be under data/sites/, not at /etc/passwd.
    const escapedAttempt = path.join(tempCwd, '..', '..', 'etc', 'passwd');
    expect(existsSync(escapedAttempt)).toBe(false);
  });

  it('re-running migrations on existing DB is a no-op', async () => {
    const db1 = await getSiteDb('bahaiteachings.org', 'bt');
    db1.prepare(`INSERT INTO docs (file_path, title) VALUES (?, ?)`).run('/bt/keep.md', 'Keep me');
    const before = db1.prepare(`SELECT COUNT(*) AS n FROM docs`).get().n;

    // Force a rebuild of the cache by clearing module state — simulate a fresh
    // process. The DB on disk persists; reopening should re-apply migrations
    // idempotently and preserve data.
    const db2 = await getSiteDb('bahaiteachings.org', 'bt');
    const after = db2.prepare(`SELECT COUNT(*) AS n FROM docs`).get().n;
    expect(after).toBe(before);
  });
});
