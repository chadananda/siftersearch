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
});
