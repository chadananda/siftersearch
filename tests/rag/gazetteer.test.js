// Unit tests for the gazetteer loader (api/lib/rag-adapter/gazetteer.js) — pure, no DB, no network.
// Proves folded (apostrophe/case-insensitive) form lookup + ≠namesake guard detection, and graceful
// behaviour when the gazetteer file is absent. Uses data/siftersearch-gazetteer.sample.json.
import { describe, it, expect } from 'vitest';
import { fileURLToPath } from 'node:url';
import { loadGazetteer, anchorFor, guardedPair } from '../../api/lib/rag-adapter/gazetteer.js';

const SAMPLE = fileURLToPath(new URL('../../data/siftersearch-gazetteer.sample.json', import.meta.url));
const MISSING = fileURLToPath(new URL('../../data/does-not-exist-gazetteer.json', import.meta.url));

describe('gazetteer loader', () => {
  it('loadGazetteer reads the sample once and caches by path', () => {
    const g = loadGazetteer(SAMPLE);
    expect(g.entries).toHaveLength(3);
    expect(g.guards).toHaveLength(1);
    expect(loadGazetteer(SAMPLE)).toBe(g);   // same object → cached
  });

  it('loadGazetteer tolerates a missing file (empty gazetteer, no throw)', () => {
    const g = loadGazetteer(MISSING);
    expect(g.entries).toEqual([]);
    expect(g.guards).toEqual([]);
    expect(anchorFor(g, 'anything')).toBeNull();
  });

  it('anchorFor resolves the canonical name to its anchor', () => {
    const g = loadGazetteer(SAMPLE);
    expect(anchorFor(g, 'Áqáy-i-Kalím')).toEqual({ id: 101, canonical: 'Áqáy-i-Kalím' });
  });

  it('anchorFor resolves a title/epithet/alias form to the SAME anchor (anti-split)', () => {
    const g = loadGazetteer(SAMPLE);
    expect(anchorFor(g, 'Mírzá Músá')).toEqual({ id: 101, canonical: 'Áqáy-i-Kalím' });
    expect(anchorFor(g, 'the ablest of His brothers')).toEqual({ id: 101, canonical: 'Áqáy-i-Kalím' });
    expect(anchorFor(g, 'Ṣubḥ-i-Azal')).toEqual({ id: 202, canonical: 'Mírzá Yaḥyá' });
  });

  it('anchorFor folds apostrophes and case (diacritics preserved — translit-invariance is upstream)', () => {
    const g = loadGazetteer(SAMPLE);
    expect(anchorFor(g, '  áQÁY-i-kalím  ')?.id).toBe(101);                 // case + surrounding whitespace
    expect(anchorFor(g, 'Mullá Muḥammad-‘Alíy-i-Zanjání')?.id).toBe(303);
    expect(anchorFor(g, 'Mullá Muḥammad-ʼAlíy-i-Zanjání')?.id).toBe(303);   // variant apostrophe folded away
    expect(anchorFor(g, 'Aqay-i-Kalim')).toBeNull();                        // ASCII (diacritic-stripped) is NOT folded here
  });

  it('anchorFor returns null for an unknown name', () => {
    expect(anchorFor(loadGazetteer(SAMPLE), 'Nabíl-i-Aʼẓam')).toBeNull();
  });

  it('guardedPair detects a ≠namesake pair in either order, folded', () => {
    const g = loadGazetteer(SAMPLE);
    expect(guardedPair(g, 'Áqáy-i-Kalím', 'Ḥájí Mírzá Músáy-i-Qumí')).toBe(true);
    expect(guardedPair(g, 'Ḥájí Mírzá Músáy-i-Qumí', 'Áqáy-i-Kalím')).toBe(true); // reversed
    expect(guardedPair(g, 'ÁQÁY-I-KALÍM', 'ḥájí mírzá músáy-i-qumí')).toBe(true); // case-folded
  });

  it('guardedPair is false for an un-guarded pair', () => {
    const g = loadGazetteer(SAMPLE);
    expect(guardedPair(g, 'Áqáy-i-Kalím', 'Mírzá Yaḥyá')).toBe(false);
  });
});
