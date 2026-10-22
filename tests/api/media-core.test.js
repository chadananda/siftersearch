// Media library pure core: names/slugs from paths, time ranges, waveform peaks, paragraphs from aligned words, and the
// controlled-vocabulary corrector's guard (names and terms only — never rewording).
import { describe, it, expect } from 'vitest';
import { parseMediaPath, makeSlug, uniqueSlug, dateIn, slugify } from '../../api/lib/media/names.js';
import { parseTime, parseRange, rangeFrom, clampClip, formatTime, rangeParam } from '../../api/lib/media/range.js';
import { computePeaks, normalizePeaks } from '../../api/lib/media/peaks.js';
import { toParagraphs, flattenWords, paragraphText, endsSentence, assignSpeakers, smoothTurns } from '../../api/lib/media/paragraphs.js';
import { buildVocab, exactEdits, guardEdits, applyEdits, suspects, keyOf, soundsAlike, promptTerms } from '../../api/lib/media/vocab.js';

describe('names', () => {
  it('reads speaker, title, date from the archive naming patterns', () => {
    expect(parseMediaPath("Nakhjavani Various/Nakhjavani - The Prayerful Attitude - 1996 11 22.mp3"))
      .toMatchObject({ speaker: 'Nakhjavani', title: 'The Prayerful Attitude', date: '1996-11-22', year: 1996, collection: 'Nakhjavani Various' });
    expect(parseMediaPath('Taherzadeh Revelation of Baha\'u\'llah/Taherzadeh - Revelation of Baha\'u\'llah 2 - 1994 12 25.mp3'))
      .toMatchObject({ speaker: 'Taherzadeh', title: "Revelation of Baha'u'llah", part: 2, year: 1994 });
    expect(parseMediaPath("sharaf's talks/William Sears/Prophecies Fulfilled by Baha'u'llah/William_Sears__Prophecies.03.mp3"))
      .toMatchObject({ speaker: 'William Sears', title: 'Prophecies', part: 3, series: "Prophecies Fulfilled by Baha'u'llah" });
    expect(parseMediaPath('Sabri Iqan/Sabri, H. - Rendezvous of the Soul - 1992 10 14.mp3')).toMatchObject({ speaker: 'Sabri, H.', title: 'Rendezvous of the Soul' });
    expect(parseMediaPath('Discourse.mp3')).toMatchObject({ title: 'Discourse', speaker: null, collection: null });
  });
  it('finds dates in many spellings; the recording year is the last one', () => {
    expect(dateIn('Hooper Dunbar-Medford OR 20120623-1')).toEqual({ date: '2012-06-23', year: 2012 });
    expect(dateIn('Dr Elsie Austin Knight Morocco 23 Nov 1973 70min10s')).toEqual({ date: '1973-11-23', year: 1973 });
    expect(dateIn('1952 ARC  T- 1199. Ted Cardell Experiences With The Guardian, Aug 1988').year).toBe(1988);
    expect(dateIn('1922 Catharine Nourse c1961 MP3 49MIN').year).toBe(1961);
    expect(dateIn('no date here').year).toBeNull();
  });
  it('slugs are ASCII, stable and unique', () => {
    expect(makeSlug({ speaker: 'Nakhjavání', title: 'The Prayerful Attitude', year: 1996 })).toBe('nakhjavani-the-prayerful-attitude-1996');
    expect(makeSlug({ speaker: '‘Alí-Akbar Furútan', title: 'Talk to the Youth', year: 1992 })).toBe('furutan-talk-to-the-youth-1992');
    expect(makeSlug({ title: 'Bahá’u’lláh and the New Era' })).toBe('bahaullah-and-the-new-era');
    expect(makeSlug({ title: 'Includes Martha Root, November 1932', year: 1932 })).toBe('includes-martha-root-november-1932');
    expect(uniqueSlug('a', new Set(['a', 'a-2']))).toBe('a-3');
    expect(slugify('x'.repeat(200)).length).toBeLessThanOrEqual(80);
  });
});

