// episode-extract — one model call per episode, then code checks: participants not in the episode's text are dropped,
// citations outside the episode are reported, an A.H. year becomes Gregorian; heading/chapter/spans come from the book.
import { describe, it, expect } from 'vitest';
import { episodeExtractJob, extractEpisode, ahToCe, episodePrompt } from '../../api/lib/ops/episode-extract-job.js';

const sections = async () => [
  { section_id: 1, ord: 0, level: 1, title: 'CHAPTER XVI', start_index: 550, end_index: 563 },
  { section_id: 2, ord: 1, level: 3, title: 'Their arrival at Badasht', start_index: 550, end_index: 553 },
  { section_id: 3, ord: 2, level: 4, title: 'a. Significance of the gathering in Badasht', start_index: 552, end_index: 553 },
];
const TEXT = { 550: 'Bahá’u’lláh rented three gardens at Badasht.', 551: 'Quddús occupied one; Ṭáhirih another.', 552: 'Ṭáhirih appeared unveiled before the companions.', 553: 'The gathering lasted twenty-two days in 1264 A.H.' };
const paragraphs = async (doc, spans) => spans.flatMap(([a, b]) => Array.from({ length: b - a + 1 }, (_, k) => a + k)).filter((i) => TEXT[i]).map((i) => ({ id: 9000 + i, paragraph_index: i, text: TEXT[i] }));
const reply = (o) => async () => ({ choices: [{ message: { content: `Here: ${JSON.stringify(o)}` } }] });

describe('episode extract', () => {
  it('A.H. → Gregorian', () => { expect(ahToCe(1264)) .toBe(1848); expect(ahToCe(1260)).toBe(1844); });
  it('the prompt carries the heading, the chapter and numbered paragraphs', () => {
    const p = episodePrompt('The Dawn-Breakers', { title: 'Their arrival at Badasht', chapter: 'CHAPTER XVI', path: 'x' }, [{ paragraph_index: 550, text: 'T' }]);
    expect(p).toContain('Heading: Their arrival at Badasht'); expect(p).toContain('[¶550] T');
  });
  it('checks the model: invented participant dropped, stray citation reported, A.H. year converted', async () => {
    const r = await extractEpisode('The Dawn-Breakers', { title: 'a', chapter: 'c', path: 'p' }, await paragraphs(0, [[552, 553]]), {
      create: reply({ place: 'Badasht', when: '1264 A.H.', year: { ah: 1264 }, summary: 'Ṭáhirih appeared unveiled [¶552]. Quddús left [¶599].',
        participants: [{ name: 'Ṭáhirih', role: 'actor' }, { name: 'Mullá Ḥusayn', role: 'present' }], events: ['unveiling'], questions: ['Who appeared unveiled at Badasht?'] }) });
    expect(r.participants.map((p) => p.name)).toEqual(['Ṭáhirih']);
    expect(r.dropped.map((p) => p.name)).toEqual(['Mullá Ḥusayn']);
    expect(r.year_start).toBe(1848);
    expect(r.issues.join(' ')).toMatch(/outside the episode: 599/);
  });
  it('a run saves each episode with its own spans and paragraph ids', async () => {
    const saved = [];
    const stats = await episodeExtractJob({ doc: 21308 }, { sections, paragraphs, save: async (e) => saved.push(e),
      create: reply({ place: 'Badasht', summary: 'They arrived [¶550].', participants: [{ name: 'Quddús', role: 'actor' }], events: [], questions: [] }) });
    expect(saved.map((e) => [e.title, e.spans, e.para_ids])).toEqual([['Their arrival at Badasht', [[550, 551]], [9550, 9551]],
      ['a. Significance of the gathering in Badasht', [[552, 553]], [9552, 9553]]]);
    expect(stats).toMatchObject({ episodes: 3, done: 2 });   // the chapter's own span (554-563) has no live paragraphs here
  });
});
