// Search TARGET (Chad 2026-09-27): "iderne" must find Adrianople and highlight Adrianople — the entity searched for,
// under whatever name each passage uses — never a string match of the typed query.
import { describe, it, expect } from 'vitest';
import { nameOf, pickTarget, resolveTarget, markTarget } from '../../api/lib/search-target.js';

describe('nameOf — only a short, name-like query is a target lookup', () => {
  it('keeps the name, drops question words', () => {
    expect(nameOf('iderne')).toBe('iderne');
    expect(nameOf('What happened in Adrianople?')).toBe('happened Adrianople');
    expect(nameOf('What do the writings of Bahá’u’lláh say about justice and the organization of the world?')).toBeNull();
  });
});

describe('pickTarget', () => {
  const adrianople = { id: 1, name: 'Adrianople', type: 'place', mentions: 900, names: ['Adrianople', 'Adirnih', 'Edirne'] };
  const dorn = { id: 2, name: 'Boris Dorn', type: 'person', mentions: 12, names: ['Dorn'] };
  it('a misspelling lands on the entity the texts mention most, when clearly ahead', () => expect(pickTarget('iderne', [dorn, adrianople]).id).toBe(1));
  it('an exact spelling of any of its names wins outright', () => {
    expect(pickTarget('Dorn', [adrianople, dorn]).id).toBe(2);
    expect(pickTarget('Edirne', [dorn, adrianople]).id).toBe(1);
  });
  it('two sound-alikes of similar weight → no target (never guess)', () =>
    expect(pickTarget('xyz', [{ id: 3, name: 'A', mentions: 50, names: [] }, { id: 4, name: 'B', mentions: 40, names: [] }])).toBeNull());
  it('an entity no passage mentions is never a target', () => expect(pickTarget('iderne', [{ ...adrianople, mentions: 0 }])).toBeNull());
});

describe('resolveTarget', () => {
  it('resolves through the lookup and the names the texts use', async () => {
    // A PLACE: few bound mentions, but many claims point at it ("exiled to Adrianople") — that weight counts too.
    const db = { queryAll: async (sql) => (sql.includes('entity_mentions_v2')
      ? [{ id: 1, surface: 'Adrianople', n: 8 }, { id: 1, surface: 'ادرنه', n: 3 }, { id: 1, surface: 'Adirnih', n: 2 }, { id: 2, surface: 'Dorn', n: 12 }]
      : sql.includes('entity_claims') ? [{ id: 1, n: 400 }]
        : [{ id: 1, aliases: '["Edirne"]' }, { id: 2, aliases: null }]) };
    const lookup = async () => [{ id: 2, name: 'Boris Dorn', type: 'person' }, { id: 1, name: 'Adrianople', type: 'place' }];
    const t = await resolveTarget('iderne', { lookup, db });
    expect(t).toMatchObject({ id: 1, name: 'Adrianople' });
    expect(t.names).toEqual(expect.arrayContaining(['Adrianople', 'ادرنه', 'Adirnih', 'Edirne']));
  });
});

describe('markTarget — highlight the target, not the typed string', () => {
  const target = { names: ['Adrianople', 'Adirnih', 'Edirne', 'ادرنه', 'Bahá’u’lláh'] };
  it('marks the name the passage uses, whatever was typed', () =>
    expect(markTarget('Bahá’u’lláh was exiled to Adrianople in 1863.', target)).toBe('<mark>Bahá’u’lláh</mark> was exiled to <mark>Adrianople</mark> in 1863.'));
  it('diacritics and apostrophes do not stop a match; original text is kept', () =>
    expect(markTarget('from Adírnih he wrote; Baha\'u\'llah', target)).toBe('from <mark>Adírnih</mark> he wrote; <mark>Baha\'u\'llah</mark>'));
  it('marks original-script names', () => expect(markTarget('به ادرنه رفتند', target)).toBe('به <mark>ادرنه</mark> رفتند'));
  it('whole words only; nothing → null; HTML escaped', () => {
    expect(markTarget('Edirnesque', target)).toBeNull();
    expect(markTarget('<b>Edirne</b>', target)).toBe('&lt;b&gt;<mark>Edirne</mark>&lt;/b&gt;');
  });
});
