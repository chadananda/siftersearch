/**
 * entity_search term handling.
 *
 * THE BUG (2026-08-28): the query required EVERY token longer than 2 chars — including "the" — to appear in
 * ONE claim statement, joined by AND. So the tool failed on its own documented examples while the data was
 * sitting right there:
 *     "amanuensis"            → 11 people        "amanuensis of the Báb"  → 0
 *     "Fort Ṭabarsí"          → 12 people        "died at Fort Ṭabarsí"   → 0
 * Chat therefore got nothing back for descriptive person questions and answered "not listed in the text".
 *
 * Second fault: query terms were diacritic-stripped but the statement column was not, so "Báb" — the most
 * central figure in the corpus — matched 1 claim.
 */
import { describe, it, expect } from 'vitest';
import { searchTerms, scoreStatement, foldText } from '../../api/lib/entity-api.js';

describe('searchTerms', () => {
  it('drops stop-words that carry no evidence — "the" must never be a match requirement', () => {
    expect(searchTerms('amanuensis of the Báb')).toEqual(['amanuensis', 'bab']);
  });

  it('folds transliteration diacritics so the query can reach the stored text', () => {
    expect(searchTerms('died at Fort Ṭabarsí')).toEqual(['died', 'fort', 'tabarsi']);
    expect(searchTerms('Ḥusayn')).toEqual(['husayn']);
  });

  it('keeps stop-words only when there is nothing else — never returns empty for a real query', () => {
    expect(searchTerms('the')).toEqual(['the']);
  });

  it('returns nothing for an empty query', () => {
    expect(searchTerms('   ')).toEqual([]);
  });
});

describe('foldText', () => {
  it('folds both cases of the transliteration set', () => {
    expect(foldText('Ṭabarsí')).toBe('tabarsi');
    expect(foldText('BÁB')).toBe('bab');
    expect(foldText('Ḥájí Ṣáliḥ')).toBe('haji salih');
  });
  it("drops the ʻayn/hamza marks that split otherwise identical spellings", () => {
    expect(foldText('‘Abdu’l-Bahá')).toBe('abdul-baha');
  });
});

describe('scoreStatement', () => {
  const terms = ['amanuensis', 'bab'];

  it('SCORES A PARTIAL MATCH RATHER THAN DISCARDING IT — the whole point of the fix', () => {
    // "served as amanuensis" lacks "bab" entirely. Under AND this scored zero and the person vanished.
    expect(scoreStatement('He served as amanuensis to the Manifestation', terms)).toBeGreaterThan(0);
  });

  it('ranks a statement matching more terms above one matching fewer', () => {
    const both = scoreStatement('acted as amanuensis to the Báb', terms);
    const one = scoreStatement('acted as amanuensis', terms);
    expect(both).toBeGreaterThan(one);
  });

  it('matches across diacritics — "bab" must reach "Báb"', () => {
    expect(scoreStatement('secretary to the Báb', ['bab'])).toBeGreaterThan(0);
  });

  it('ranks an exact phrase above the same words scattered', () => {
    const phrase = scoreStatement('he was the amanuensis of the Báb in Shíráz', terms, 'amanuensis of the bab');
    const scattered = scoreStatement('the Báb later appointed an amanuensis', terms, 'amanuensis of the bab');
    expect(phrase).toBeGreaterThan(scattered);
  });

  it('scores zero when nothing matches', () => {
    expect(scoreStatement('governor of Fárs', terms)).toBe(0);
  });
});
