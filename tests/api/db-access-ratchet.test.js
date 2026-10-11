// Database access is RATCHETED (Chad 10-11, a HARD RULE: "We need clean internal APIs for database access so that we can
// prevent contention and log behavior … Tasks like deep-research should always be built using that internal API").
// Data is read and written ONLY through repo modules (api/lib/*-repo.js, api/lib/repos/**), whose functions are named,
// logged contracts; writes go through the single writer. Nothing else imports db.js, opens better-sqlite3, or shells out
// to sqlite3. The 10-11 legacy list (tests/api/db-access-legacy.json) may only SHRINK: a new file fails, and a migrated
// file must leave the list. Plan: planning/architecture-data-access-20261009.md § Database access.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(import.meta.dirname, '..', '..');
const DB = /from\s+['"][^'"]*\/db\.js['"]|import\(\s*['"][^'"]*\/db\.js['"]\s*\)|from\s+['"]better-sqlite3['"]|new\s+Database\s*\(|['"`]sqlite3['"`]|execSync\([^)]*sqlite3/;
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' || e.name.startsWith('.') ? []
  : e.isDirectory() ? walk(join(d, e.name)) : /\.(js|mjs|cjs)$/.test(e.name) ? [join(d, e.name)] : []));
/** Allowed for good: the connection, the single writer, migrations, and the repos themselves. */
const isInfra = (f) => ['api/lib/db.js', 'api/lib/write-server.js', 'api/workers/unified-worker.js'].includes(f)
  || f.includes('/migrations/') || /^api\/lib\/(repos\/.*|[^/]*-repo)\.js$/.test(f);
const LEGACY = new Set(JSON.parse(readFileSync(join(ROOT, 'tests/api/db-access-legacy.json'), 'utf8')).legacy);

function dbFiles() {
  const out = [];
  for (const base of ['api', 'scripts', 'worker']) {
    let files = [];
    try { files = walk(join(ROOT, base)); } catch { continue; }
    for (const f of files) { const rel = relative(ROOT, f); if (DB.test(codeOnly(readFileSync(f, 'utf8')))) out.push(rel); }
  }
  return out.sort();
}

describe('database access goes through repos (hard rule)', () => {
  const found = dbFiles();
  it('no NEW file touches SQLite directly', () => {
    const added = found.filter((f) => !isInfra(f) && !LEGACY.has(f));
    if (added.length) throw new Error(`Direct SQLite access in:\n  ${added.join('\n  ')}\n`
      + 'Add or extend a repo function (api/lib/repos/<area>-repo.js) and call that. Scripts, workers and routes are clients.');
    expect(added).toEqual([]);
  });
  it('the legacy list only shrinks (a migrated file must leave it)', () => {
    const gone = [...LEGACY].filter((f) => !found.includes(f));
    if (gone.length) throw new Error(`No longer direct — remove from tests/api/db-access-legacy.json:\n  ${gone.join('\n  ')}`);
    expect(gone).toEqual([]);
  });
});
