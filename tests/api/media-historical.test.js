// Historical perspective per speaker (Chad 10-23): the data tags every person; first-hand speakers (Hands, ITC pre-1988,
// the 1963 House) rank beside the Hands; a surname alone never matches; the ITC members are in the data.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { historicalIndex, historicalTier } from '../../api/lib/media/historical.js';
import { rankFor, rankOf } from '../../api/lib/ops/media-jobs.js';

const people = JSON.parse(readFileSync(new URL('../../data/media-speaker-people.json', import.meta.url), 'utf8')).people;
const of = historicalIndex(people);

describe('historical tags', () => {
  it('every person carries one of first-hand / historian / modern', () => {
    for (const p of people) expect(['first-hand', 'historian', 'modern'], p.key).toContain(p.historical);
  });
  it('the ITC Counsellors appointed before 1988 are first-hand, by name form', () => {
    for (const n of ['Florence Mayberry', 'Aziz Yazdi', 'Anneliese Bopp', 'Magdalene Carney', 'Khamsi, Masud', 'Sabri, I.', 'Isobel Sabri', 'Peter J. Khan', 'Hooper C. Dunbar']) {
      expect(of(n)?.historical, n).toBe('first-hand');
    }
    expect(people.filter((p) => /ITC pre-1988/.test(p.historical_basis || '')).map((p) => p.key).sort())
      .toEqual(['anneliese-bopp', 'aziz-yazdi', 'florence-mayberry', 'hooper-dunbar', 'isobel-sabri', 'magdalene-carney', 'masud-khamsi', 'peter-khan']);
  });
  it('a surname alone, or another Sabri, does not match', () => {
    expect(of('Sabri')).toBeNull();
    expect(of('Sabri, H.')).toBeNull();
    expect(of('Khan')).toBeNull();
  });
  it('an explicit exclusion is never first-hand (Arbab joined the ITC in 1988; excluded wins)', () => {
    for (const p of people.filter((x) => x.exclude)) expect(p.historical, p.key).toBe('modern');
  });
});

describe('queue rank', () => {
  it('first-hand rises to the Hands tier, modern drops to the last', () => {
    expect(historicalTier(4, 'first-hand')).toBe(2);
    expect(historicalTier(1, 'first-hand')).toBe(1);
    expect(historicalTier(4, 'modern')).toBe(5);
    expect(historicalTier(3, 'historian')).toBe(3);
  });
  it('a local talk by an ITC Counsellor ranks ahead of an untagged local speaker of the same year', async () => {
    const role = () => 'scholar';
    const itc = await rankFor({ source_kind: 'file', rel: "Baha'i/talks/Khamsi Various/Khamsi, Masud - Teaching in Latin America - 1988 05 09.mp3", speaker: 'Khamsi, Masud', year: 1988, id: 9 }, new Map(), role, of);
    const other = await rankFor({ source_kind: 'file', rel: "Baha'i/talks/X/Someone Else - A Talk - 1988 05 09.mp3", speaker: 'Someone Else', year: 1988, id: 9 }, new Map(), role, of);
    expect(Math.floor(itc / 1e7)).toBe(2);
    expect(itc).toBeLessThan(other);
    expect(other).toBe(rankOf(4, 1988, 9));
  });
});
