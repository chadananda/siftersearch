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
  it('a covenant-breaker item says whose and whether it predates the break', () => {
    const r = recommend(it1('book', 'import', { year: 1923, metadata: { sug: 'import', cb: { name: 'Ahmad Sohrab', broke: 1929, before: true } } }));
    expect(r.why).toMatch(/By Ahmad Sohrab, who broke the Covenant c\. 1929: written before the break\./);
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
  it('reads the catalogue verdict from its reason (archive-sifter writes sug import/look/skip)', () => {
    const w = (why, sug = 'skip') => recommend(it1('talk', sug, { metadata: { sug, catalog_why: why } }));
    expect(w('new', 'import').match).toBe('new');
    expect(w('new (bb variant)', 'import').match).toBe('new');
    expect(w('duplicate: library match by title/speaker/duration').match).toBe('held');
    expect(w('duplicate: identical size+duration inside drive')).toMatchObject({ match: 'copy', score: 0, destination: 'not imported' });
    expect(w('same bytes as X/y.mp3').match).toBe('copy');
    expect(w('excluded: under 60 s')).toMatchObject({ match: 'junk', why: 'System or unrecognised file; excluded: under 60 s.' });
    expect(w('version: same title, duration differs +605 s', 'look').match).toBe('version');
    expect(w('unsure: partial title match', 'look').match).toBe('unsure');
  });
  it('library title hit for books; copies on the drive are named', () => {
    const r = recommend(it1('book', null, { metadata: { lib: { match: 'held', title: 'The Kitáb-i-Íqán', id: 7 }, copies: 3 } }));
    expect(r).toMatchObject({ match: 'held', why: 'Already in the library (The Kitáb-i-Íqán #7); book, 3 copies on the drive.' });
    expect(recommend(it1('book', null, { metadata: { lib: { match: 'new' } } })).match).toBe('new');
  });
});
