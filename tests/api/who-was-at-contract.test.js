/**
 * The "who was at this event" rule (BA lock, 2026-08-28).
 *
 * The page's answer is the intersection of TWO NODE ROSTERS and nothing else:
 *   event node  → participants with relation `participated-in`
 *   group node  → participants with relation `letter-of-the-living`
 *
 * Each exclusion below fails for a DIFFERENT reason, which is why all four are fixtures:
 *   Mullá Ḥusayn        a Letter, but `visited` — labelled, not attended
 *   Mullá Báqir         a Letter, but absent from the event node (a claim elsewhere does not admit him)
 *   Bahá'u'lláh         participated-in, but not a Letter
 *   Shoghi Effendi      neither
 */
import { describe, it, expect } from 'vitest';
import { intersectRosters } from '../../src/lib/who-was-at.js';

const ev = (id, name, ...relations) => ({ id, name, relations, evidence: relations.map((r) => ({
  relation: r, statement: `${name} — ${r} Badasht conference`, source: 'God Passes By', paraId: 'para_88' })) });

const EVENT = { name: 'Badasht Conference', participants: [
  ev(1, 'Quddús', 'participated-in'),
  ev(2, 'Ṭáhirih', 'participated-in'),
  ev(3, 'Mírzá Muḥammad-‘Alíy-i-Qazvíní', 'participated-in'),
  ev(4, 'Mírzá Hádí', 'participated-in'),
  ev(5, 'Mullá Ḥusayn', 'visited'),
  ev(9, "Bahá'u'lláh", 'participated-in', 'host-of'),
] };
const GROUP = { name: 'the Letters of the Living', participants: [
  ev(1, 'Quddús', 'letter-of-the-living'),
  ev(2, 'Ṭáhirih', 'letter-of-the-living'),
  ev(3, 'Mírzá Muḥammad-‘Alíy-i-Qazvíní', 'letter-of-the-living'),
  ev(4, 'Mírzá Hádí', 'letter-of-the-living'),
  ev(5, 'Mullá Ḥusayn', 'letter-of-the-living'),
  ev(6, 'Mullá Báqir-i-Tabrízí', 'letter-of-the-living', 'companion_of'),
] };

describe('intersectRosters', () => {
  const r = intersectRosters({ event: EVENT, group: GROUP });
  const names = r.attendees.map((p) => p.name);

  it('returns members who are participants — both rosters, both relations', () => {
    expect(names).toEqual(['Quddús', 'Ṭáhirih', 'Mírzá Muḥammad-‘Alíy-i-Qazvíní', 'Mírzá Hádí']);
  });

  it('VISITED IS NOT ATTENDED — Mullá Ḥusayn is out of the answer', () => {
    expect(names).not.toContain('Mullá Ḥusayn');
  });

  it('but still SHOWS him, labelled, rather than silently dropping him', () => {
    const other = r.otherRelations.find((p) => p.name === 'Mullá Ḥusayn');
    expect(other).toBeDefined();
    expect(other.relations).toContain('visited');
  });

  it('a member absent from the EVENT node is out, whatever a search says elsewhere', () => {
    expect(names).not.toContain('Mullá Báqir-i-Tabrízí');
    expect(r.membersNotAtEvent.map((p) => p.name)).toContain('Mullá Báqir-i-Tabrízí');
  });

  it('a participant who is not a member is out', () => {
    expect(names).not.toContain("Bahá'u'lláh");
    expect(r.otherRelations.map((p) => p.name)).not.toContain('Shoghi Effendi');
  });

  it('every attendee carries citable evidence', () => {
    for (const p of r.attendees) {
      expect(p.evidence.length).toBeGreaterThan(0);
      for (const f of ['relation', 'statement', 'source', 'paraId']) expect(p.evidence[0]).toHaveProperty(f);
    }
  });

  it('attendee evidence is the EVENT edge, not the membership edge', () => {
    for (const p of r.attendees) expect(p.evidence.every((e) => e.relation === 'participated-in')).toBe(true);
  });

  it('asserts no headcount — an empty group yields an empty answer, not a fallback', () => {
    expect(intersectRosters({ event: EVENT, group: { participants: [] } }).attendees).toEqual([]);
  });
});
