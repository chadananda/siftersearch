// "off-peak — grounding owns the box" is only true when grounding HAS work.
//
// convert + ingest are peak-window jobs because grounding is supposed to own the machine off-peak. But the
// gate tested the CLOCK, not the claim: with the plan at 881/893 the grounding queue is empty, so every
// off-peak tick logged "grounding owns the box" and skipped while nothing whatsoever ran — an 8-hour window
// (16:30–00:30 UTC) idle on both sides, with 4,023 books holding sources and waiting to be converted.
//
// Neither script makes an AI call (both are pure fs + sqlite), so using an idle box costs nothing but CPU.
// The guard stays honest: the moment grounding has anything queued or running, the skip returns.
import { describe, it, expect, vi, beforeEach } from 'vitest';

let peakNow = false;
let queueRows = 0;
let queryOneImpl;

vi.mock('../../api/lib/pipeline/peak.js', () => ({
  nowInPeak: () => peakNow,
  peakEndsAt: () => new Date('2026-08-15T00:30:00Z'),
}));
vi.mock('../../api/lib/db.js', () => ({
  queryOne: (...a) => queryOneImpl(...a),
  query: async () => ({}),
}));

const load = async () => (await import('../../scripts/lib/stage-runner.mjs')).shouldRun;

beforeEach(() => {
  vi.resetModules();
  peakNow = false; queueRows = 0;
  // no API run-request pending; grounding-queue depth answers the second call
  queryOneImpl = async (sql) => (/pipeline_run/.test(sql) ? null : { n: queueRows });
});

describe('shouldRun — the box is only "owned" if grounding is using it', () => {
  it('off-peak with an EMPTY grounding queue: run, and say why', async () => {
    const d = await (await load())('convert');
    expect(d.run).toBe(true);
    expect(d.why).toMatch(/empty|idle/i);
  });

  it('off-peak with grounding WORKING: still skips — the original guard is intact', async () => {
    queueRows = 3;
    const d = await (await load())('convert');
    expect(d.run).toBe(false);
    expect(d.why).toMatch(/grounding/i);
  });

  it('peak window still runs regardless of the queue', async () => {
    peakNow = true; queueRows = 9;
    expect((await (await load())('convert')).run).toBe(true);
  });

  it('if the queue cannot be read, it SKIPS — an unreadable guard must not authorise work', async () => {
    queryOneImpl = async (sql) => { if (/pipeline_run/.test(sql)) return null; throw new Error('no such table: grounding_queue'); };
    const d = await (await load())('convert');
    expect(d.run).toBe(false);
  });
});
