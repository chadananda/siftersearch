// Why typed targets are wrong, classified by the binding failure that produced them (fix the binder, not the rows).
import { describe, it, expect } from 'vitest';
import { createEncounterIndex } from '../../api/lib/encounters.js';
import { classify } from '../../api/lib/claim-target-audit.js';

const idx = createEncounterIndex({
  persons: [
    { id: 1, cn: 'the Báb', imp: 99, aliases: '[]' },
    { id: 2, cn: 'father of Mírzáy-i-Shírází', imp: 1, aliases: '["Mírzáy-i-Shírází"]' },
    { id: 3, cn: 'Siyyid Káẓim-i-Rashtí', imp: 60, aliases: '[]' },
    { id: 4, cn: 'Mullá Ḥusayn', imp: 85, aliases: '[]' },
    { id: 5, cn: 'the Báb (Siyyid ‘Alí-Muḥammad-i-Shírází)', imp: 3, aliases: '[]' },   // a duplicate entity
  ],
  groups: [], members: [], claims: [], places: ['Shíráz'],
});

describe('classify', () => {
  it('ok when the typed target is named', () => expect(classify({ st: 'Vaḥíd — met the Báb', tid: 1 }, idx).kind).toBe('ok'));
  it('ok even when a duplicate entity shares the name', () => expect(classify({ st: 'Quddús — met the Báb', tid: 1 }, idx).kind).toBe('ok'));
  it('a target that is the SUBJECT is not ok just because the statement names it', () => {
    expect(classify({ st: 'Mullá Ḥusayn — met the Báb', tid: 4 }, idx).kind).not.toBe('ok');
  });
  it('a place object typed as a person', () => expect(classify({ st: 'the Báb — visited Shíráz', tid: 2 }, idx).kind).toBe('place_object'));
  it('the object names a different person', () => {
    expect(classify({ st: 'the Báb — met Siyyid Káẓim-i-Rashtí', tid: 4 }, idx)).toMatchObject({ kind: 'names_other', other: 'Siyyid Káẓim-i-Rashtí' });
  });
  it('a pronoun object is flagged separately (coreference may be right)', () => expect(classify({ st: 'Quddús — met Him', tid: 1 }, idx).kind).toBe('pronoun_object'));
  it('a target that is no longer a live person', () => expect(classify({ st: 'x — met y', tid: 999 }, idx).kind).toBe('target_not_live'));
});
