// Long work is a job (docs/architecture/continuous-deploy.md): file-backed, idempotent by key, drained at shutdown.
import { describe, it, expect } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { jobStore, drain, inFlight } from '../../api/lib/jobs/async-jobs.js';

describe('async jobs', () => {
  it('starts once per key, records the result in a file another process can read, and drains', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'jobs-'));
    const s = jobStore(dir);
    let runs = 0;
    const work = () => new Promise((r) => setTimeout(() => { runs++; r({ reply: 'ok' }); }, 50));
    expect(s.start('mail-1', work).status).toBe('running');
    expect(s.start('mail-1', work).status).toBe('running');   // same key: not twice
    expect(inFlight()).toBe(1);
    expect(await drain(5000)).toBe(0);
    expect(runs).toBe(1);
    expect(jobStore(dir).get('mail-1')).toMatchObject({ status: 'done', result: { reply: 'ok' } });   // a fresh store = the next API instance
    expect(s.start('mail-1', work).status).toBe('done');      // done stays done
  });
  it('a failure is recorded; a failed key may run again', async () => {
    const s = jobStore(mkdtempSync(join(tmpdir(), 'jobs-')));
    s.start('k', async () => { throw new Error('boom'); });
    await drain(2000);
    expect(s.get('k')).toMatchObject({ status: 'failed', error: 'boom' });
    s.start('k', async () => 1); await drain(2000);
    expect(s.get('k').status).toBe('done');
  });
});
