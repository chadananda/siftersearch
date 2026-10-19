// The librarian's title index (Chad 10-19: "our librarian API cannot be so weak as to miss slight variations in title"):
// one work under its many titles is found; two different works are never confused.
import { describe, it, expect } from 'vitest';
import { buildIndex, matchTitle, mainKey, titleScore, authorMatch } from '../../api/lib/dewey/title-index.js';

const LIB = [
  { id: 15228, title: "Ẓuhúru'l-Ḥaqq Vol 1 (Pre-Babi Era)", author: "Mírzá Asadu'lláh Fáḍil Mázandarání", paragraph_count: 205 },
  { id: 15257, title: "Ẓuhúru'l-Ḥaqq Vol 2 (The Bab)", author: "Mírzá Asadu'lláh Fáḍil Mázandarání", paragraph_count: 599 },
  { id: 21308, title: 'The Dawn-Breakers', author: 'Nabíl-i-Zarandí', paragraph_count: 3000 },
  { id: 420, title: 'The Life of the Báb', author: "Asadu'llah Fadil Mazandarani", paragraph_count: 60 },
  { id: 11322, title: 'The Life of Bahá’u’lláh', author: 'Asadu’lláh Faḍil Mazandarani', paragraph_count: 83 },
  { id: 20783, title: "Gleanings from the Writings of Bahá'u'lláh", author: "Bahá'u'lláh", paragraph_count: 900 },
  { id: 17295, title: 'Confessions of St. Augustine', author: 'Augustine', paragraph_count: 700 },
  { id: 9, title: 'The Kitáb-i-Íqán: The Book of Certitude', author: "Bahá'u'lláh", paragraph_count: 300 },
  { id: 10, title: 'Some Answered Questions', author: "'Abdu'l-Bahá", paragraph_count: 400 },
  { id: 11, title: 'Promulgation of Universal Peace', author: "'Abdu'l-Bahá", paragraph_count: 2000 },
];
const idx = buildIndex(LIB);
const top = (t, o) => matchTitle(idx, t, o)[0]?.doc.id ?? null;

describe('one work, many titles', () => {
  it.each([
    ["The Dawn-Breakers: Nabíl's Narrative of the Early Days of the Bahá'í Revelation", 21308],
    ['Dawnbreakers', 21308],
    ['Gleanings from the Writings of Bahaullah', 20783],
    ['The Confessions of Saint Augustine', 17295],
    ['Kitab-i-Iqan', 9],
    ['The Book of Certitude', 9],
    ["Some Answered Questions (Mufávaḍát)", 10],
    ['The Promulgation of Universal Peace: Talks Delivered by Abdul-Baha', 11],
  ])('%s → #%i', (t, id) => expect(top(t)).toBe(id));
  it("every volume of a work in volumes is found", () => {
    for (const t of ["Táríkh-i-Ẓuhúru'l-Ḥaqq (The History of the Manifestation of Truth)", 'Zuhur al-Haqq', 'Zuhurul-Haq']) expect(matchTitle(idx, t).map((m) => m.doc.id).sort()).toEqual([15228, 15257]);
  });
});

describe('different works are never confused', () => {
  it('The Dawn-Breakers is not Ẓuhúru\'l-Ḥaqq, and neither is the other', () => {
    expect(matchTitle(idx, 'The Dawn-Breakers').map((m) => m.doc.id)).toEqual([21308]);
    expect(matchTitle(idx, "Ẓuhúru'l-Ḥaqq").map((m) => m.doc.id)).not.toContain(21308);
    expect(titleScore(mainKey('The Dawn-Breakers'), mainKey("Ẓuhúru'l-Ḥaqq"))).toBeLessThan(0.3);
  });
  it('The Life of the Báb is not The Life of Bahá\'u\'lláh', () => {
    expect(matchTitle(idx, 'The Life of the Bab').map((m) => m.doc.id)).toEqual([420]);
  });
  it('a book not in the library finds nothing', () => {
    expect(matchTitle(idx, 'The Varieties of Religious Experience')).toEqual([]);
    expect(matchTitle(idx, 'The Man Who Was Thursday')).toEqual([]);
  });
  it('authors folded: Mazandarani = Mírzá Asadu\'lláh Fáḍil Mázandarání', () => {
    expect(authorMatch('Mazandarani', "Mírzá Asadu'lláh Fáḍil Mázandarání")).toBe(true);
    expect(authorMatch('William James', 'Augustine')).toBe(false);
  });
});
