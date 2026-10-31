// Queue agent GPU pacing (Chad 10-31): the next talk starts when the GPU goes quiet, so its GPU stages overlap the others' CPU stages.
import { it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { pace, wantAnother, QUIET_MS, WARM_MS, BUSY_PCT } from '../../scripts/media/worker/gpu-pace.mjs';

const base = { running: 1, cap: 3, quietMs: QUIET_MS, sinceClaimMs: WARM_MS, memGb: 10, minGb: 5 };
it('an idle host takes a talk at once; a busy GPU or a talk still warming up holds the next one', () => {
  expect(wantAnother({ ...base, running: 0, quietMs: 0, sinceClaimMs: 0 })).toBe(true);
  expect(wantAnother(base)).toBe(true);
  expect(wantAnother({ ...base, quietMs: QUIET_MS - 1 })).toBe(false);
  expect(wantAnother({ ...base, sinceClaimMs: WARM_MS - 1 })).toBe(false);
});
it('the slot cap and free RAM still bound it', () => {
  expect(wantAnother({ ...base, running: 3 })).toBe(false);
  expect(wantAnother({ ...base, running: 0, memGb: 4 })).toBe(false);
});
it('quiet time resets when the GPU gets busy; an unreadable GPU counts as quiet', () => {
  const g = pace();
  g.sample(5, 0); g.sample(BUSY_PCT - 1, 30_000);
  expect(g.quietMs(60_000)).toBe(60_000);
  g.sample(90, 61_000);
  expect(g.quietMs(70_000)).toBe(0);
  g.sample(null, 70_000);
  expect(g.quietMs(80_000)).toBe(10_000);
});
it('the agent asks wantAnother before every claim', () => {
  const agent = readFileSync('scripts/media/worker/queue-agent.mjs', 'utf8');
  expect(agent).toMatch(/wantAnother\(\{[^\n]*\}\)\) \{\n\s*const job = await q\.claim/);
});
it('containers are capped at the host RAM, not 10 GB: the lease ledger sums every talk against that cap (10-31 boss)', () => {
  const agent = readFileSync('scripts/media/worker/queue-agent.mjs', 'utf8');
  expect(agent).not.toMatch(/'--memory', '10g'/);
  expect(agent).toMatch(/'--memory', `\$\{containerMemGb\(memTotalGb\(\)\)\}g`/);
  const f = new Function(`return ${/containerMemGb = (\(totalGb\) => [^;]+);/.exec(agent)[1]}`)();
  expect([f(15), f(31), f(8)]).toEqual([12, 26, 10]);
});
