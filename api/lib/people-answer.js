// people/search answer alignment — ONE answer, not three.
//
// THE FAILURE (2026-08-28, Tester): the endpoint returned three views of the same question that disagreed
// with each other:
//   people[]   Quddús, Ṭáhirih, Mullá Báqir-i-Tabrízí, Mírzá Muḥammad-‘Alíy-i-Qazvíní, Mírzá Hádí
//   ids        [Bahá'u'lláh, Ṭáhirih, Quddús, Mírzá Hádí]     — names a non-member AND misses two members
//   reasoning  "Bahá'u'lláh [presided over that conference…]" — leads with the non-member
//
// `people[]` had been narrowed to the rule (Letter membership edge AND relation participated-in) while
// `ids` and `reasoning` still came straight from bioSearch, which answers a looser question. Agents read
// `ids`. A second list that contradicts the answer is worse than no list at all.
//
// The fix direction matters: `ids` becomes a PROJECTION of people[]. It is never "aligned" by widening
// people[] to match it, because Bahá'u'lláh is not a Letter of the Living — the roster excludes him and the
// corpus says so outright. Narrow the derived views to the answer; never widen the answer to the views.
//
// Deps: none (pure).

const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[’'`ʻʼ]/g, '').toLowerCase();

/**
 * Project `ids` and `reasoning` from the authoritative `people` list.
 * @param {{base: object, people: Array<{id:number,name:string}>}} args
 */
export function alignAnswer({ base = {}, people = [] }) {
  const ids = people.map((p) => p.id);
  const allowed = new Set(ids.map(String));

  // reasoning.summary is bioSearch's prose: "Name [quoted span](link); Name [span](link); …". Filter it by
  // SEGMENT rather than rewriting it, so the wording, the quoted spans and their paragraph links stay
  // exactly as bioSearch produced them — we are removing people, not authoring a new summary.
  const summary = String(base.reasoning?.summary || '');
  const kept = summary
    .split(/;\s+/)
    .filter((seg) => {
      const lead = fold(seg.split('[')[0]);
      return people.some((p) => {
        const n = fold(p.name);
        return lead.includes(n) || n.includes(lead.trim());
      });
    });

  const evidence = {};
  for (const [k, v] of Object.entries(base.reasoning?.evidence || {})) if (allowed.has(String(k))) evidence[k] = v;

  return {
    ...base,
    ids,
    reasoning: { ...(base.reasoning || {}), summary: kept.join('; '), evidence },
    people,
  };
}
