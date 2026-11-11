// Article writers for periodicals: byline / FROM heading / signature / table of contents, from real Star of the West shapes.
import { describe, it, expect } from 'vitest';
import { articleWriters, tocWriters, byLine, signedLine, displayName } from '../../api/lib/authorship/articles.js';

const mk = (texts) => texts.map((t, i) => ({ id: 1000 + i, pidx: i, text: t, blocktype: /^#/.test(t) ? 'heading' : 'paragraph' }));
const w = (m, i) => m.get(1000 + i)?.writer;

describe('articleWriters', () => {
  it('v1 i17: Yazdi block signed, Sprague block from "FROM MR. SIDNEY SPRAGUE." and signed SYDNEY (heading spelling wins)', () => {
    const rows = mk(['## LETTERS.', 'FROM MOHAMMED YAZDI.', 'Dear friends, the work goes on.', '(Signed) MOHAMMED YAZDI.', 'FROM MR. SIDNEY SPRAGUE.', 'Mr. Ellis interviewed Abdul-Baha.', 'The answer was: five diamonds.', '(Signed) SYDNEY SPRAGUE.']);
    const m = articleWriters(rows);
    for (const i of [1, 2, 3]) expect(w(m, i)).toBe('Mohammed Yazdi');
    for (const i of [4, 5, 6, 7]) expect(w(m, i)).toBe('Sidney Sprague');
    expect(m.get(1004)).toMatchObject({ basis: 'from-heading', span: [4, 7] });
    expect(w(m, 0)).toBeUndefined();
  });
  it('byline under the title, and the "By unexpected chance" prose is not a byline', () => {
    const rows = mk(['# The Baháʼí Revelation—The Religious Need of the Time', 'By CHARLES MASON REMEY', 'The age is ripe.', '# Philippines', 'By unexpected chance, I came to the Philippine Islands.', 'More prose.']);
    const m = articleWriters(rows);
    expect(w(m, 2)).toBe('Charles Mason Remey');
    expect(m.get(1002).basis).toBe('byline');
    expect(w(m, 4)).toBeUndefined();
    expect(byLine('By unexpected chance, I came to the Philippine Islands.')).toBeNull();
  });
  it('italic byline and signatures: Abdu\'l-Bahá, Shoghi, The Editors', () => {
    const rows = mk(['## Education in a World Order', '*By Kenneth Christian*', 'Text.', '## Tablet', 'O ye friends.', "(Signed) 'ABDU'L-BAHÁ ABBAS.", '## Note', 'We greet you.', '—The Editors.', '## Cable', 'Love.', '(Signed) SHOGHI.']);
    const m = articleWriters(rows);
    expect(w(m, 2)).toBe('Kenneth Christian');
    expect(w(m, 4)).toBe('‘Abdu’l-Bahá');
    expect(w(m, 7)).toBe('The Editors');
    expect(w(m, 10)).toBe('Shoghi Effendi');
  });
  it('table of contents maps titles to writers', () => {
    const toc = 'PAGE Fac-simile of Cover—By Carl Scheffler......1 Twelve Basic Bahai Principles—From the Words of \'Abdu\'l-Bahá....4 The Baháʼí Revelation—The Religious Need of the Time—By Charles Mason Remey....9';
    expect(tocWriters(mk([toc])).get('twelvebasicbahaiprinciples')).toBe('‘Abdu’l-Bahá');
    const rows = mk([toc, '# Twelve Basic Bahai Principles', 'Unity of religion.', '# The Baháʼí Revelation—The Religious Need of the Time', 'Prose.']);
    const m = articleWriters(rows);
    expect(m.get(1002)).toMatchObject({ writer: '‘Abdu’l-Bahá', basis: 'toc' });
    expect(w(m, 4)).toBe('Charles Mason Remey');
    expect(w(m, 0)).toBeUndefined();
  });
  it('"Title, Writer ..... page" contents style', () => {
    const rows = mk(["Spring, 'Abdu'l-Bahá................ 354 Editorial, Stanwood Cobb.......... 356", '## Editorial', 'Words.']);
    expect(w(articleWriters(rows), 2)).toBe('Stanwood Cobb');
  });
  it('a sub-heading inherits its article\'s byline; a signature that is not near the end does not override a byline', () => {
    const rows = mk(['## Diary', '*By Keith Ransom-Kehler*', '### Day one', 'Text.', "(Signed) 'ABDU'L-BAHÁ ABBAS.", 'More', 'More', 'More', 'End.']);
    const m = articleWriters(rows);
    expect(w(m, 3)).toBe('Keith Ransom-Kehler');
    expect(w(m, 2)).toBe('Keith Ransom-Kehler');
  });
  it('SoW v12 i1: a Tablet title stored as a paragraph ends the essay before it; its signature credits only the Tablet', () => {
    const rows = mk(['Fac-simile of Cover.......... 1', 'The Bahá\'í Revelation—By Louise R. Waite.......... 9', '## The Bahá\'í Revelation', 'THE Bahá\'í Revelation is essentially a message of peace.',
      'Today, amid all the suffering of his people, he lives in his own home on Mount Carmel.', 'Words of \'Abdu\'l-Bahá', 'Blessed is he who proclaims the doctrine of Spiritual Brotherhood.',
      "TABLET FROM 'ABDU'L-BAHÁ", 'O thou Star of the West!', 'Be thou happy! Be thou happy!', "(Signed) 'ABDU'L-BAHÁ 'ABBÁS."]);
    const m = articleWriters(rows);
    for (const i of [3, 4]) expect(w(m, i)).toBe('Louise R. Waite');
    expect(w(m, 6)).toBeUndefined();
    for (const i of [7, 8, 9]) expect(w(m, i)).toBe('‘Abdu’l-Bahá');
  });
  it('a signer other than the named writer, closing the opening block, credits no one', () => {
    const rows = mk(['## News', 'By ALBERT WINDUST', 'The friends met.', 'O thou servant of God!', "(Signed) 'ABDU'L-BAHÁ ABBAS."]);
    const m = articleWriters(rows);
    for (const i of [2, 3, 4]) expect(w(m, i)).toBeUndefined();
  });
  it('"From Stenographic Notes." names a record, not a writer', () => {
    const m = articleWriters(mk(["## ADDRESS OF 'ABDU'L-BAHÁ AT HOTEL ANSONIA", 'From Stenographic Notes.', 'Souls from the East and from the West have been brought to this spot.']));
    expect(w(m, 2)).not.toBe('Stenographic Notes');
  });
  it('name helpers', () => {
    expect(displayName('MR. SIDNEY SPRAGUE.')).toBe('Sidney Sprague');
    expect(displayName("'ABDU'L-BAHÁ 'ABBÁS.")).toBe('‘Abdu’l-Bahá');
    expect(signedLine('(Signed) SHOGHI.')).toBe('SHOGHI');
    expect(signedLine('The answer was: five diamonds.')).toBeNull();
  });
});
