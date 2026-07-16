import { describe, it, expect } from 'vitest';
import { arabicKeys, arabicNisba, nameKeys, skeletonKeys } from '../../api/lib/translit-key.js';

describe('arabicKeys — honorific dropping', () => {
  it('حضرت باب: drops حضرت, keeps باب', () => {
    const keys = arabicKeys('حضرت باب');
    expect(keys.has('ar:باب')).toBe(true);
    expect(keys.has('ar:حضرت')).toBe(false);
  });
  it('شيخ جعفر: drops شيخ, keeps جعفر', () => {
    const keys = arabicKeys('شيخ جعفر');
    expect(keys.has('ar:جعفر')).toBe(true);
    expect(keys.has('ar:شيخ')).toBe(false);
  });
  it('میرزا حسین: drops میرزا, keeps حسین', () => {
    const keys = arabicKeys('میرزا حسین');
    expect(keys.has('ar:حسین')).toBe(true);
    expect(keys.has('ar:میرزا')).toBe(false);
  });
  it('حاج علی: drops حاج, keeps علی', () => {
    const keys = arabicKeys('حاج علی');
    expect(keys.has('ar:علی')).toBe(true);
    expect(keys.has('ar:حاج')).toBe(false);
  });
});

describe('arabicKeys — script-variant unification (core win)', () => {
  it('Arabic yeh/kaf vs Persian yeh/kaf: محمّدتقى and محمدتقی share a key', () => {
    // محمّدتقى uses Arabic yeh (ى) + shadda; محمدتقی uses Persian yeh (ی)
    const keysA = arabicKeys('محمّدتقى');
    const keysB = arabicKeys('محمدتقی');
    const shared = [...keysA].filter((k) => keysB.has(k));
    expect(shared.length).toBeGreaterThan(0);
  });
  it('سيد كاظم رشتی (Arabic kaf/yeh) vs سید کاظم رشتی (Persian) share keys', () => {
    const keysA = arabicKeys('سيد كاظم رشتی');
    const keysB = arabicKeys('سید کاظم رشتی');
    // After honorific drop, both should have کاظم and رشتی tokens sharing keys
    const shared = [...keysA].filter((k) => keysB.has(k));
    expect(shared.length).toBeGreaterThan(0);
    expect(keysA.has('ar:کاظم')).toBe(true);
    expect(keysB.has('ar:کاظم')).toBe(true);
    expect(keysA.has('ar:رشتی')).toBe(true);
    expect(keysB.has('ar:رشتی')).toBe(true);
  });
  it('hamza variants: أحمد and احمد share a key', () => {
    const keysA = arabicKeys('أحمد');
    const keysB = arabicKeys('احمد');
    const shared = [...keysA].filter((k) => keysB.has(k));
    expect(shared.length).toBeGreaterThan(0);
  });
  it('teh-marbuta: فاطمة and فاطمه share a key', () => {
    const keysA = arabicKeys('فاطمة');
    const keysB = arabicKeys('فاطمه');
    const shared = [...keysA].filter((k) => keysB.has(k));
    expect(shared.length).toBeGreaterThan(0);
  });
});

describe('arabicKeys — nisba separation (different nisbas = different people)', () => {
  it('یزدی and ترشیزی produce DISJOINT key sets', () => {
    const keysA = arabicKeys('یزدی');
    const keysB = arabicKeys('ترشیزی');
    const shared = [...keysA].filter((k) => keysB.has(k));
    expect(shared.length).toBe(0);
  });
  it('محمد یزدی and محمد ترشیزی: shared given-name key but different nisba keys', () => {
    const keysA = arabicKeys('محمد یزدی');
    const keysB = arabicKeys('محمد ترشیزی');
    expect(keysA.has('ar:یزدی')).toBe(true);
    expect(keysB.has('ar:ترشیزی')).toBe(true);
    expect(keysA.has('ar:ترشیزی')).toBe(false);
    expect(keysB.has('ar:یزدی')).toBe(false);
  });
});

