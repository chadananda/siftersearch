// Queue agent GPU pacing (Chad 10-31): one talk always on deck for the GPU, so it never idles while the others run CPU stages.
import { it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { wantAnother, gpuWaiting, ON_DECK_MS } from '../../scripts/media/worker/gpu-pace.mjs';

const base = { running: 1, cap: 3, waiting: 0, sinceClaimMs: ON_DECK_MS, memGb: 10, minGb: 5 };
it('one talk always on deck: claim when nothing waits at the GPU; a GPU backlog or a talk still reaching the GPU holds the next', () => {
  expect(wantAnother({ ...base, running: 0, sinceClaimMs: 0 })).toBe(true);
  expect(wantAnother(base)).toBe(true);
  expect(wantAnother({ ...base, waiting: 1 })).toBe(false);
  expect(wantAnother({ ...base, sinceClaimMs: ON_DECK_MS - 1 })).toBe(false);
});
it('the slot cap and free RAM still bound it', () => {
  expect(wantAnother({ ...base, running: 3 })).toBe(false);
  expect(wantAnother({ ...base, running: 0, memGb: 4 })).toBe(false);
});
it('gpuWaiting counts only fresh waiters in leases.json.wait; no file = none', () => {
  const d = mkdtempSync(join(tmpdir(), 'lease-')), now = 1_800_000_000_000;
  expect(gpuWaiting(d, now)).toBe(0);
  writeFileSync(join(d, 'leases.json.wait'), JSON.stringify({ a: { since: 1, at: now / 1000 - 2 }, b: { since: 1, at: now / 1000 - 30 } }));
  expect(gpuWaiting(d, now)).toBe(1);
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
