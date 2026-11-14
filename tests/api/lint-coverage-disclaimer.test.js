// Coverage disclaimer at the exit: dropped when the reply cites a source (11-11 email, Quddús).
import { describe, it, expect } from 'vitest';
import { formPass, dropCoverageDisclaimer, dropSearchDenial } from '../../api/lib/assistant/lint.js';
import { wordSafe } from '../../api/lib/assistant/sentences.js';

const ANSWER = 'As recorded in [*The Dawn-Breakers*](https://oceanlibrary.com/dawn-breakers_nabil), he was born in Bárfurúsh.';
describe('a coverage disclaimer never opens an answer', () => {
  it('drops "The texts I can search here do not provide a full account" and keeps the "but" clause', () => {
    const r = formPass(`Hello!\n\nThe texts I can search here do not provide a full account of Quddús, but they do preserve a record of his early life.\n\n${ANSWER}`);
    expect(r.text).not.toMatch(/full account/);
    expect(r.text).toMatch(/They do preserve a record of his early life\./);
    expect(r.repairs.coverage_disclaimer).toBe(1);
  });
  it('a whole disclaimer sentence goes', () => {
    expect(dropCoverageDisclaimer(`The sources I found don't give a complete biography of him.\n\n${ANSWER}`).text).toBe(ANSWER);
  });
  it('a reply with no cited source keeps it; a quotation never counts', () => {
    expect(dropCoverageDisclaimer('The texts I can search do not provide a full account of him.').dropped).toBe(0);
    const q = `He wrote: “the texts I have do not give a full account of the siege.”\n\n${ANSWER}`;
    expect(dropCoverageDisclaimer(q).dropped).toBe(0);
  });
});

// The reader's text (writer A/B 11-03, Dhammapada): "…do not provide a complete collection …, but rather point to the work …" was cut to
// "Rather point to the work …" — a capitalised fragment with no subject. Only the negative clause goes; the subject stays.
const DHAMMAPADA = "Dear friend,\n\nThe [*Dhammapada*](https://siftersearch.com/library/view?doc=20925) appears in our records primarily as a classical collection of the Buddha's sayings referenced or included within various Buddhist texts, such as [*The Buddha's Path of Virtue*](https://oceanlibrary.com/dhammapada_buddha) translated by K.J. Saunders, and noted across other works like [*The Diamond Sutra*](https://oceanlibrary.com/diamond-sutra) translated by William Gemmell. The texts I can search here do not provide a complete collection of the English quotes themselves, but rather point to the work as a foundational Buddhist scripture containing verses on the path of virtue, as seen where [\"This verse is quoted in the Dhammapada (verse 223)\"](https://oceanlibrary.com/sutra-collection-hijk/?paraId=fn_39) in the [*Sutra Collection*](https://siftersearch.com/library/view?doc=20937).\n\nWarmly,\nAnís";
describe('the "but" clause is kept only as a whole sentence (never a capitalised fragment)', () => {
  it('reader text: the negative clause goes, the subject stays', () => {
    const r = dropCoverageDisclaimer(DHAMMAPADA);
    expect(r.text).toMatch(/William Gemmell\. The texts I can search here point to the work as a foundational Buddhist scripture/);
    expect(r.text).not.toMatch(/Rather point|complete collection|do not provide/);
    expect(r.dropped).toBe(1);
    expect(r.cuts).toEqual(['do not provide a complete collection of the English quotes themselves, but rather']);
    expect(formPass(DHAMMAPADA).text).toMatch(/The texts I can search here point to the work/);
  });
  it('the word-preservation guard accepts the named cut (no fallback to the draft)', () => {
    const form = {}, { dropCoverageDisclaimer: safe } = wordSafe(form, { dropCoverageDisclaimer });
    expect(safe(DHAMMAPADA).text).toMatch(/The texts I can search here point to the work/);
    expect(form.unsafe).toEqual([]);
  });
  it('a clause with its own subject stands alone; a predicate takes the subject; a bare object leaves the sentence whole', () => {
    const lead = 'The texts I can search here do not provide a full account of Quddús, but ';
    const one = (tail) => dropCoverageDisclaimer(`${lead}${tail}\n\n${ANSWER}`).text.split('\n')[0];
    expect(one('rather they point to Nabíl.')).toBe('They point to Nabíl.');
    expect(one('do preserve his letters.')).toBe('The texts I can search here do preserve his letters.');
    expect(one('rather a sketch of his life.')).toBe(`${lead}rather a sketch of his life.`);
  });
  it('a search denial still goes whole when no sentence would remain', () => {
    expect(dropSearchDenial(`I can't search the library from here, but rather a summary.\n\n${ANSWER}`).text).toBe(ANSWER);
    expect(dropSearchDenial("I can't run a literal search from here, but the book does speak of it.").text).toBe('The book does speak of it.');
  });
});
