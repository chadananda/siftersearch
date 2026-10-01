// Phrase-indexer pure helpers: units of a paragraph, the vector cache key, half-precision storage, Arabic-script share.
import { describe, it, expect } from 'vitest';
import { unitsOf, vecKey, packF16, unpackF16, arabicShare, pointId } from '../../api/lib/phrase-vectors.js';
import { segment, SEG_VERSION } from '../../api/lib/phrases.js';

describe('unitsOf', () => {
  const text = 'قل یا قوم ان الذی کان فی هذا الامر قد ظهر و هو الذی ینطق بالحق ثم ذکر ما نزل من قبل فی کتاب مبین';
  it('one unit per phrase, offsets from segment(), embedding text = phrase with neighbours', () => {
    const us = unitsOf({ id: '28513072', text, lang: 'ar' });
    expect(us.map(({ start, end }) => ({ start, end }))).toEqual(segment(text, 'ar'));
    us.forEach((u, k) => { expect(u.k).toBe(k); expect(u.embedText).toContain(text.slice(u.start, u.end)); expect(u.segV).toBe(SEG_VERSION); });
  });
  it('point ids are paragraph_id × 1000 + k', () => {
    expect(unitsOf({ id: '28513072', text, lang: 'ar' })[1].pointId).toBe(28513072001);
    expect(pointId('7', 3)).toBe(7003);
  });
  it('empty text → no units', () => { expect(unitsOf({ id: '1', text: '', lang: 'fa' })).toEqual([]); });
});

describe('vecKey', () => {
  it('stable for model + dims + text, different when any changes', () => {
    const k = vecKey('gemini-embedding-2', 3072, 'abc');
    expect(k).toBe(vecKey('gemini-embedding-2', 3072, 'abc'));
    expect(k).not.toBe(vecKey('gemini-embedding-2', 1536, 'abc'));
    expect(k).not.toBe(vecKey('gemini-embedding-001', 3072, 'abc'));
    expect(k).not.toBe(vecKey('gemini-embedding-2', 3072, 'abd'));
  });
});

describe('packF16 / unpackF16', () => {
  it('round-trips a unit vector within half-precision error, 2 bytes per dimension', () => {
    const v = Array.from({ length: 3072 }, (_, i) => Math.sin(i) / 40);
    const b = packF16(v);
    expect(b.length).toBe(3072 * 2);
    const w = unpackF16(b);
    expect(w.length).toBe(3072);
    w.forEach((x, i) => expect(Math.abs(x - v[i])).toBeLessThan(1e-4));
  });
});

describe('arabicShare', () => {
  it('share of letters in Arabic script', () => {
    expect(arabicShare('بسم الله')).toBe(1);
    expect(arabicShare('In the name of God')).toBe(0);
    expect(arabicShare('Gleanings — بسم الله الرحمن الرحيم')).toBeGreaterThan(0.5);
    expect(arabicShare('')).toBe(0);
  });
});
