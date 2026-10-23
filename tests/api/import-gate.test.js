// The updater's IMPORT gate (scripts/lib/import-gate.mjs; 10-23 16:08: media-jobs.js was pushed importing
// '../media/historical.js', which was not committed — node --check passes it, every reload would have failed).
import { describe, it, expect } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { importProblems, exportsOf, stripComments } from '../../scripts/lib/import-gate.mjs';

const repo = (files) => {
  const root = mkdtempSync(join(tmpdir(), 'ig-'));
  for (const [p, src] of Object.entries(files)) { mkdirSync(join(root, p, '..'), { recursive: true }); writeFileSync(join(root, p), src); }
  return root;
};

describe('import gate', () => {
  it('a changed file importing a module that does not exist is blocked (the 16:08 case)', () => {
    const root = repo({ 'api/lib/ops/media-jobs.js': "import { historicalIndex } from '../media/historical.js';\nexport const x = 1;\n" });
    const p = importProblems(['api/lib/ops/media-jobs.js'], { root });
    expect(p).toHaveLength(1);
    expect(p[0]).toMatchObject({ file: 'api/lib/ops/media-jobs.js', line: 1 });
    expect(p[0].warn).toBeUndefined();
    expect(p[0].error).toMatch(/historical\.js', which does not exist/);
  });
  it('a named import the module does not export is blocked; an importer of a changed file is checked too', () => {
    const root = repo({ 'api/a.js': "export function one() {}\nexport const PUB = 5, SIFTER = 6;\n", 'api/b.js': "import { one, SIFTER, two } from './a.js';\n" });
    const p = importProblems(['api/a.js'], { root });   // b.js did not change, but imports a.js
    expect(p.map((x) => x.error)).toEqual(["imports { two } from './a.js', which does not export it"]);
  });
  it('deleting a module breaks its importers', () => {
    const root = repo({ 'api/b.js': "import './gone.js';\n" });
    expect(importProblems(['api/gone.js'], { root })[0].error).toMatch(/gone\.js', which does not exist/);
  });
  it('a dynamic import() of a missing file only warns; packages and builtins resolve; src/ and scripts/wip are out of scope', () => {
    const root = repo({ 'api/c.js': "import fs from 'fs';\nimport { join } from 'node:path';\nconst f = async () => import('./maybe.js');\n", 'node_modules/dotenv/package.json': '{}',
      'api/d.js': "import dotenv from 'dotenv';\nimport nope from 'not-installed-pkg';\n", 'src/lib/e.js': "import x from 'virtual:pwa';\n", 'scripts/wip/w.mjs': "import './nothing.js';\n" });
    const p = importProblems(['api/c.js', 'api/d.js', 'src/lib/e.js', 'scripts/wip/w.mjs'], { root });
    expect(p.filter((x) => !x.warn).map((x) => x.error)).toEqual(["package 'not-installed-pkg' is not installed"]);
    expect(p.filter((x) => x.warn).map((x) => x.error)).toEqual(["imports './maybe.js', which does not exist"]);
  });
  it('a /* inside a string never swallows code; comment lines are ignored', () => {
    const src = "const glob = '/api/*';\nexport async function createHttpServer() {}\n// import { gone } from './gone.js';\n * import x from './y.js'\nconst end = '*/';\n";
    expect(exportsOf(src).has('createHttpServer')).toBe(true);
    expect(stripComments(src)).not.toMatch(/gone\.js/);
  });
  it('late() paths are repo-relative and must exist', () => {
    const root = repo({ 'api/lib/media/x.js': "const m = await late('api/lib/missing.js');\n" });
    expect(importProblems(['api/lib/media/x.js'], { root })[0].error).toMatch(/late\('api\/lib\/missing\.js'\)/);
  });
});
