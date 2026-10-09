import { describe, it, expect } from 'vitest';
import { selectFacts, parseTimeline, citedSources, timelinePrompt, yearOf } from '../../api/lib/bio-timeline.js';

const fact = (quote, when, source = 'Release the Sun', proof = null) => ({ quote, when, source, proof });

describe('selectFacts', () => {
  it('dedupes, skips aliases, keys in date order', () => {
    const f = selectFacts([
      fact('Ṭáhirih — born in Qazvín', '1817 [stated]', 'The Dawn-Breakers'),
      fact('Ṭáhirih — born in Qazvín', '1817 [pin]'),
      { quote: 'Ṭáhirih — also-known-as Qurratu’l-‘Ayn', relation: 'also-known-as' },
      fact('Ṭáhirih — attended Badasht', '1848 [stated]'),
    ]);
    expect(f.map((x) => x.key)).toEqual(['f1', 'f2']);
    expect(f[0].spine).toBe(true);
    expect(f[1].year).toBe(1848);
  });
  it('spreads the cap across years', () => {
    const many = Array.from({ length: 50 }, (_, i) => fact(`X — event ${i} at Badasht`, '1848 [pin]'));
    const f = selectFacts([...many, fact('X — died', '1852 [stated]'), fact('X — born', '1817 [stated]')], { cap: 6 });
    expect(f.map((x) => x.year)).toEqual(expect.arrayContaining([1817, 1852]));
    expect(f).toHaveLength(6);
  });
});

describe('parseTimeline', () => {
  const facts = selectFacts([
    fact('T — born in Qazvín', '1817 [stated]', 'The Dawn-Breakers', 'She was born in Qazvín in the year 1817'),
    fact('T — martyred', '1852 [stated]', 'God Passes By', 'You can kill me as soon as you like'),
  ]);
  it('drops unknown cites and invented quotes, keeps verbatim ones, sorts by year', () => {
    const out = parseTimeline('```json\n' + JSON.stringify({
      events: [
        { date: '1852 Aug', title: 'Martyrdom', text: 'Strangled in Ṭihrán.', cites: ['f2', 'f99'], quote: 'You can kill me as soon as you like', quote_cite: 'f2' },
        { date: '1817', title: 'Birth', text: 'Born in Qazvín.', cites: ['f1'], quote: 'words she never said', quote_cite: 'f1' },
        { date: '1830', title: 'Invented', text: 'No source.', cites: ['f42'] },
      ],
      relationships: [{ who: 'Mullá Taqí', type: 'enemy-ish', note: 'uncle', cites: ['f1'] }, { who: 'Nobody', type: 'family', cites: [] }],
      journeys: [{ place: 'Qazvín', year: '1817', cites: ['f1'] }],
    }) + '\n```', facts);
    expect(out.events.map((e) => e.title)).toEqual(['Birth', 'Martyrdom']);
    expect(out.events[1].cites).toEqual(['f2']);
    expect(out.events[1].quote).toBe('You can kill me as soon as you like');
    expect(out.events[0].quote).toBeUndefined();
    expect(out.relationships).toEqual([{ who: 'Mullá Taqí', type: 'other', note: 'uncle', cites: ['f1'] }]);
    expect(Object.keys(citedSources(out, facts))).toEqual(['f1', 'f2']);
  });
  it('returns null on non-JSON', () => expect(parseTimeline('sorry', facts)).toBeNull());
});

it('prompt carries person, kin and keyed facts', () => {
  const [sys, user] = timelinePrompt({ name: 'Ṭáhirih', kinship: [{ relation: 'father', who: 'Mullá Ṣáliḥ' }] }, selectFacts([fact('T — born', '1817 [stated]')]));
  expect(sys.content).toMatch(/JSON only/);
  expect(user.content).toMatch(/PERSON: Ṭáhirih[\s\S]*father: Mullá Ṣáliḥ[\s\S]*f1 \| 1817/);
  expect(yearOf('c. 1817')).toBe(1817);
});
