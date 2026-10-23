// Migration numbers are unique in source (10-23). Two agents each added a `177:` to v72-v90.js; in an object literal the
// second key silently replaces the first, so one migration would never have run. Count the keys in the SOURCE.
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';

const DIR = join(import.meta.dirname, '..', '..', 'api', 'lib', 'migrations');

describe('migration keys', () => {
  it('no migration number is defined twice in one bucket file', () => {
    const dupes = [];
    for (const f of readdirSync(DIR).filter((n) => /^v\d+-v\d+\.js$/.test(n))) {
      const seen = new Map();
      // top-level keys of the exported objects: `  <n>: async`
      for (const m of readFileSync(join(DIR, f), 'utf8').matchAll(/^ {2}(\d+): async\b/gm)) seen.set(m[1], (seen.get(m[1]) || 0) + 1);
      for (const [k, n] of seen) if (n > 1) dupes.push(`${f}: ${k} ×${n}`);
    }
    expect(dupes).toEqual([]);
  });
});