describe('range', () => {
  it('parses seconds, clock and h/m/s forms', () => {
    expect(parseTime('754')).toBe(754);
    expect(parseTime('12:34')).toBe(754);
    expect(parseTime('1:02:03')).toBe(3723);
    expect(parseTime('1h2m3s')).toBe(3723);
    expect(parseTime('2m')).toBe(120);
    expect(parseTime('abc')).toBeNull();
  });
  it('parses ranges from ?t= and #t= and refuses nonsense', () => {
    expect(parseRange('754-812')).toEqual({ start: 754, end: 812 });
    expect(parseRange('754,812')).toEqual({ start: 754, end: 812 });
    expect(parseRange('12:34-13:32')).toEqual({ start: 754, end: 812 });
    expect(parseRange('812-754')).toEqual({ start: 812, end: null });
    expect(parseRange('')).toBeNull();
    expect(rangeFrom({ search: '?t=10-20', hash: '#t=30' })).toEqual({ start: 10, end: 20 });
    expect(rangeFrom({ search: '', hash: '#t=30,40' })).toEqual({ start: 30, end: 40 });
  });
  it('clamps a clip to the item and the cap', () => {
    expect(clampClip({ start: 100, end: 1000 }, 2000, 180)).toEqual({ start: 100, end: 280 });
    expect(clampClip({ start: 1990, end: null }, 2000, 180)).toEqual({ start: 1990, end: 2000 });
    expect(formatTime(3723)).toBe('1:02:03');
    expect(formatTime(754)).toBe('12:34');
    expect(rangeParam(754, 812)).toBe('754-812');
  });
});

describe('peaks', () => {
  it('BBC v2 shape, min/max per pixel, 8-bit', () => {
    const sr = 100, x = new Float32Array(200).map((_, i) => (i < 100 ? 0.5 : -1));
    const p = computePeaks(x, sr, { pixelsPerSecond: 1 });
    expect(p).toMatchObject({ version: 2, channels: 1, sample_rate: 100, samples_per_pixel: 100, bits: 8, length: 2 });
    expect(p.data).toEqual([0, 64, -127, 0]);
    expect(Math.max(...normalizePeaks({ ...p, data: [0, 10, -5, 0] }).data)).toBe(127);
  });
});

const seg = (s, e, text, spk = 'S1') => {
  const toks = text.split(' '); const d = (e - s) / toks.length;
  return { s, e, text, spk, words: toks.map((w, i) => ({ w, s: s + i * d, e: s + (i + 1) * d, spk })) };
};

describe('paragraphs', () => {
  it('fills missing word times and keeps every word', () => {
    const w = flattenWords([{ s: 0, e: 4, text: 'a b c d', words: [{ w: 'a', s: 0, e: 1 }, { w: 'b' }, { w: 'c' }, { w: 'd', s: 3, e: 4 }] }]);
    expect(w.map((x) => [x.s, x.e])).toEqual([[0, 1], [1, 2], [2, 3], [3, 4]]);
    expect(flattenWords([{ s: 0, e: 2, text: 'no words here' }]).length).toBe(3);
  });
  it('breaks on speaker change and long pauses, never mid-sentence', () => {
    const long = Array.from({ length: 45 }, (_, i) => `w${i}`).join(' ') + '.';
    const ps = toParagraphs([seg(0, 20, long), seg(25, 30, 'After a pause.'), seg(30, 35, 'Question from the floor?', 'S2'), seg(35, 40, 'Answer here.', 'S1')]);
    expect(ps.map((p) => p.spk)).toEqual(['S1', 'S1', 'S2', 'S1']);
    expect(paragraphText(ps[1])).toBe('After a pause.');
    expect(ps[2].t0).toBe(30);
    expect(ps[0].sentences).toEqual([[0, 45]]);
  });
  it('a chapter start begins a new paragraph', () => {
    const ps = toParagraphs([seg(0, 5, 'One. Two.'), seg(5, 10, 'Three. Four.')], { chapters: [5] });
    expect(ps.length).toBe(2);
  });
  it('speaker turns land on the segments and words they overlap most', () => {
    const out = assignSpeakers([seg(0, 4, 'one two three four', null), seg(4, 8, 'five six', null)], [{ start: 0, end: 2.9, speaker: 'S1' }, { start: 2.9, end: 9, speaker: 'S2' }]);
    expect(out.map((s) => s.spk)).toEqual(['S1', 'S2']);
    expect(out[0].words.map((w) => w.spk)).toEqual(['S1', 'S1', 'S1', 'S2']);
    expect(assignSpeakers([seg(0, 1, 'x', 'S9')], [])[0].spk).toBe('S9');
  });
  it('abbreviations do not end sentences', () => {
    expect(endsSentence('Dr.')).toBe(false);
    expect(endsSentence('end."')).toBe(true);
  });
});

