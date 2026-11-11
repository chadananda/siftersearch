// 11-11 suffering reply: the block quote's attribution repeated as its own paragraph, and one place cited twice in a paragraph. Pure lint.
import { describe, it, expect } from 'vitest';
import { dropDoubleAttribution, dropRepeatedCite, formPass } from '../../api/lib/assistant/lint.js';

const BQ = "> 'The mind and spirit of man advance when he is tried by suffering.'\n> — Abdu'l-Bahá's 2nd Visit to UK, Dec 5 1913 - Jan 21 1914";
const ATTR = "— 'Abdu'l-Bahá, *Abdu'l-Bahá's 2nd Visit to UK, Dec 5 1913 - Jan 21 1914*";
const SEL = 'https://oceanlibrary.com/selections-from-the-writings-of-abdul-baha';
const PARA = `In the Tablet that begins *"O thou servant of God!"* ([Selections from the Writings of ‘Abdu’l-Bahá, #1247](${SEL}/?paraId=para_1247&selectionString=x.0~x.527)) He tells a grieving person not to be crushed ([*Selections from the Writings of 'Abdu'l-Bahá*](${SEL}), #1247). Then more.`;

describe('dropDoubleAttribution', () => {
  it('one attribution, the fuller, inside the quote', () => {
    const r = dropDoubleAttribution(`${BQ}\n\n${ATTR}\n\nDoes it mean suffering is good?`);
    expect(r.fixed).toBe(1);
    expect(r.text).toBe(`> 'The mind and spirit of man advance when he is tried by suffering.'\n> ${ATTR}\n\nDoes it mean suffering is good?`);
  });
  it('a different attribution, or prose after the quote, is left alone', () => {
    const other = `${BQ}\n\n— Shoghi Effendi, *God Passes By*`;
    expect(dropDoubleAttribution(other)).toEqual({ text: other, fixed: 0 });
    const prose = `${BQ}\n\nThis passage, from Abdu'l-Bahá's 2nd Visit to UK, Dec 5 1913 - Jan 21 1914, says more.`;
    expect(dropDoubleAttribution(prose).fixed).toBe(0);
  });
});

describe('dropRepeatedCite', () => {
  it('a later citation of the same work at the same place in one paragraph goes', () => {
    const r = dropRepeatedCite(PARA);
    expect(r.fixed).toBe(1);
    expect(r.text).toContain('paraId=para_1247');
    expect(r.text).toContain('not to be crushed. Then more.');
  });
  it('another place, a citation with no place, or another paragraph stays', () => {
    const two = PARA.replace(', #1247). Then', ', #1300). Then');
    expect(dropRepeatedCite(two).fixed).toBe(0);
    const bare = PARA.replace(', #1247). Then', '). Then');
    expect(dropRepeatedCite(bare).fixed).toBe(0);
    const split = PARA.replace(' He tells', '\n\nHe tells');
    expect(dropRepeatedCite(split).fixed).toBe(0);
  });
  it('formPass runs both and reports them', () => {
    const r = formPass(`${BQ}\n\n${ATTR}\n\n${PARA}`);
    expect(r.repairs).toMatchObject({ double_attribution: 1, repeated_cite: 1 });
  });
});

describe('dropRepeatedCite: a placeless citation after a placed one of the same work (11-11 Badasht)', () => {
  const MF = 'https://oceanlibrary.com/memorials-of-the-faithful_abdul-baha';
  it('drops the second, keeps the placed one', () => {
    const t = `he concludes: *"The Conference of Badasht broke up." ([Memorials of the Faithful, 69 Ṭáhirih, #67.28](${MF}/?paraId=para_711))* ([*Memorials of the Faithful*](${MF}), on Ṭáhirih)`;
    const r = dropRepeatedCite(t);
    expect(r.fixed).toBe(1);
    expect(r.text).toContain('#67.28');
    expect(r.text).not.toContain('on Ṭáhirih');
  });
  it('a placeless citation BEFORE the placed one stays', () => {
    const t = `In ([*Memorials of the Faithful*](${MF}), on Ṭáhirih) he writes *"x"* ([Memorials of the Faithful, #67.28](${MF}/?paraId=para_711)).`;
    expect(dropRepeatedCite(t).fixed).toBe(0);
  });
});

