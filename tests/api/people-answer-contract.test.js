/**
 * ONE ANSWER, NOT THREE.
 *
 * people/search returned three views of the same question that disagreed:
 *   people[]  Quddús, Ṭáhirih, Mullá Báqir-i-Tabrízí, Mírzá Muḥammad-‘Alíy-i-Qazvíní, Mírzá Hádí
 *   ids       [Bahá'u'lláh, Ṭáhirih, Quddús, Mírzá Hádí]   ← names a non-member, misses two members
 *   reasoning "Bahá'u'lláh [presided over that conference…]"  ← leads with the non-member
 *
 * Agents read `ids`. A second list that contradicts the answer is worse than no list, and "aligning" it by
 * putting Bahá'u'lláh back into people[] would undo the membership rule (he is not a Letter of the Living).
 *
 * BA: people[] is THE answer. ids is a projection of it or it is absent. reasoning follows the same rule.
 */
import { describe, it, expect } from 'vitest';
import { alignAnswer } from '../../api/lib/people-answer.js';

const PEOPLE = [
  { id: 1247552, name: 'Quddús', evidence: [{ relation: 'participated-in', statement: 'Quddús — participated-in Badasht conference' }] },
  { id: 1247554, name: 'Ṭáhirih', evidence: [{ relation: 'participated-in', statement: 'Ṭáhirih — participated-in conference of Badasht' }] },
  { id: 1247595, name: 'Mullá Báqir-i-Tabrízí', evidence: [{ relation: 'participated-in', statement: 'Mullá Báqir-i-Tabrízí — participated-in Badasht' }] },
];
// Exactly the live shape: a non-member first, and two members missing.
const BASE = {
  q: 'Letters of the Living who participated in Badasht',
  group: 1247655,
  ids: [1247562, 1247554, 1247552, 1249584],
  reasoning: {
    summary: "Bahá'u'lláh [presided over that conference](https://x/?paraId=para_86); Ṭáhirih [appeared suddenly, adorned yet unveiled](https://x/?paraId=para_91); Quddús [seated herself on the right-hand](https://x/?paraId=para_88)",
    evidence: { 1247552: ['a'], 1247554: ['b'], 1247562: ['c'], 1249584: ['d'] },
  },
};

describe('people/search speaks with one voice', () => {
  const out = alignAnswer({ base: BASE, people: PEOPLE });

  it('ids is absent, or EXACTLY the people[] id list', () => {
    if ('ids' in out) expect(out.ids).toEqual(PEOPLE.map((p) => p.id));
  });

  it('ids never contains someone missing from people[]', () => {
    const allowed = new Set(PEOPLE.map((p) => p.id));
    for (const id of (out.ids || [])) expect(allowed.has(id)).toBe(true);
  });

  it('ids never omits someone people[] returned', () => {
    if ('ids' in out) for (const p of PEOPLE) expect(out.ids).toContain(p.id);
  });

  it('reasoning.summary does not name anyone outside people[]', () => {
    expect(out.reasoning?.summary || '').not.toMatch(/Bahá'u'lláh/);
  });

  it('reasoning.summary keeps the people who ARE in the answer', () => {
    const s = out.reasoning?.summary || '';
    expect(s).toMatch(/Ṭáhirih/);
    expect(s).toMatch(/Quddús/);
  });

  it('reasoning.evidence is keyed only by people[] ids', () => {
    const allowed = new Set(PEOPLE.map((p) => String(p.id)));
    for (const k of Object.keys(out.reasoning?.evidence || {})) expect(allowed.has(k)).toBe(true);
  });

  it('never invents a summary naming nobody — an empty answer says so plainly', () => {
    const empty = alignAnswer({ base: BASE, people: [] });
    expect(empty.ids || []).toEqual([]);
    expect(empty.reasoning?.summary || '').not.toMatch(/Bahá'u'lláh/);
  });
});
