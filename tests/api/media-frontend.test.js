// src/lib/media.js — the /media pages' pure helpers (query ↔ URL, word lookup, quote segments, speaker turns, waveform).
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { filtersFromParams, pageQuery, apiQuery, flattenWords, wordAt, paragraphSegments, speakerLabels, youtubeAtTime, waveformBars, mediaFile } from '../../src/lib/media.js';

const item = JSON.parse(readFileSync(new URL('../fixtures/media-item.json', import.meta.url), 'utf8'));

describe('listing query', () => {
  it('reads filters from URL params and drops unknown buckets/sorts', () => {
    const f = filtersFromParams(new URLSearchParams('speaker=Hartmut%20Grossmann&dur=bogus&sort=title&hasVideo=1&x=1'));
    expect(f.speaker).toBe('Hartmut Grossmann');
    expect(f.dur).toBe('');
    expect(f.sort).toBe('title');
    expect(f.hasVideo).toBe('1');
  });
  it('page query omits empties and the default sort', () => {
    expect(pageQuery({ q: 'love', sort: 'recent', speaker: '' })).toBe('q=love');
  });
  it('api query maps the duration bucket to seconds', () => {
    const p = new URLSearchParams(apiQuery({ dur: 'medium', year: '1999' }, { limit: 24, offset: 48 }));
    expect(p.get('minDur')).toBe('900');
    expect(p.get('maxDur')).toBe('2700');
    expect(p.get('year')).toBe('1999');
    expect(p.get('offset')).toBe('48');
    expect(p.get('dur')).toBeNull();
  });
  it('file urls are encoded under the item', () => {
    expect(mediaFile('a-b', 'thumb.jpg')).toBe('/api/media/a-b/file/thumb.jpg');
  });
});

describe('word lookup', () => {
  const flat = flattenWords(item.paragraphs);
  it('flattens every word in reading order', () => {
    expect(flat.length).toBe(item.paragraphs.reduce((a, p) => a + p.words.length, 0));
    expect(flat.para[flat.length - 1]).toBe(2);
  });
  it('finds the word playing at t (binary search)', () => {
    expect(wordAt(flat.starts, 0.1)).toBe(-1);
    expect(wordAt(flat.starts, 0.5)).toBe(0);
    expect(wordAt(flat.starts, 1.0)).toBe(1);
    expect(wordAt(flat.starts, 20)).toBe(23);   // gap after "Guardian?" stays on it
    expect(wordAt(flat.starts, 9999)).toBe(flat.length - 1);
  });
});

describe('paragraph segments', () => {
  it('splits around a quote span (i1 exclusive)', () => {
    const segs = paragraphSegments(20, [{ i0: 6, i1: 17 }]);
    expect(segs.map((s) => [s.i0, s.i1, !!s.quote])).toEqual([[0, 6, false], [6, 17, true], [17, 20, false]]);
  });
  it('clips overlaps and ignores empty spans', () => {
    const segs = paragraphSegments(10, [{ i0: 2, i1: 5 }, { i0: 4, i1: 8 }, { i0: 9, i1: 9 }]);
    expect(segs.map((s) => [s.i0, s.i1, !!s.quote])).toEqual([[0, 2, false], [2, 5, true], [5, 8, true], [8, 10, false]]);
  });
});

describe('speaker labels', () => {
  it('labels voice changes with the mapped name', () => {
    expect(speakerLabels(item.paragraphs, item.speakers)).toEqual(['Hartmut Grossmann', 'Questioner', 'Hartmut Grossmann']);
  });
  it('no labels with a single voice', () => {
    expect(speakerLabels([{ spk: 'S1' }, { spk: 'S1' }], {})).toEqual([null, null]);
  });
});

describe('misc', () => {
  it('youtube link opens at the time', () => {
    expect(youtubeAtTime('https://www.youtube.com/watch?v=abc', 754.6)).toBe('https://www.youtube.com/watch?v=abc&t=754s');
    expect(youtubeAtTime('https://www.youtube.com/watch?v=abc&t=5s', 0)).toBe('https://www.youtube.com/watch?v=abc');
  });
  it('waveform bars are normalised peaks', () => {
    const bars = waveformBars({ data: [-10, 10, -50, 100, -5, 5, -20, 20], channels: 1 }, 2);
    expect(bars).toHaveLength(2);
    expect(bars[0]).toBe(1);
    expect(bars[1]).toBeCloseTo(0.2);
  });
});
