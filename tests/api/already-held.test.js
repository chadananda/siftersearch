// The missing-books list reported works we already hold under a different doc row (archival husks
// vs the ingested text). These lock the containment match — and, just as importantly, its limits.
import { describe, it, expect } from 'vitest';
import { buildHeldIndex, titleTokens } from '../../api/lib/text/already-held.js';

// Real held rows from the corpus (docs with their text), as returned by the snapshot query.
const HELD = [
  { title: 'An Early Pilgrimage', author: 'May Maxwell' },
  { title: '1906 Pilgrim Notes of Ali Kuli Khan', author: 'ali-khan' },
  { title: 'Pilgrim Letter of Hooper Harris to Mr. Hoar', author: 'harris' },
  { title: 'The Pilgrimage of Louis G. Gregory', author: 'Louis G. Gregory' },
  { title: 'The Dawn-Breakers', author: 'Nabíl-i-Aʻzam' },
];

describe('already-held', () => {
  const { isHeld, heldMatch } = buildHeldIndex(HELD);

  it('names the doc it matched, so hiding a book is an auditable claim', () => {
    expect(heldMatch('1898, May Maxwell — An Early Pilgrimage', 'May Maxwell'))
      .toMatchObject({ title: 'An Early Pilgrimage' });
    expect(heldMatch('Some Entirely Unrelated Work', 'Nobody')).toBeNull();
  });

  it('matches an archival husk to the ingested text it duplicates', () => {
    expect(isHeld('1898, May Maxwell — An Early Pilgrimage', 'May Maxwell')).toBe(true);
    expect(isHeld("1906, ‘Alí-Kuli <u>Kh</u>án — Pilgrim’s Notes", '‘Alí-Kuli Khán')).toBe(true);
    expect(isHeld('1907, Hooper Harris — A Pilgrim’s Letter', 'Hooper Harris')).toBe(true);
  });

  it('folds diacritics and the scraped markup before comparing', () => {
    expect(isHeld('The Dawn-Breakers', 'Nabíl-i-A‘zam')).toBe(true);
    expect([...titleTokens('1906, ‘Alí-Kuli <u>Kh</u>án — Pilgrim’s Notes', '')].sort())
      .toEqual(['ali', 'khan', 'kuli', 'pilgrim']);
  });

  it('does NOT match a different work that merely shares a word', () => {
    expect(isHeld('1909 Pauline and Joseph Pilgrimage Ch.10', 'Ahang Rabbání')).toBe(false);
    expect(isHeld('An Early Pilgrimage to Persia', 'Someone Else')).toBe(false);
  });

  it('refuses to claim a match on too little to go on', () => {
    expect(isHeld('Notes', '')).toBe(false);          // all noise words
    expect(isHeld('Pilgrim Notes', '')).toBe(false);  // one identifying word
  });

  it('ignores archival scaffolding (box/chapter/year) when comparing', () => {
    expect([...titleTokens('1901, Agnes Parsons Box 20: Isabella D Brittingham', 'pilgrim')].sort())
      .toEqual(['agnes', 'brittingham', 'isabella', 'parsons', 'pilgrim']);
  });
});
