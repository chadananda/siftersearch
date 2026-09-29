// Anchoring a known original (CTAI/bahai.org) inside the ingested originals — verbatim, spelling variants folded.
import { describe, it, expect } from 'vitest';
import { letterKey, buildIndex, locate } from '../../api/lib/rag/concepts/anchor.js';

const PARAS = [
  { id: 1, docId: 10, text: '⁅s1⁆یا أرض المقصود قد جئتک من قبل الله وأبشّرک بفضله ورحمته⁅/s1⁆' },
  { id: 2, docId: 10, text: 'وأکبّر علیک من لدنه إنّه لهو الفضّال الکریم طوبی لنفس أقبلت إلیک' },
  { id: 3, docId: 20, text: 'حمد مقدّس از عرفان ممکنات و منزّه از ادراک مدرکات ملیک عزّ بی مثالی را سزاست' },
  { id: 4, docId: 30, text: 'هذا کتاب من لدنا الی عبد من العباد لیجذبه الی مقر القرب و القدس و اللقاء' },
];

describe('letterKey', () => {
  it('folds the spelling variants two editions of one text differ in', () => {
    expect(letterKey('إنّه لهو الكريم')).toBe(letterKey('انه لهو الکریم'));
    expect(letterKey('⁅s1⁆بی مثالی⁅/s1⁆')).toBe(letterKey('بي مثالى'));
  });
});

describe('locate', () => {
  const index = buildIndex(PARAS);
  it('finds a passage spanning two paragraphs of the right document, written with other spellings', () => {
    const r = locate('يا ارض المقصود قد جئتك من قبل اللّه وابشّرك بفضله ورحمته واكبّر عليك من لدنه انّه لهو الفضّال الكريم', index);
    expect(r).toMatchObject({ docId: 10, paraIds: [1, 2] });
    expect(r.coverage).toBeGreaterThanOrEqual(0.8);
    expect(r.rejected).toBeUndefined();
  });
  it('rejects a passage that is not there, instead of returning its nearest neighbour', () => {
    const r = locate('قل يا قوم أتعبدون التّراب وتدعون ربّكم العزيز الوهّاب اتّقوا الله ولا تكوننّ من الخاسرين', index);
    expect(r === null || r.rejected === true).toBe(true);
  });
});

describe('locate — an edition that keeps each printed line as a paragraph', () => {
  it('assembles the passage from many short line-paragraphs', () => {
    const lines = ['سبقت و پیشی داشته و حدیث اول ما خلق الله', 'العقل شاهد این مطلب و در صدر ایجاد', 'در هیکل انسانی من حیث الظهور مشخص گردید'];
    const index = buildIndex(lines.map((text, i) => ({ id: 100 + i, docId: 7, text })));
    const r = locate('سبقت و پیشی داشته و حدیث اول ما خلق الله العقل شاهد این مطلب و در صدر ایجاد در هیکل انسانی من حیث الظهور مشخص گردید', index);
    expect(r).toMatchObject({ docId: 7, paraIds: [100, 101, 102] });
  });
});
