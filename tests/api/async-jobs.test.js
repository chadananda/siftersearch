// Long work is a job (docs/architecture/continuous-deploy.md): file-backed, idempotent by key, drained at shutdown.
import { describe, it, expect } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
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
  // 10-23: a draft whose process was killed stayed "running" 8 h in /ops/services (it read the raw files)
  it('a running record whose process is gone, or older than 30 min, is reaped as lost (persisted), not listed', () => {
    const dir = mkdtempSync(join(tmpdir(), 'jobs-'));
    const now = Date.now();
    const put = (key, rec) => writeFileSync(join(dir, `${key}.json`), JSON.stringify({ key, kind: 'anis-draft', status: 'running', ...rec }));
    put('dead-pid', { started_at: now - 60_000, pid: 2 ** 22 + 12345 });            // no such process
    put('too-old', { started_at: now - 8 * 3600_000, pid: process.ppid });            // alive pid, but 8 h
    put('alive', { started_at: now - 60_000, pid: process.ppid });                    // another live process, recent
    const s = jobStore(dir);
    expect(s.active().map((j) => j.key)).toEqual(['alive']);
    const lost = JSON.parse(readFileSync(join(dir, 'too-old.json'), 'utf8'));
    expect(lost).toMatchObject({ status: 'lost', abandoned_reason: 'timeout' });
    expect(s.get('dead-pid')).toMatchObject({ status: 'lost', abandoned_reason: 'process-gone' });
  });
  it('the services list uses the store (no raw "running" filter); tests never write the production tracker', () => {
    const route = readFileSync(join(process.cwd(), 'api/routes/ops-reports.js'), 'utf8');
    expect(route).toMatch(/jobStore\(\)\.active\(\)/);
    expect(jobStore().dir).not.toBe(join(process.cwd(), 'data', 'jobs'));
    expect(jobStore().dir.startsWith(tmpdir())).toBe(true);
  });
});
