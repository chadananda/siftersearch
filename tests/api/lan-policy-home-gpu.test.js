// The LAN queue never gets home_gpu:false: pods lease only from the edge, so it would strand LAN-only gpu steps (11-03: 394, Aorus idle).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

describe('LAN queue policy', () => {
  it('never tells home GPUs to skip LAN gpu work', () => {
    const src = readFileSync(new URL('../../api/lib/ops/media-jobs.js', import.meta.url), 'utf8');
    const calls = src.match(/localQueue\(\)\.policy\([^;]*;/g) || [];
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(c).not.toMatch(/home_gpu/);
  });
});
