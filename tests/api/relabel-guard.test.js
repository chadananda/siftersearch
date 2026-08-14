// A language relabel is not cosmetic: a document relabelled to a language the extraction models cannot
// handle is PARKED by the language-capability gate and never grounds again. So a wrong relabel silently
// removes a book from the pipeline.
//
// Found live (2026-08-14): "Preliminary Bibliography of works in French making mention of the Babi or
// Baha'i religions" was proposed en → fr. It is an ENGLISH work whose body is largely French titles —
// exactly what a content-based detector misreads.
import { describe, it, expect } from 'vitest';
import { checkRelabelProposal } from '../../api/lib/text/relabel-guard.js';

describe('an English work ABOUT foreign sources is held, not relabelled', () => {
  it('holds the real false positive from the queue', () => {
    const r = checkRelabelProposal({ title: 'Preliminary Bibliography of works in French making mention of the Babi or Baha\'i religions (1945-2000)', to: 'fr' });
    expect(r.apply).toBe(false);
    expect(r.reason).toMatch(/work ABOUT fr sources/);
  });

  it.each([
    ['Index of French Baha\'i periodicals', 'fr'],
    ['Catalogue of Persian manuscripts', 'fa'],
    ['A Survey of German Baha\'i literature', 'de'],
    ['Translations of Spanish tablets', 'es'],
  ])('holds %s', (title, to) => {
    expect(checkRelabelProposal({ title, to }).apply).toBe(false);
  });
});

describe('genuine foreign works still relabel', () => {
  it.each([
    ['Les Behahis et le Bâb', 'fr'],
    ['La refutation des mythes: Les theories du complot en Iran', 'fr'],
    ['Die Funf Grossen Religionen', 'de'],
    ['Pensamientos varios de un economista mistico', 'es'],
  ])('applies %s', (title, to) => {
    expect(checkRelabelProposal({ title, to }).apply).toBe(true);
  });

  it('a filename-ish title carries no signal, so the body decides — as it should', () => {
    // journal_constantinople_* IS a French newspaper; its title says nothing either way.
    const r = checkRelabelProposal({ title: 'journal_constantinople_1848-05-11_p1', to: 'fr' });
    expect(r.apply).toBe(true);
    expect(r.reason).toMatch(/no contrary signal/);
  });

  it('title orthography corroborates rather than merely permitting', () => {
    expect(checkRelabelProposal({ title: 'Le Bâb et les Béhahis', to: 'fr' }).reason).toMatch(/corroborates/);
  });
});

describe('the guard HOLDS rather than rejects', () => {
  it('never claims the detector is wrong — only that the evidence is too weak to act unattended', () => {
    const r = checkRelabelProposal({ title: 'Bibliography of works in French', to: 'fr' });
    expect(r.apply).toBe(false);
    expect(r.reason).not.toMatch(/wrong|incorrect|reject/i);
  });
});