describe('vocabulary corrector', () => {
  const vocab = buildVocab();
  const words = (t) => t.split(' ').map((w, i) => ({ w, s: i, e: i + 1 }));
  it('folds spellings to one key', () => {
    expect(keyOf('Bahá’u’lláh')).toBe(keyOf("Baha'u'llah"));
    expect(keyOf('‘Abdu’l-Bahá')).toBe(keyOf('Abdul Baha'));
  });
  it('the safe pass restores marks on known names only', () => {
    const w = words("Then Baha'u'llah's tablet reached Abdul Baha in Akka. The master said");
    const e = exactEdits(w, vocab);
    expect(e.map((x) => x.to)).toEqual(['Bahá’u’lláh', '‘Abdu’l-Bahá', '‘Akká']);
    const out = applyEdits(w, e).map((x) => x.w).join(' ');
    expect(out).toBe('Then Bahá’u’lláh’s tablet reached ‘Abdu’l-Bahá in ‘Akká. The master said');
  });
  it('corrected words keep the span time', () => {
    const w = words('reached Abdul Baha today');
    const out = applyEdits(w, exactEdits(w, vocab));
    expect(out[1]).toMatchObject({ w: '‘Abdu’l-Bahá', s: 1, e: 3 });
    expect(out[2]).toMatchObject({ w: 'today', s: 3 });
  });
  it('the guard refuses rewording, non-vocabulary and far-fetched edits', () => {
    const w = words('the story of Mulla Husein and Tahira at Bedasht was told');
    const { ok, refused } = guardEdits(w, [
      { from: 'Mulla Husein', to: 'Mullá Ḥusayn' },
      { from: 'Tahira', to: 'Ṭáhirih' },
      { from: 'Bedasht', to: 'Badasht' },
      { from: 'was told', to: 'was recounted' },          // rewording
      { from: 'story', to: 'Riḍván' },                    // not alike
      { from: 'absent words', to: 'Quddús' },             // not in text / not alike
      { from: 'the story of Mulla Husein and', to: 'Mullá Ḥusayn' },   // too long
    ], vocab);
    expect(ok.map((e) => e.to)).toEqual(['Mullá Ḥusayn', 'Ṭáhirih', 'Badasht']);
    expect(refused.map((r) => r.why)).toEqual(['not in the vocabulary', 'does not sound alike', 'does not sound alike', 'more than four words']);
    expect(soundsAlike('Shoghi Effendi', 'Shoghi Effendi')).toBe(true);
  });
  it('suspects are name-like runs near a vocabulary term', () => {
    const s = suspects(words('then Kuddus and Tahirah went to Badasht'), vocab);
    expect(s.map((x) => x.from)).toContain('Kuddus');
    expect(s.find((x) => x.from === 'Kuddus').candidates).toContain('Quddús');
  });
  it('prompt terms put the item\'s own names first', () => {
    const t = promptTerms({ title: 'Revelation of Baha\'u\'llah', speaker: 'Taherzadeh' }, vocab);
    expect(t[0]).toBe('Bahá’u’lláh');
    expect(t.length).toBeLessThanOrEqual(45);
  });
});

describe('vocabulary suspects (pilot findings)', () => {
  it('offers the long name a speaker clipped ("Baola" → Bahá’u’lláh, not only Bahá)', () => {
    const v = buildVocab();
    const s = suspects([{ w: 'Baola', s: 0, e: 1 }, { w: 'says', s: 1, e: 2 }], v);
    expect(s[0].candidates).toContain('Bahá’u’lláh');
  });
});

describe('diarization smoothing', () => {
  it('folds fragment voices into their neighbours and keeps real ones', () => {
    const turns = [{ start: 0, end: 600, speaker: 'S1' }, { start: 600, end: 605, speaker: 'S9' }, { start: 605, end: 900, speaker: 'S1' }, { start: 900, end: 960, speaker: 'S2' }];
    expect(smoothTurns(turns).map((t) => t.speaker)).toEqual(['S1', 'S1', 'S1', 'S2']);
  });
});
