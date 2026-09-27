// Person-catalog review: prompt + parse (pure). The runner is scripts/entity-catalog-review.mjs.
export const CATALOG_VERSION = 1;
export const KINDS = ['individual', 'title_of', 'group', 'work', 'place', 'concept', 'junk'];

export const SYSTEM = `You audit a catalog of PERSON records built from Bahá'í and Bábí histories. Each record should be ONE real individual. Classify each numbered record:
- "individual": one specific human being, named (a given name, with or without honorifics, nisba or epithet), even if obscure.
- "title_of": NOT a separate person but a title, epithet, office-holder phrase or alternate name of a SPECIFIC well-known figure — give that figure's usual name in "same_as". Examples: "Centre of the Covenant" → ‘Abdu’l-Bahá; "Siyyid of Shíráz", "the Primal Point" → the Báb; "the Blessed Beauty" → Bahá’u’lláh; "Bábu’l-Báb" → Mullá Ḥusayn-i-Bushrú’í. Only when the records' own summary/claims make the identity certain.
- "group": a family, community, sect, party or plural ("Bábís", "the Afnáns", "Seven Martyrs").
- "work": a book, tablet or text ("Bayán", "Kitáb-i-Íqán").
- "place": a place or building.
- "concept": an idea, station or role that is not one person ("the Qá’im" as an awaited figure, "the Deliverer").
- "junk": not a name at all — a fragment, a common word, a bare honorific ("ḤÁJÍ MÍRZÁ"), a bare nisba ("Shírází"), a pronoun.
Rules: judge from the record's name, aliases, summary and claims, not from name similarity alone. Namesakes are separate individuals — never mark a person title_of a famous namesake just because the names are alike ("Mullá Ḥusayn, the marksman of Nayríz" is an individual, not Mullá Ḥusayn-i-Bushrú’í). When unsure, "individual".
Why: this decides which records are merged into central figures or removed; a wrong merge fabricates history.
Return ONLY JSON: {"records":[{"n":<number>,"kind":"...","same_as":"<figure or null>","confidence":0.0-1.0,"reason":"<=12 words"}]}`;

export function buildUser(records) {
  return 'RECORDS:\n' + records.map((r, i) => `${i + 1}. "${r.name}"${r.aliases?.length ? ` | aliases: ${r.aliases.slice(0, 6).join('; ')}` : ''}`
    + `${r.summary ? ` | summary: ${String(r.summary).slice(0, 180)}` : ''}${r.claims?.length ? ` | claims: ${r.claims.slice(0, 2).map((c) => String(c).slice(0, 90)).join(' / ')}` : ''}`
    + ` | mentions: ${r.mentions ?? 0}`).join('\n');
}

export function parseReview(raw, n) {
  const m = String(raw || '').match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    const out = new Array(n).fill(null);
    for (const r of JSON.parse(m[0]).records || []) {
      const i = Number(r.n) - 1;
      if (i >= 0 && i < n && KINDS.includes(r.kind)) out[i] = { kind: r.kind, same_as: r.kind === 'title_of' ? (r.same_as || null) : null,
        confidence: Number(r.confidence) || null, reason: String(r.reason || '').slice(0, 120) };
    }
    return out;
  } catch { return null; }
}
