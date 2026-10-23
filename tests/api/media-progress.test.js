// The Fireside Room's import readout and workbench helpers.
import { describe, it, expect } from 'vitest';
import { readout, etaText, stepTrack, elapsed, fmt } from '../../src/lib/media-progress.js';

const live = { total_targets: 1289, downloaded: 88, transcribed: 71, published: 68, failed: 3, items_per_hour: 11.3, eta_iso: '2026-10-27T13:27:52.252Z',
  by_source: [{ source: 'curated', label: 'Curated talks', total: 137, downloaded: 20, transcribed: 6, published: 5, failed: 1 }, { source: 'x', label: 'Empty', total: 0 }] };

describe('import readout', () => {
  it('shows the total and only the stages the payload carries', () => {
    const r = readout(live);
    expect(r.total).toBe(1289);
    expect(r.stages.map((s) => s.key)).toEqual(['downloaded', 'transcribed', 'published']);
    expect(r.stages[0].frac).toBeCloseTo(88 / 1289);
    expect(r.sources).toHaveLength(1);
    expect(r.sources[0].stages.find((s) => s.key === 'published').frac).toBeCloseTo(5 / 137);
    expect(readout({ ...live, aligned: 40, enhanced: 30, cross_referenced: 20 }).stages.map((s) => s.key)).toEqual(['downloaded', 'transcribed', 'aligned', 'enhanced', 'cross_referenced', 'published']);
    expect(readout({})).toBe(null); expect(readout(null)).toBe(null);
  });
  it('formats counts, ETA and elapsed time', () => {
    expect(fmt(1289)).toBe('1,289');
    expect(etaText(new Date('2026-10-27T13:00:00Z'), new Date('2026-10-23T00:00:00Z'))).toBe('all by Tue 27 Oct');
    expect(etaText(new Date('2026-10-01T00:00:00Z'), new Date('2026-10-23T00:00:00Z'))).toBe('');
    expect(elapsed('2026-10-23T00:00:00Z', Date.parse('2026-10-23T00:04:12Z'))).toBe('4 min 12 s');
    expect(elapsed('2026-10-23T00:00:00Z', Date.parse('2026-10-23T01:03:00Z'))).toBe('1 h 03 min');
    expect(elapsed('nope')).toBe('');
  });
  it('builds the step track, tolerating unknown states', () => {
    expect(stepTrack([{ name: 'download', state: 'done' }, { name: 'transcribe', state: 'running' }, { name: 'align', state: 'weird' }, null]))
      .toEqual([{ name: 'download', label: 'Download', state: 'done' }, { name: 'transcribe', label: 'Transcribe', state: 'running' }, { name: 'align', label: 'Align', state: 'pending' }]);
  });
});

import { tileOf, byTile, headline, TILES } from '../../src/lib/media-progress.js';
describe('process strip', () => {
  const st = (running) => [{ name: 'download', state: 'done' }, { name: 'enhance', state: running === 'enhance' ? 'running' : 'done' }, { name: 'crossref', state: running === 'crossref' ? 'running' : 'pending' }];
  it('puts each talk in the tile of its running step, else of its stage', () => {
    expect(tileOf({ stages: st('enhance') })).toBe('remaster');
    expect(tileOf({ stages: st('crossref') })).toBe('quotes');
    expect(tileOf({ stage: 'transcribe', stages: [] })).toBe('transcribe');
    expect(tileOf({ stage: 'archive' })).toBe('import');
    expect(tileOf({})).toBe('import');
    const m = byTile([{ slug: 'a', stages: st('enhance') }, { slug: 'b', stage: 'assess' }, null]);
    expect(m.get('remaster').map((x) => x.slug)).toEqual(['a']);
    expect(m.get('moments').map((x) => x.slug)).toEqual(['b']);
    expect([...m.keys()]).toEqual(TILES.map((t) => t.id));
  });
  it('reads the headline: on the air, processing, in progress, queued', () => {
    expect(headline({ total_targets: 1289, published: 72, downloaded: 90, items_per_hour: 12 })).toEqual({ total: 1289, published: 72, inProgress: 18, queued: 1199, perHour: 12, today: null });
  });
});
