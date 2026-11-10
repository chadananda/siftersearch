// Exit checks at the reply's one exit (lint.js formPass), battery 11-10 round 4: one citation = one link to one source,
// a quotation links its paragraph, the Uncompiled Published Letters cite last, unbalanced emphasis repaired.
import { describe, it, expect } from 'vitest';
import { formPass, citeLinks, lastResortLast } from '../../api/lib/assistant/lint.js';
import { markdownDefects } from '../../api/lib/assistant/md-valid.js';

const GL = 'https://oceanlibrary.com/gleanings-from-the-writings-of-bahaullah';
const GLP = `${GL}/?paraId=para_261&selectionString=g-a0.0~g-a0.721`;
const HW = 'https://oceanlibrary.com/hidden-words-of-bahaullah';

describe('citation links', () => {
  it('quote_trace: "[*Gleanings*](book) ([link](paragraph))" → the citation text is the paragraph link', () => {
    const t = `come from Tablet XLIII in [*Gleanings from the Writings of Bahá’u’lláh*](${GL}) ([link](${GLP})). The English is Shoghi Effendi's.`;
    const out = formPass(t).text;
    expect(out).toContain(`[*Gleanings from the Writings of Bahá’u’lláh*](${GLP})`);
    expect(out).not.toMatch(/\[link\]/);
  });
  it('a lone "[link]" takes its source title, else its host', () => {
    expect(citeLinks('in the original ([link](https://oceanoflights.org/bahaullah-pub01-33-fa/))').text).toBe('in the original ([oceanoflights.org](https://oceanoflights.org/bahaullah-pub01-33-fa/))');
    expect(citeLinks('also ([link](https://x.org/a))', [{ title: 'Bahá’í Sacred Writings', url: 'https://x.org/a' }]).text).toBe('also ([*Bahá’í Sacred Writings*](https://x.org/a))');
  });
  it('justice: a quotation linked to the whole book takes the paragraph holding it; its title stays on the quotation\'s site', () => {
    const para = `${HW}/?paraId=para_2`;
    const t = `[*"The best beloved of all things in My sight is Justice; turn not away therefrom if thou desirest Me"*](${HW}) — [*The Hidden Words*](https://bahai-library.com/bahaullah_hidden_words), Arabic #2.`;
    const out = citeLinks(t, [{ title: 'The Hidden Words', url: para, text: 'O SON OF SPIRIT! The best beloved of all things in My sight is Justice; turn not away therefrom if thou desirest Me, and neglect it not.' }]).text;
    expect(out).toContain(`](${para}) — [*The Hidden Words*](${HW}),`);
    expect(out).not.toContain('bahai-library.com');
  });
});

describe('last resort last', () => {
  it('timeline: the Uncompiled Published Letters move after the published works in a sources cell', () => {
    const row = '| 23 May 1844 | The Báb declares His mission | Shoghi Effendi, [*Uncompiled Published Letters*](https://oceanlibrary.com/uncompiled-published-letters_shoghi-effendi/?paraId=para_4601); [*Divine Philosophy*](https://oceanlibrary.com/divine-philosophy_abdul-baha) |';
    const out = lastResortLast(row).text;
    expect(out.indexOf('Divine Philosophy')).toBeLessThan(out.indexOf('Uncompiled'));
    expect(out).toMatch(/^\| 23 May 1844 \|.*\|$/);
    expect(lastResortLast('| a | [*X*](u); Shoghi Effendi, *Uncompiled Published Letters* |').fixed).toBe(0);
  });
});

describe('emphasis repair', () => {
  it('general_research: a quote with one star too many at each end comes out balanced; a sound *Title* is untouched', () => {
    const t = '**Confucian.** The heading of a chapter in *Mencius* (Chapter 15) reads: **"Trials and hardships the way in which Heaven prepares men for great services."* ([Mencius, Chapter 15., #1210](https://oceanlibrary.com/works-of-mencius/?paraId=para_1210)))* This is a chapter summary.';
    const out = formPass(t).text;
    expect(markdownDefects(out)).toEqual([]);
    expect(out).toContain('*Mencius* (Chapter 15)');
    expect(out).toContain('**Confucian.**');
    expect(formPass('fine *a* and **b**').text).toBe('fine *a* and **b**');
  });
});

describe('reader links', () => {
  it('a siftersearch.com/library link gives way to a public link of the same work among the sources; none → it stays', () => {
    const ss = 'https://siftersearch.com/library/bahai/administrative/universal-house-of_ridvan-message-1979#p60';
    const pub = 'https://oceanlibrary.com/ridvan-message-1979/?paraId=para_60';
    const t = `[*Riḍván Message 1979*](${ss})`;
    expect(citeLinks(t, [{ title: 'Riḍván Message 1979', url: ss }, { title: 'Ridván Message 1979', url: pub }]).text).toBe(`[*Riḍván Message 1979*](${pub})`);
    expect(citeLinks(t, [{ title: 'Riḍván Message 1979', url: ss }]).text).toBe(t);
  });
});
