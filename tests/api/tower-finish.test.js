// Tower's cpu-finish agent (Chad 10-31): the one documented placement exception stays cpu-finish only, inside the bulk slice.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { towerFinishArgs } from '../../scripts/media/worker/tower-finish.mjs';

describe('tower cpu-finish agent', () => {
  const a = towerFinishArgs({}), v = (k) => a[a.indexOf(`--${k}`) + 1];
  it('claims cpu-finish only, never gpu / prep / whole', () => {
    expect(v('types')).toBe('cpu-finish');
    expect(a).not.toContain('--can'); expect(a).not.toContain('--profile'); expect(a).not.toContain('--spill');
    expect(v('device')).toBe('none');
  });
  it('every job container lands in the system bulk slice', () => {
    expect(v('run')).toBe('docker');
    expect(v('cgroup-parent')).toBe('sifter-bulk.slice');
    expect(readFileSync('docs/ops/sifter-bulk.system.slice', 'utf8')).toMatch(/CPUQuota=\d+%[\s\S]*MemoryMax=\d+G/);
  });
  it('the agent passes --cgroup-parent to docker run', () => {
    expect(readFileSync('scripts/media/worker/queue-agent.mjs', 'utf8')).toMatch(/\.\.\.\(CGROUP \? \['--cgroup-parent', CGROUP\] : \[\]\)/);
  });
  it('pm2 starts it through in-slice.sh', () => {
    const eco = readFileSync('ecosystem.config.cjs', 'utf8'), i = eco.indexOf("name: 'siftersearch-finish'");
    expect(i).toBeGreaterThan(-1);
    expect(eco.slice(i, i + 400)).toMatch(/interpreter: path\.join\(PROJECT_ROOT, 'scripts\/ops\/in-slice\.sh'\)/);
  });
});
