// entities/link — binding a claim's subject/object to an entity. Cases are the live mis-binds found by
// /api/admin/server/claim-target-audit (2026-09-26): a two-way raw-substring match bound places to people
// ("Shíráz" ⊂ "Mírzáy-i-Shírází"), descriptors to their referent ("mother of the Báb" → the Báb), and a name
// found inside another mention's descriptor ("the Báb" ⊂ "Mullá Ḥusayn (the Báb's first disciple)").
import { describe, it, expect } from 'vitest';
import { link, namesMention } from '../../api/lib/rag/entities/link.js';

describe('namesMention — a claim name refers to a mention only as the same name or a shorter form of its core', () => {
  it('same name, any diacritics/case', () => expect(namesMention('Ṭáhirih', 'Tahirih')).toBe(true));
  it('shorter form of the core name, whole words', () => expect(namesMention('Mullá Ḥusayn', 'Mullá Ḥusayn-i-Bushrú’í')).toBe(true));
  it('a parenthetical is a second name (equality only)', () => expect(namesMention('the Báb', 'Siyyid ‘Alí-Muḥammad of Shíráz (the Báb)')).toBe(true));
  it('leading "the" is not part of a name', () => expect(namesMention('the Báb', 'Báb')).toBe(true));

  it('a place is not a person whose nisba contains it', () => expect(namesMention('Shíráz', 'Mírzáy-i-Shírází')).toBe(false));
  it('never the reverse direction: a descriptor is not its referent', () => expect(namesMention('mother of the Báb', 'the Báb')).toBe(false));
  it('never into another mention’s descriptor', () => expect(namesMention('the Báb', 'Mullá Ḥusayn (the Báb’s first disciple)')).toBe(false));
  it('never a sub-word ("Mecca" in "Sharíf of Mecca" is a place, not the Sharíf)', () => expect(namesMention('Mecca', 'the Sharíf of Mecca')).toBe(false));
});

// Fake store: mentions per paragraph, claims, doc-level entities; records UPDATEs.
function fakeDeps({ mentions, claims, docEntities = [] }) {
  const updates = [];
  return {
    updates,
    deps: {
      queryAll: async (sql) => (sql.includes('FROM entity_mentions_v2 WHERE') ? mentions
        : sql.includes('FROM entity_claims') ? claims
        : sql.includes('FROM graph_entities') ? docEntities : []),
      query: async (sql, params) => { if (sql.startsWith('UPDATE entity_claims SET entity_id=?')) updates.push(params); },
    },
  };
}
const claim = (id, subject, object, para = 'p1') => ({ id, para_id: para, semantic_key: `${subject}|visited|${object}|${para}` });
const targetOf = (updates, id) => updates.find((u) => u[2] === id)?.[1] ?? null;

describe('link — binds by same-paragraph mention, never by substring', () => {
  it('binds the place mention, not the man named after it', async () => {
    const f = fakeDeps({
      mentions: [{ para_id: 'p1', resolved_as: 'the Báb', entity_id: 1 }, { para_id: 'p1', resolved_as: 'Mírzáy-i-Shírází', entity_id: 2 }, { para_id: 'p1', resolved_as: 'Shíráz', entity_id: 10 }],
      claims: [claim(100, 'the bab', 'shiraz')],
    });
    await link({ docId: 7, write: true, deps: f.deps });
    expect(targetOf(f.updates, 100)).toBe(10);
  });

  it('leaves the target unbound rather than mis-binding it', async () => {
    const f = fakeDeps({
      mentions: [{ para_id: 'p1', resolved_as: 'the Báb', entity_id: 1 }, { para_id: 'p1', resolved_as: 'Mírzáy-i-Shírází', entity_id: 2 }],
      claims: [claim(100, 'the bab', 'shiraz')],
      docEntities: [{ id: 2, canonical_name: 'father of Mírzáy-i-Shírází' }, { id: 1, canonical_name: 'the Báb' }],
    });
    await link({ docId: 7, write: true, deps: f.deps });
    expect(targetOf(f.updates, 100)).toBeNull();
  });

  it('"mother of the Báb" is not the Báb; "the Báb" is not the Mullá Ḥusayn whose descriptor mentions Him', async () => {
    const f = fakeDeps({
      mentions: [{ para_id: 'p1', resolved_as: 'Ḥájí Mubárak', entity_id: 5 }, { para_id: 'p1', resolved_as: 'the Báb', entity_id: 1 },
        { para_id: 'p2', resolved_as: 'Quddús', entity_id: 3 }, { para_id: 'p2', resolved_as: 'Mullá Ḥusayn (the Báb’s first disciple)', entity_id: 4 }],
      claims: [claim(101, 'haji mubarak', 'mother of the bab'), claim(102, 'quddus', 'the bab', 'p2')],
    });
    await link({ docId: 7, write: true, deps: f.deps });
    expect(targetOf(f.updates, 101)).toBeNull();
    expect(targetOf(f.updates, 102)).toBeNull();
  });

  it('still binds a shorter form of the mention’s name', async () => {
    const f = fakeDeps({
      mentions: [{ para_id: 'p1', resolved_as: 'Quddús', entity_id: 3 }, { para_id: 'p1', resolved_as: 'Mullá Ḥusayn-i-Bushrú’í', entity_id: 4 }],
      claims: [claim(103, 'quddus', 'mulla husayn')],
    });
    await link({ docId: 7, write: true, deps: f.deps });
    expect(f.updates.find((u) => u[2] === 103)).toEqual([3, 4, 103]);
  });

  it('writes only changed rows, and a stale mis-bind is rewritten (to the right id or to NULL)', async () => {
    const f = fakeDeps({
      mentions: [{ para_id: 'p1', resolved_as: 'the Báb', entity_id: 1 }, { para_id: 'p1', resolved_as: 'Mírzáy-i-Shírází', entity_id: 2 },
        { para_id: 'p1', resolved_as: 'Quddús', entity_id: 3 }],
      claims: [
        { ...claim(200, 'the bab', 'shiraz'), entity_id: 1, target_entity_id: 2 },   // the audit's mis-bind
        { ...claim(201, 'the bab', 'quddus'), entity_id: 1, target_entity_id: 3 },   // already right
      ],
    });
    const r = await link({ docId: 7, write: true, diff: true, deps: f.deps });
    expect(f.updates).toEqual([[1, null, 200]]);
    expect(r.changes).toEqual([expect.objectContaining({ id: 200, oldT: 2, newT: null })]);
  });

  it('an exact name beats a short form; a tie between different entities stays unbound with its reason', async () => {
    const f = fakeDeps({
      mentions: [{ para_id: 'p1', resolved_as: 'Quddús', entity_id: 3 },
        { para_id: 'p1', resolved_as: 'Mírzá Yaḥyá', entity_id: 20 }, { para_id: 'p1', resolved_as: 'Mírzá Yaḥyá-i-Núrí', entity_id: 21 },
        { para_id: 'p2', resolved_as: 'Quddús', entity_id: 3 },
        { para_id: 'p2', resolved_as: 'Bahá’u’lláh', entity_id: 1 }, { para_id: 'p2', resolved_as: 'Bahá’u’lláh (the Greatest Branch)', entity_id: 9 }],
      claims: [claim(300, 'quddus', 'mirza yahya'), claim(301, 'quddus', 'bahaullah', 'p2')],
    });
    const r = await link({ docId: 7, write: false, diff: true, deps: f.deps });
    expect(r.changes.find((c) => c.id === 300).newT).toBe(20);
    expect(r.changes.find((c) => c.id === 301)).toMatchObject({ newT: null, why: { object: 'ambiguous:1,9' } });
  });
});
