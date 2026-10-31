// wordsKey (stage-queue §5): JS and the worker's Python twin agree on the shared fixture; timings never change the key, words and language do.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { wordsKey } from '../../api/lib/media/words-key.js';

const { cases } = JSON.parse(readFileSync(new URL('../fixtures/words-key.json', import.meta.url), 'utf8'));
const byName = Object.fromEntries(cases.map((c) => [c.name, c.key]));

describe('wordsKey', () => {
  it('JS matches every fixture key', () => { for (const c of cases) expect(wordsKey(c.work), c.name).toBe(c.key); });
  it('Python twin matches every fixture key', () => {
    const dir = mkdtempSync(join(tmpdir(), 'wk-')), files = cases.map((c, i) => { const f = join(dir, `${i}.json`); writeFileSync(f, JSON.stringify(c.work)); return f; });
    const out = execFileSync('python3', [new URL('../../scripts/media/worker/words_key.py', import.meta.url).pathname, ...files], { encoding: 'utf8' }).trim().split('\n');
    expect(out).toEqual(cases.map((c) => c.key));
  });
  it('a timing re-stamp keeps the key; a word or language change does not', () => {
    expect(byName['retimed (same words)']).toBe(byName.base);
    expect(byName['one word edited']).not.toBe(byName.base);
    expect(byName['language changed']).not.toBe(byName.base);
  });
});
