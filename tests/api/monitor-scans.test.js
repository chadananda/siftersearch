// 10-19: the monitors themselves made search slow — whole-table scans every 5/30/60 min kept SQLite's pages out of the
// ZFS cache, so search hydration (primary-key lookups) took 200–1000 ms and searches 5–15 s. Each of these fails on the
// old code.
import { describe, it, expect } from 'vitest';
import { readFileSync, mkdtempSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { slowProbeCache, probeKey } from '../../scripts/lib/slow-probe-cache.mjs';

const src = (f) => readFileSync(join(import.meta.dirname, '../../scripts', f), 'utf8');

describe('monitors do not scan whole tables on their frequent runs', () => {
  it('stall-guard: no COUNT(*) of entity_mentions_v2, no date(timestamp)= on ai_usage', () => {
    const s = src('stall-guard.mjs');
    expect(s).not.toMatch(/COUNT\(\*\)\s+n\s+FROM entity_mentions_v2/);
    expect(s).not.toMatch(/date\(timestamp\)\s*=/);
  });
  it('system-checks: content scans only in the daily run', () => {
    const s = src('system-checks.mjs');
    for (const m of s.matchAll(/g\(`SELECT COUNT\([^`]*FROM content WHERE[^`]*`\)/g)) {
      const before = s.slice(Math.max(0, m.index - 200), m.index);
      expect(before).toMatch(/heavy/);
    }
  });
  it('pipeline-snapshot reads through the slow-probe cache', () => {
    expect(src('pipeline-snapshot.js')).toMatch(/slowProbeCache/);
  });
});

describe('slowProbeCache', () => {
  it('reuses a slow probe within the hour, reruns a fast one, normalises times', async () => {
    let t = 1_000_000;
    const file = join(mkdtempSync(join(tmpdir(), 'spc-')), 'c.json');
    const c = slowProbeCache(file, { slowMs: 2000, ttlMs: 3600_000, now: () => t });
    let calls = 0;
    const slow = c.wrap(async () => { calls++; t += 5000; return { n: calls }; });
    expect(await slow('SELECT COUNT(*) FROM content', [])).toEqual({ n: 1 });
    expect(await slow('SELECT COUNT(*) FROM content', [])).toEqual({ n: 1 });   // reused
    t += 3600_001;
    expect(await slow('SELECT COUNT(*) FROM content', [])).toEqual({ n: 2 });   // hour up → rerun
    const fast = c.wrap(async () => { calls++; return calls; });
    const a = await fast('SELECT 1', []), b = await fast('SELECT 1', []);
    expect(b).toBe(a + 1);
    expect(probeKey('x', ['2026-10-19 04:00:00', 5])).toBe(probeKey('x', ['2026-10-20 05:00:00', 5]));
    c.save();
    expect(JSON.parse(readFileSync(file, 'utf8'))).toBeTruthy();
  });
});

describe('CLI scripts exit when done (10-19: an 8-day-old --status kept scanning)', () => {
  it('deep-research-runner exits after main()', () => {
    expect(src('deep-research-runner.mjs')).toMatch(/main\(\)\.then\(\(\) => process\.exit\(0\)\)/);
  });
});
