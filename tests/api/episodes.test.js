// episodes — a predigested history's own headings as episode boundaries: own spans (no paragraph in two episodes),
// narrative only (first Chapter on, back matter off), chapter labels, and participants checked against the text.
import { describe, it, expect } from 'vitest';
import { episodesFromSections, ownSpans, verifyParticipants } from '../../api/lib/episodes.js';

const sec = (ord, level, title, start_index, end_index) => ({ section_id: 100 + ord, ord, level, title, start_index, end_index });

describe('episodes from a book’s headings', () => {
  // the shape of The Dawn-Breakers: CHAPTER I and its title heading share one range; lettered sub-scenes; an Epilogue
  const DB = [sec(0, 2, 'INTRODUCTION', 0, 90), sec(1, 1, 'CHAPTER I', 96, 146), sec(2, 2, 'THE MISSION OF SHAYKH AḤMAD', 96, 146),
    sec(3, 3, 'His visit to Najaf', 96, 97), sec(4, 3, 'His stay in Yazd', 103, 110), sec(5, 4, 'a. His correspondence', 103, 103),
    sec(6, 4, 'b. His relations', 105, 105), sec(7, 3, 'The anecdote of Shaykh Ḥasan', 128, 146), sec(8, 4, 'b. The Báb’s attendance', 130, 130),
    sec(9, 3, 'References to the mother and to the wife of the Báb', 140, 140), sec(10, 1, 'EPILOGUE', 1408, 1423), sec(11, 2, 'NOTES', 1424, 1500)];
  const eps = episodesFromSections(DB);
  it('narrative only: the introduction and the notes are not episodes', () => {
    expect(eps.map((e) => e.title)).not.toContain('INTRODUCTION');
    expect(eps.map((e) => e.title)).not.toContain('NOTES');
    expect(eps.at(-1)).toMatchObject({ title: 'EPILOGUE', chapter: 'EPILOGUE', spans: [[1408, 1423]] });
    expect(eps.map((e) => e.title)).toContain('References to the mother and to the wife of the Báb');   // a 'References…' episode is not back matter
  });
  it('own spans: a parent keeps only what its sub-scenes do not cover; the chapter number heading has none', () => {
    const by = Object.fromEntries(eps.map((e) => [e.title, e]));
    expect(by['CHAPTER I']).toBeUndefined();
    expect(by['His stay in Yazd'].spans).toEqual([[104, 104], [106, 110]]);
    expect(by['The anecdote of Shaykh Ḥasan'].spans).toEqual([[128, 129], [131, 146]]);
    expect(by['b. The Báb’s attendance']).toMatchObject({ spans: [[130, 130]], chapter: 'CHAPTER I · THE MISSION OF SHAYKH AḤMAD',
      path: 'CHAPTER I › THE MISSION OF SHAYKH AḤMAD › The anecdote of Shaykh Ḥasan › b. The Báb’s attendance' });
  });
  it('God Passes By shape: Foreword out, Retrospect and Prospect in as its own part', () => {
    const g = episodesFromSections([sec(0, 3, 'Foreword', 0, 10), sec(1, 2, 'Chapter I', 12, 34), sec(2, 3, 'Declaration of the Báb’s Mission', 14, 17),
      sec(3, 2, 'Retrospect and Prospect', 772, 786)]);
    expect(g.map((e) => [e.title, e.chapter])).toEqual([['Chapter I', 'Chapter I'], ['Declaration of the Báb’s Mission', 'Chapter I'], ['Retrospect and Prospect', 'Retrospect and Prospect']]);
    expect(g[0].spans).toEqual([[12, 13], [18, 34]]);
  });
  it('no chapter heading → no episodes (not a predigested history)', () => expect(episodesFromSections([sec(0, 2, 'Part One', 0, 9)])).toEqual([]));
  it('ownSpans with no children is the whole range; a stray child past the end adds nothing', () => {
    expect(ownSpans(sec(0, 3, 'x', 5, 9))).toEqual([[5, 9]]);
    expect(ownSpans(sec(0, 3, 'x', 5, 9), [sec(1, 4, 'y', 20, 30)])).toEqual([[5, 9]]);
  });
});

describe('participants are checked against the episode’s own text', () => {
  it('a name must appear in the text (diacritics, case, apostrophes folded); invented names are dropped', () => {
    const text = 'Ṭáhirih appeared before the assembled companions; Quddús rose. Bahá’u’lláh called for the Súrih.';
    const { kept, dropped } = verifyParticipants([{ name: 'Tahirih' }, { name: 'Quddus' }, { name: 'Baha’u’llah' }, { name: 'Mullá Ḥusayn' }], text);
    expect(kept.map((p) => p.name)).toEqual(['Tahirih', 'Quddus', 'Baha’u’llah']);
    expect(dropped.map((p) => p.name)).toEqual(['Mullá Ḥusayn']);
  });
});
