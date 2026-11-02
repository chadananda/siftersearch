// Every service reports its version, health and work in hand (docs/architecture/continuous-deploy.md).
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startHeartbeat, readServices, headCommit } from '../../api/lib/service-heartbeat.js';

describe('service heartbeat', () => {
  it('a beat is read back with health and version; a silent service is called silent', () => {
    const dir = mkdtempSync(join(tmpdir(), 'svc-'));
    const stop = startHeartbeat({ name: 'siftersearch-test', dir, state: () => ({ inflight: 2, doing: ['dewey-intake #9'] }) });
    stop();
    const [s] = readServices({ dir, head: headCommit() });
    expect(s).toMatchObject({ name: 'siftersearch-test', health: 'running', inflight: 2, doing: ['dewey-intake #9'], on_head: true });
    const [late] = readServices({ dir, now: Date.now() + 120_000 });
    expect(late.health).toBe('silent');
  });

  it("a job's state file in the services dir (no started_at) is job state, never a silent service (Chad 11-02)", async () => {
    const dir = mkdtempSync(join(tmpdir(), 'svc-'));
    const { writeFileSync } = await import('node:fs');
    writeFileSync(join(dir, 'embed-gemini-x.json'), JSON.stringify({ name: 'embed-gemini', pid: 1, state: 'running', beat_at: '2026-10-29T17:55:36.253Z' }));
    const [s] = readServices({ dir });
    expect(s).toMatchObject({ kind: 'job-state', health: 'running' });
  });

  it('reports event-loop lag: a blocked loop shows in the next beat', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'svc-'));
    const stop = startHeartbeat({ name: 'siftersearch-lag', dir, every: 400 });
    await new Promise((r) => setTimeout(r, 30));
    for (const end = Date.now() + 120; Date.now() < end;);   // block the loop 120 ms
    await new Promise((r) => setTimeout(r, 450));
    stop();
    const [s] = readServices({ dir });
    expect(s.loop_lag_ms.max).toBeGreaterThanOrEqual(80);
  });
});
