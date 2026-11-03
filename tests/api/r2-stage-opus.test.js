// stageTick uploads Opus only: every non-Opus original (WAV, FLAC, MP3, video) is converted; not made = skipped with its error (11-03, Chad: "we only process Opus")
import { describe, it, expect } from 'vitest';
import { stageTick } from '../../api/lib/media/r2-stage.js';

const metas = { 1: { original: 'a.wav', duration_s: 60 }, 2: { original: 'b.mp3', duration_s: 60 }, 3: { original: 'c.flac', duration_s: 60 }, 4: { original: 'd.opus', duration_s: 60 } };
const mk = (opus) => { const puts = [], st = { queue: [1, 2, 3, 4], jobs: {}, items: {}, staged: {} };
  return { puts, st, o: { store: { put: async (k, f) => { puts.push([k, f]); return 5; }, remove: async () => {} }, getItem: async (id) => ({ dir: `/nonexistent/${id}` }), readMeta: async (d) => metas[d.split('/').pop()],
    opus, now: 1, cfg: { aheadS: 1e9, maxBytes: 1e12, maxAgeMs: 1e9, prefix: 'stage/' } } }; };

describe('stageTick: Opus only', () => {
  it('an Opus failure on a WAV uploads nothing for it, records the error, and the next items still stage', async () => {
    const { puts, st, o } = mk(async (src) => { if (src.endsWith('a.wav')) throw Error('ffmpeg exited 1'); return { file: '/tmp/x-c.opus', ext: 'opus' }; });
    expect(await stageTick(st, o)).toBe('uploaded');
    expect(st.staged[1]).toBeUndefined(); expect(st.stage_errors[1].error).toMatch(/Opus conversion failed for a\.wav: ffmpeg exited 1/);
    expect(puts.some(([k]) => /\.wav$/.test(k))).toBe(false);
    expect(puts[0][0]).toMatch(/^stage\/2-.*\.opus$/);   // an MP3 goes out as Opus too
    expect(await stageTick(st, o)).toBe('uploaded');
    expect(puts[1][0]).toMatch(/^stage\/3-.*\.opus$/); expect(st.staged[3].ext).toBe('opus');   // a FLAC went out as Opus
    expect(await stageTick(st, o)).toBe('uploaded');
    expect(puts[2]).toEqual([expect.stringMatching(/^stage\/4-.*\.opus$/), '/nonexistent/4/d.opus']);   // an Opus original is sent as it is
  });
  it('no encoder at all: only an Opus original is ever staged', async () => {
    const { puts, st, o } = mk(null);
    await stageTick(st, o);
    expect(st.stage_errors[1].error).toMatch(/no Opus encoder/); expect(st.stage_errors[2].error).toMatch(/no Opus encoder/);
    expect(puts.map(([k]) => k.split('.').pop())).toEqual(['opus']);
  });
});
