// Scripts are API CLIENTS (Chad 10-11: "you should not be touching sqlite yourself. you should have api tools for doing
// that … We cannot allow scripts and agents free access to production DB — it will just create unnecessary contention").
// A script may not import db.js, a repo, better-sqlite3, or shell out to sqlite3 — it calls the internal API
// (scripts/ops/ops.mjs, /api/admin/ops/*); heavy reads are ops REPORTS run by siftersearch-reports. Frozen 10-11, SHRINK-ONLY.
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join, relative } from 'path';

const ROOT = join(import.meta.dirname, '..', '..');
const RE = /from\s+['"][^'"]*(\/db\.js|\/repos\/[^'"]+|docs-repo\.js|paragraphs-repo\.js)['"]|import\(\s*['"][^'"]*(\/db\.js|\/repos\/[^'"]+|docs-repo\.js|paragraphs-repo\.js)['"]|from\s+['"]better-sqlite3['"]|new\s+Database\s*\(|['"`]sqlite3['"`]|execSync\([^)]*sqlite3/;
const codeOnly = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.name === 'node_modules' || e.name.startsWith('.') ? []
  : e.isDirectory() ? walk(join(d, e.name)) : /\.(js|mjs|cjs)$/.test(e.name) ? [join(d, e.name)] : []));
const LEGACY = new Set(JSON.parse(readFileSync(join(ROOT, 'tests/api/scripts-db-legacy.json'), 'utf8')).legacy);
const found = walk(join(ROOT, 'scripts')).map((f) => relative(ROOT, f)).filter((f) => RE.test(codeOnly(readFileSync(join(ROOT, f), 'utf8')))).sort();

describe('scripts are internal-API clients (hard rule)', () => {
  it('no NEW script reaches production data directly', () => {
    const added = found.filter((f) => !LEGACY.has(f));
    if (added.length) throw new Error(`Direct data access in:\n  ${added.join('\n  ')}\nCall the internal API (scripts/ops/ops.mjs); add an ops report or endpoint if one is missing.`);
    expect(added).toEqual([]);
  });
  it('the legacy list only shrinks', () => {
    const gone = [...LEGACY].filter((f) => !found.includes(f));
    if (gone.length) throw new Error(`Now an API client — remove from tests/api/scripts-db-legacy.json:\n  ${gone.join('\n  ')}`);
    expect(gone).toEqual([]);
  });
});