describe('arabicNisba — conservative nisba extraction', () => {
  it('سید کاظم رشتی → ar:رشتی', () => {
    expect(arabicNisba('سید کاظم رشتی')).toBe('ar:رشتی');
  });
  it('میرزا یحیی → null (یحیی is a given name in stoplist)', () => {
    expect(arabicNisba('میرزا یحیی')).toBeNull();
  });
  it('محمدتقی → null (single token after honorific drop — no nisba possible)', () => {
    expect(arabicNisba('محمدتقی')).toBeNull();
  });
  it('علی → null (bare given name, single token)', () => {
    expect(arabicNisba('علی')).toBeNull();
  });
  it('حسن مازندرانی → ar:مازندرانی', () => {
    expect(arabicNisba('حسن مازندرانی')).toBe('ar:مازندرانی');
  });
  it('مهدی → null (in given-name stoplist)', () => {
    expect(arabicNisba('مهدی')).toBeNull();
  });
  it('علی یزدی → ar:یزدی (≥4 chars, ends ی, not in stoplist, 2 tokens)', () => {
    expect(arabicNisba('علی یزدی')).toBe('ar:یزدی');
  });
});

describe('nameKeys — union of transliteration skeletons and Arabic-script keys', () => {
  it('Latin name (Muḥammad-Taqí) returns non-empty skeleton keys, no ar: keys', () => {
    const keys = nameKeys('Muḥammad-Taqí');
    const latinKeys = [...keys].filter((k) => !k.startsWith('ar:'));
    const arKeys = [...keys].filter((k) => k.startsWith('ar:'));
    expect(latinKeys.length).toBeGreaterThan(0);
    expect(arKeys.length).toBe(0);
  });
  it('Arabic name returns ar: keys', () => {
    const keys = nameKeys('سید کاظم رشتی');
    const arKeys = [...keys].filter((k) => k.startsWith('ar:'));
    expect(arKeys.length).toBeGreaterThan(0);
    expect(arKeys).toContain('ar:کاظم');
    expect(arKeys).toContain('ar:رشتی');
  });
  it('nameKeys includes all skeletonKeys for a Latin name', () => {
    const name = 'Muhammad Taqi';
    const sk = skeletonKeys(name);
    const nk = nameKeys(name);
    for (const k of sk) expect(nk.has(k)).toBe(true);
  });
  it('nameKeys includes all arabicKeys for an Arabic name', () => {
    const name = 'حسین یزدی';
    const ak = arabicKeys(name);
    const nk = nameKeys(name);
    for (const k of ak) expect(nk.has(k)).toBe(true);
  });
  it('mixed input with both scripts gets keys from both', () => {
    // Edge: a string with both Latin and Arabic chars
    const keys = nameKeys('Ahmad احمد');
    const latinKeys = [...keys].filter((k) => !k.startsWith('ar:'));
    const arKeys = [...keys].filter((k) => k.startsWith('ar:'));
    expect(latinKeys.length).toBeGreaterThan(0);
    expect(arKeys.length).toBeGreaterThan(0);
  });
});

describe('degenerate inputs — no throw, empty sets', () => {
  it('arabicKeys("") → empty set', () => {
    expect(arabicKeys('').size).toBe(0);
  });
  it('arabicKeys(null) → empty set', () => {
    expect(arabicKeys(null).size).toBe(0);
  });
  it('arabicKeys(undefined) → empty set', () => {
    expect(arabicKeys(undefined).size).toBe(0);
  });
  it('arabicNisba("") → null', () => {
    expect(arabicNisba('')).toBeNull();
  });
  it('arabicNisba(null) → null', () => {
    expect(arabicNisba(null)).toBeNull();
  });
  it('nameKeys("") → empty set', () => {
    expect(nameKeys('').size).toBe(0);
  });
  it('nameKeys(null) → empty set', () => {
    expect(nameKeys(null).size).toBe(0);
  });
  it('pure Latin non-name garbage → arabicKeys empty', () => {
    expect(arabicKeys('hello world 123').size).toBe(0);
  });
});
