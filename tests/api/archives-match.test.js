import { describe, it, expect } from 'vitest';
import { recommend } from '../../api/lib/archives/match.js';

const it1 = (kind, sug, o = {}) => ({ kind, year: null, duration_s: null, files: 1, metadata: { sug }, ...o });

describe('recommend', () => {
  it('maps suggestions', () => {
    expect(recommend(it1('book', 'duplicate')).match).toBe('held');
    expect(recommend(it1('book', 'version')).match).toBe('version');
    expect(recommend(it1('book', 'excluded')).match).toBe('junk');
    expect(recommend(it1('book', null)).match).toBe('unsure');
  });
  it('orders new > version > unsure > held > junk', () => {
    const s = ['new', 'version', 'unsure', 'duplicate', 'excluded'].map((x) => recommend(it1('book', x)).score);
    expect(s).toEqual([...s].sort((a, b) => b - a)); expect(new Set(s).size).toBe(5);
  });
  it('early years and talks boost; why is concrete', () => {
    const r = recommend(it1('talk', 'new', { year: 1953, duration_s: 47 * 60 }));
    expect(r.why).toBe('Not in the library; 1953 recording, 47 min.');
    expect(r.destination).toBe('media pipeline (remaster, /media)');
    expect(r.score).toBeGreaterThan(recommend(it1('talk', 'new', { year: 1985, duration_s: 47 * 60 })).score);
    expect(recommend(it1('book', 'new', { year: 1920 })).score).toBeGreaterThan(recommend(it1('scan', 'new', { year: 1920, files: 9 })).score);
  });
  it('destinations; junk scores 0', () => {
    expect(recommend(it1('scan', 'new')).destination).toBe('OCR then Dewey book intake');
    expect(recommend(it1('photo-set', 'new')).destination).toBe('photo archive (not yet decided)');
    expect(recommend(it1('junk', null))).toMatchObject({ score: 0, destination: 'not imported', match: 'junk' });
  });
});
