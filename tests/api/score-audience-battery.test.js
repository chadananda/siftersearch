// Pure helpers of tests/quality/score-audience-battery.mjs (link detection, quote extraction, win/tie, rollup). No network.
import { describe, it, expect } from 'vitest';
import { links, linkedWork, quotes, winTie, rollup, scoreCase } from '../quality/score-audience-battery.mjs';

const DB = 'https://oceanlibrary.com/dawn-breakers_nabil/?paraId=para_253';
const GOTH = 'https://siftersearch.com/library/bahai/bahai-books/nader-saiedi_gate-of-the-heart-understanding-the-writings-of-the-bab#p12';

describe('linkedWork', () => {
  it('finds the work by slug in a markdown link', () => {
    expect(linkedWork(`See ([The Dawn-Breakers](${DB})).`, 'dawn-breakers')).toMatchObject({ linked: true, status: 'linked' });
    expect(linkedWork(`Saiedi writes ([Gate of the Heart](${GOTH})).`, 'gate-of-the-heart').linked).toBe(true);
  });
  it('a bare mention is named-only; another book is missing', () => {
    expect(linkedWork('As *The Dawn-Breakers* tells it ([God Passes By](https://oceanlibrary.com/god-passes-by_shoghi-effendi/)).', 'dawn-breakers').status).toBe('named-only');
    expect(linkedWork('([The Bahá\'í World](https://siftersearch.com/library/x#p6995))', 'dawn-breakers').status).toBe('missing');
  });
  it('links() parses label and url', () => {
    expect(links(`a ([T](${DB})) b`)).toEqual([{ label: 'T', url: DB }]);
  });
});

describe('quotes', () => {
  it('keeps ≥6-word quoted runs, curly or straight, deduped, and ignores link labels', () => {
    const t = 'He said "I seemed to be the Voice of Gabriel personified, calling unto all mankind" and “too short here”. ' +
      'Again "I seemed to be the Voice of Gabriel personified, calling unto all mankind". ([“A quoted link label that is long enough”](https://x))';
    expect(quotes(t)).toEqual(['I seemed to be the Voice of Gabriel personified, calling unto all mankind']);
    // a short quote's closing mark must not open a fake quote running to the next opening mark
    expect(quotes('the "sifter of wheat" of Iṣfahán. Through that close association he became known as "the first to believe in the Báb in that city"')).toEqual(['the first to believe in the Báb in that city']);
  });
  it('a quote the search misses is still verbatim when the expected work contains it', async () => {
    const search = async () => ({ coverage: 0 });
    const q = { type: 'goth-concept', extra: { work: 'gate-of-the-heart' } };
    const c = { id: 'g', answers: { current: { text: 'Saiedi: "the Point possesseth two stations one of which speaketh from God"' } }, verdict: null };
    const row = await scoreCase(c, q, { search, work: 'Verily the Point possesseth two stations one of which speaketh from God and the other' });
    expect(row.quotes[0]).toMatchObject({ status: 'verbatim', doc: 8632 });
  });
});

describe('winTie / rollup', () => {
  const v = (a, p) => ({ scores: { current: { score: a }, perplexity: { score: p } } });
  it('win, tie, loss, unjudged', () => {
    expect(winTie(v(9, 6))).toBe('win');
    expect(winTie(v(7, 7))).toBe('tie');
    expect(winTie(v(5, 8))).toBe('loss');
    expect(winTie({ error: 'Connection error.', scores: {} })).toBe(null);
  });
  it('rollup counts per type and flags invented quotes', async () => {
    const search = async (q) => ({ coverage: q.startsWith('real') ? 1 : 0.1, doc: 21308 });
    const q = { type: 'who-was', extra: { work: 'dawn-breakers' } };
    const mk = (id, text, verdict) => ({ id, kind: 'x', messages: [{ role: 'user', content: 'q' }], answers: { current: { text } }, verdict });
    const rows = [
      await scoreCase(mk('a', `([The Dawn-Breakers](${DB})) "real words one two three four five six"`, v(9, 6)), q, { search }),
      await scoreCase(mk('b', '"fake words one two three four five six"', v(4, 8)), q, { search }),
    ];
    expect(rows[1].quotes[0].status).toBe('invented');
    expect(rows[0].quotes[0].status).toBe('verbatim');
    expect(rollup(rows)[0]).toMatchObject({ type: 'who-was', n: 2, judged: 2, winTie: 1, winTiePct: 0.5, linked: 1, invented: 1, anis: 6.5, px: 7 });
  });
});
