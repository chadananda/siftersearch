// Canonical Arabic-script folding for classical Arabic + Persian (and their mixtures): one definition, so the phrase
// splitter, keys and matching never drift apart.
import { describe, it, expect } from 'vitest';
import { foldArabic, stripMarks, arOrFa } from '../../api/lib/arabic-script.js';

describe('stripMarks — vocalisation and Qur\'anic annotation', () => {
  it('removes harakat, tanwin, shadda, sukun, superscript alef', () => {
    expect(stripMarks('بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيمِ')).toBe('بسم الله الرحمن الرحيم');
  });
  it('removes Qur\'anic small high letters, waqf marks and the verse-end ornament', () => {
    expect(stripMarks('ذَٰلِكَ ٱلْكِتَٰبُ لَا رَيْبَۛ فِيهِۛ')).toBe('ذلك ٱلكتب لا ريب فيه');
    expect(stripMarks('الْعَالَمِينَ ۝')).toBe('العالمين ');
  });
  it('removes tatweel and bidi controls but keeps letters and digits', () => {
    expect(stripMarks('‫قــــال‬ ١٢')).toBe('قال ١٢');
  });
});

describe('foldArabic — spelling variants that differ between editions, scripts and keyboards', () => {
  it('folds Arabic yeh/kaf/alef-maqsura to the Persian forms used across the library', () => {
    expect(foldArabic('علي كتاب موسى')).toBe('علی کتاب موسی');
  });
  it('folds hamza seats, wasla, madda and teh marbuta', () => {
    expect(foldArabic('أمر إلى آية ٱلله مؤمن رئيس رحمة خانۀ')).toBe('امر الی ایه الله مومن رییس رحمه خانه');
  });
  it('removes ZWNJ so Persian compounds match however they were typed', () => {
    expect(foldArabic('می‌شود')).toBe(foldArabic('میشود'));
    expect(foldArabic('کتاب‌ها')).toBe('کتابها');
  });
  it('maps presentation forms and ligatures (old PDFs) to plain letters', () => {
    expect(foldArabic('ﻻ ﺍﻟﻠﻪ')).toBe('لا الله');
  });
  it('maps Arabic-Indic and Persian digits to ASCII', () => {
    expect(foldArabic('١٢٣ ۴۵۶')).toBe('123 456');
  });
  it('is idempotent and leaves Latin text alone', () => {
    const s = 'Bahá\'u\'lláh — علی';
    expect(foldArabic(foldArabic(s))).toBe(foldArabic(s));
    expect(foldArabic('The Kitáb-i-Íqán')).toBe('The Kitáb-i-Íqán');
  });
});

describe('arOrFa — Persian or Arabic, judged from the paragraph itself', () => {
  it('reads Persian prose as fa even when it quotes Arabic', () => {
    expect(arOrFa('و این است که می‌فرمایند قل الله ثم ذرهم فی خوضهم یلعبون و از این بیان معلوم می‌شود که مقصود چه بوده است')).toBe('fa');
  });
  it('reads Arabic as ar even when typed with Persian ی and ک', () => {
    expect(arOrFa('قل یا قوم ان الذی کان فی هذا الامر قد ظهر علی ما کان علیه من قبل و هو الذی')).toBe('ar');
  });
  it('trusts the label when the text gives no evidence', () => {
    expect(arOrFa('بسم الله', 'fa')).toBe('fa');
    expect(arOrFa('بسم الله', 'ar')).toBe('ar');
  });
});
