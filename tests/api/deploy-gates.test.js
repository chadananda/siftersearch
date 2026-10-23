// The updater refuses a commit whose JS does not parse; system-checks names a boot failure (10-23 media outage).
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { syntaxProblems, codeFiles } from '../../scripts/lib/syntax-gate.mjs';
import { bootFailures } from '../../scripts/lib/boot-failures.mjs';

describe('syntax gate', () => {
  it('a trailing // comment that swallows the rest of an object line is refused; good files and non-code pass', async () => {
    const d = mkdtempSync(join(tmpdir(), 'sg-'));
    // as in the repo ("type": "module"): outside a module package node --check passes an ambiguous .js it cannot parse
    writeFileSync(join(d, 'package.json'), '{"type":"module"}');
    writeFileSync(join(d, 'bad.js'), "export const L = { compute: 4, asr: 6,   // + 4: note llm: 6, pipeline: 3 };\nexport default 1;\n");
    writeFileSync(join(d, 'good.mjs'), 'export const x = 1;\n');
    writeFileSync(join(d, 'notes.md'), '# not code');
    expect(codeFiles(['bad.js', 'good.mjs', 'notes.md', 'gone.js'], d)).toEqual(['bad.js', 'good.mjs']);
    // the real broken line from 9b09230b
    writeFileSync(join(d, 'bad.js'), 'export const W = { a: 1, b: (2) + 4,   // + 4: note\nexport async function loop() {}\n');
    const bad = await syntaxProblems(['bad.js', 'good.mjs', 'notes.md'], { root: d });
    expect(bad.map((b) => b.file)).toEqual(['bad.js']);
    expect(bad[0].error).toMatch(/SyntaxError/);
  });
});

describe('boot failures', () => {
  const log = "file:///home/chad/sifter/siftersearch/api/workers/media-worker.js:36\nexport async function mediaFeedLoop() {\n^^^^^^\nSyntaxError: Unexpected token 'export'\n    at compileSourceTextModule";
  it('a SyntaxError written since the last start is a boot failure, named with file and line', () => {
    const f = bootFailures([{ name: 'siftersearch-media', startedAt: 1000, errMtime: 2000, errTail: log }]);
    expect(f).toEqual([{ name: 'siftersearch-media', line: expect.stringMatching(/media-worker\.js:36 SyntaxError: Unexpected token 'export'/) }]);
  });
  it('an old error from before the last start is not', () => {
    expect(bootFailures([{ name: 'x', startedAt: 100000, errMtime: 2000, errTail: log }])).toEqual([]);
  });
});
